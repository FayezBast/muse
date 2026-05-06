import "server-only";

import { Pool, type QueryResultRow } from "pg";
import { CLASS_TYPES, TIME_SLOTS, getClassType, getTimeSlot } from "./booking-config";

type Queryable = {
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<{
    rows: T[];
  }>;
};

type AvailabilityClass = {
  id: string;
  label: string;
  capacity: number;
  priceCents: number;
  priceLabel: string;
  bookedCount: number;
  waitlistCount: number;
  spotsLeft: number;
  isFull: boolean;
};

type AvailabilitySlot = {
  time: string;
  classes: AvailabilityClass[];
};

export type AvailabilityResponse = {
  dates: {
    date: string;
    slots: AvailabilitySlot[];
  }[];
};

export type BookingInput = {
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  session?: unknown;
  date?: unknown;
  time?: unknown;
  notes?: unknown;
};

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export class BookingValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BookingValidationError";
  }
}

declare global {
  // eslint-disable-next-line no-var
  var musePgPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var museBookingSchemaReady: Promise<void> | undefined;
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new DatabaseNotConfiguredError();
  }

  if (!globalThis.musePgPool) {
    globalThis.musePgPool = new Pool({
      connectionString,
      max: 5,
      ssl:
        process.env.PGSSLMODE === "require" || process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }

  return globalThis.musePgPool;
}

async function createSchema(queryable: Queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      session TEXT NOT NULL,
      class_date DATE NOT NULL,
      class_time TEXT NOT NULL,
      request_type TEXT NOT NULL CHECK (request_type IN ('booking', 'waitlist')),
      status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlist', 'cancelled')),
      notes TEXT,
      price_cents INTEGER NOT NULL,
      capacity_snapshot INTEGER NOT NULL
    );
  `);

  await queryable.query(`
    CREATE INDEX IF NOT EXISTS bookings_lookup_idx
      ON bookings (class_date, class_time, session, status);
  `);
}

export async function ensureBookingSchema() {
  if (!globalThis.museBookingSchemaReady) {
    globalThis.museBookingSchemaReady = createSchema(getPool()).catch((error) => {
      globalThis.museBookingSchemaReady = undefined;
      throw error;
    });
  }

  await globalThis.museBookingSchemaReady;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function cleanText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeDates(dates: string[]) {
  const cleanDates = Array.from(
    new Set(dates.map((date) => date.trim()).filter((date) => isIsoDate(date))),
  );

  if (cleanDates.length === 0) {
    throw new BookingValidationError("At least one valid date is required.");
  }

  return cleanDates.slice(0, 31);
}

function buildDefaultAvailability(dates: string[]): AvailabilityResponse {
  return {
    dates: dates.map((date) => ({
      date,
      slots: TIME_SLOTS.map((slot) => ({
        time: slot.time,
        classes: CLASS_TYPES.map((classType) => ({
          id: classType.id,
          label: classType.label,
          capacity: classType.capacity,
          priceCents: classType.priceCents,
          priceLabel: classType.priceLabel,
          bookedCount: 0,
          waitlistCount: 0,
          spotsLeft: classType.capacity,
          isFull: false,
        })),
      })),
    })),
  };
}

function getAvailabilityClass(
  availability: AvailabilityResponse,
  date: string,
  time: string,
  session: string,
) {
  return availability.dates
    .find((day) => day.date === date)
    ?.slots.find((slot) => slot.time === time)
    ?.classes.find((classType) => classType.id === session);
}

export async function getAvailability(dates: string[]): Promise<AvailabilityResponse> {
  const normalizedDates = normalizeDates(dates);
  await ensureBookingSchema();

  const availability = buildDefaultAvailability(normalizedDates);
  const result = await getPool().query<{
    class_date: string;
    class_time: string;
    session: string;
    status: "confirmed" | "waitlist";
    total: number;
  }>(
    `
      SELECT
        to_char(class_date, 'YYYY-MM-DD') AS class_date,
        class_time,
        session,
        status,
        COUNT(*)::int AS total
      FROM bookings
      WHERE class_date = ANY($1::date[])
        AND status IN ('confirmed', 'waitlist')
      GROUP BY class_date, class_time, session, status;
    `,
    [normalizedDates],
  );

  for (const row of result.rows) {
    const classAvailability = getAvailabilityClass(
      availability,
      row.class_date,
      row.class_time,
      row.session,
    );

    if (!classAvailability) {
      continue;
    }

    if (row.status === "confirmed") {
      classAvailability.bookedCount = row.total;
    } else {
      classAvailability.waitlistCount = row.total;
    }
  }

  for (const day of availability.dates) {
    for (const slot of day.slots) {
      for (const classAvailability of slot.classes) {
        classAvailability.spotsLeft = Math.max(
          classAvailability.capacity - classAvailability.bookedCount,
          0,
        );
        classAvailability.isFull = classAvailability.spotsLeft === 0;
      }
    }
  }

  return availability;
}

function normalizeBookingInput(input: BookingInput) {
  const name = cleanText(input.name);
  const email = cleanText(input.email).toLowerCase();
  const phone = cleanText(input.phone);
  const session = cleanText(input.session);
  const date = cleanText(input.date);
  const time = cleanText(input.time);
  const notes = cleanText(input.notes);
  const classType = getClassType(session);
  const timeSlot = getTimeSlot(time);

  if (!name) {
    throw new BookingValidationError("Full name is required.");
  }

  if (!email || !email.includes("@")) {
    throw new BookingValidationError("A valid email address is required.");
  }

  if (!classType) {
    throw new BookingValidationError("Choose Reformer or Mat Pilates.");
  }

  if (!isIsoDate(date)) {
    throw new BookingValidationError("Choose a valid date.");
  }

  if (!timeSlot) {
    throw new BookingValidationError("Choose a valid class time.");
  }

  return {
    name: name.slice(0, 160),
    email: email.slice(0, 220),
    phone: phone.slice(0, 80),
    session: classType.id,
    date,
    time: timeSlot.time,
    notes: notes.slice(0, 2000),
    classType,
  };
}

export async function createBooking(input: BookingInput) {
  const booking = normalizeBookingInput(input);

  await ensureBookingSchema();

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1));", [
      `${booking.date}|${booking.time}|${booking.session}`,
    ]);

    const countResult = await client.query<{ booked_count: number }>(
      `
        SELECT COUNT(*)::int AS booked_count
        FROM bookings
        WHERE class_date = $1::date
          AND class_time = $2
          AND session = $3
          AND status = 'confirmed';
      `,
      [booking.date, booking.time, booking.session],
    );

    const bookedCount = countResult.rows[0]?.booked_count ?? 0;
    const isFull = bookedCount >= booking.classType.capacity;
    const status = isFull ? "waitlist" : "confirmed";
    const requestType = isFull ? "waitlist" : "booking";

    const insertResult = await client.query<{
      id: string;
      created_at: string;
      request_type: "booking" | "waitlist";
      status: "confirmed" | "waitlist";
    }>(
      `
        INSERT INTO bookings (
          name,
          email,
          phone,
          session,
          class_date,
          class_time,
          request_type,
          status,
          notes,
          price_cents,
          capacity_snapshot
        )
        VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)
        RETURNING id, created_at, request_type, status;
      `,
      [
        booking.name,
        booking.email,
        booking.phone || null,
        booking.session,
        booking.date,
        booking.time,
        requestType,
        status,
        booking.notes || null,
        booking.classType.priceCents,
        booking.classType.capacity,
      ],
    );

    await client.query("COMMIT");

    return {
      booking: {
        id: insertResult.rows[0]?.id,
        createdAt: insertResult.rows[0]?.created_at,
        requestType: insertResult.rows[0]?.request_type,
        status: insertResult.rows[0]?.status,
        session: booking.session,
        sessionLabel: booking.classType.label,
        date: booking.date,
        time: booking.time,
        priceCents: booking.classType.priceCents,
        priceLabel: booking.classType.priceLabel,
      },
      availability: await getAvailability([booking.date]),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
