import "server-only";

import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { dirname, join } from "path";
import { type QueryResultRow } from "pg";
import {
  TIME_SLOTS,
  STUDIO_TIME_ZONE,
  formatPriceLabel,
  getClassType,
  getTimeSlot,
  isTimeSlotPast,
  type StudioClassType,
} from "./booking-config";
import { getPool } from "./database";
import { getStudioSettings, type StudioSettings } from "./studio-settings";

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

type RequestType = "booking" | "waitlist";
type BookingStatus = "confirmed" | "waitlist";

type AvailabilityCount = {
  date: string;
  time: string;
  session: string;
  status: BookingStatus;
  total: number;
};

type StoredBooking = {
  id: string;
  createdAt: string;
  userId?: string | null;
  sessionId?: string | null;
  name: string;
  email: string;
  phone: string | null;
  session: string;
  classDate: string;
  classTime: string;
  requestType: RequestType;
  status: BookingStatus | "cancelled";
  notes: string | null;
  priceCents: number;
  capacitySnapshot: number;
};

const LOCAL_BOOKINGS_PATH = join(process.cwd(), ".next", "cache", "muse-bookings.json");

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

export type BookingOwner = {
  userId: string;
  sessionId: string;
  name: string;
  email: string;
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
  var museBookingSchemaReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var museLocalBookingQueue: Promise<unknown> | undefined;
}

async function createSchema(queryable: Queryable) {
  await queryable.query(`
    CREATE TABLE IF NOT EXISTS bookings (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      user_id TEXT,
      session_id TEXT,
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
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS user_id TEXT;
  `);

  await queryable.query(`
    ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS session_id TEXT;
  `);

  await queryable.query(`
    CREATE INDEX IF NOT EXISTS bookings_lookup_idx
      ON bookings (class_date, class_time, session, status);
  `);

  await queryable.query(`
    CREATE INDEX IF NOT EXISTS bookings_user_idx
      ON bookings (user_id, created_at DESC);
  `);
}

export async function ensureBookingSchema() {
  const pool = getPool();

  if (!pool) {
    return;
  }

  if (!globalThis.museBookingSchemaReady) {
    globalThis.museBookingSchemaReady = createSchema(pool).catch((error) => {
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

function buildDefaultAvailability(
  dates: string[],
  classTypes: readonly StudioClassType[],
): AvailabilityResponse {
  return {
    dates: dates.map((date) => ({
      date,
      slots: TIME_SLOTS.map((slot) => ({
        time: slot.time,
        classes: classTypes.map((classType) => ({
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

function applyAvailabilityCounts(
  availability: AvailabilityResponse,
  counts: AvailabilityCount[],
) {
  for (const count of counts) {
    const classAvailability = getAvailabilityClass(
      availability,
      count.date,
      count.time,
      count.session,
    );

    if (!classAvailability) {
      continue;
    }

    if (count.status === "confirmed") {
      classAvailability.bookedCount = count.total;
    } else {
      classAvailability.waitlistCount = count.total;
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

function getLocalBookingsPath() {
  return LOCAL_BOOKINGS_PATH;
}

function isStoredBooking(value: unknown): value is StoredBooking {
  if (!value || typeof value !== "object") {
    return false;
  }

  const booking = value as Record<string, unknown>;

  return (
    typeof booking.id === "string" &&
    typeof booking.createdAt === "string" &&
    (typeof booking.userId === "string" ||
      typeof booking.userId === "undefined" ||
      booking.userId === null) &&
    (typeof booking.sessionId === "string" ||
      typeof booking.sessionId === "undefined" ||
      booking.sessionId === null) &&
    typeof booking.name === "string" &&
    typeof booking.email === "string" &&
    (typeof booking.phone === "string" || booking.phone === null) &&
    typeof booking.session === "string" &&
    typeof booking.classDate === "string" &&
    typeof booking.classTime === "string" &&
    (booking.requestType === "booking" || booking.requestType === "waitlist") &&
    (booking.status === "confirmed" ||
      booking.status === "waitlist" ||
      booking.status === "cancelled") &&
    (typeof booking.notes === "string" || booking.notes === null) &&
    typeof booking.priceCents === "number" &&
    typeof booking.capacitySnapshot === "number"
  );
}

async function readLocalBookings() {
  try {
    const contents = await readFile(getLocalBookingsPath(), "utf8");
    const parsed = JSON.parse(contents) as unknown;

    return Array.isArray(parsed) ? parsed.filter(isStoredBooking) : [];
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    throw error;
  }
}

async function writeLocalBookings(bookings: StoredBooking[]) {
  const filePath = getLocalBookingsPath();
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(bookings, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function withLocalBookingLock<T>(callback: () => Promise<T>) {
  const previous = globalThis.museLocalBookingQueue ?? Promise.resolve();
  const next = previous.then(callback, callback);

  globalThis.museLocalBookingQueue = next.catch(() => undefined);

  return next;
}

function getCountsFromStoredBookings(bookings: StoredBooking[], dates: string[]) {
  const requestedDates = new Set(dates);
  const counts = new Map<string, AvailabilityCount>();

  for (const booking of bookings) {
    if (
      !requestedDates.has(booking.classDate) ||
      (booking.status !== "confirmed" && booking.status !== "waitlist")
    ) {
      continue;
    }

    const key = [
      booking.classDate,
      booking.classTime,
      booking.session,
      booking.status,
    ].join("|");
    const current = counts.get(key);

    if (current) {
      current.total += 1;
    } else {
      counts.set(key, {
        date: booking.classDate,
        time: booking.classTime,
        session: booking.session,
        status: booking.status,
        total: 1,
      });
    }
  }

  return Array.from(counts.values());
}

function buildAvailabilityFromStoredBookings(
  bookings: StoredBooking[],
  dates: string[],
  classTypes: readonly StudioClassType[],
) {
  return applyAvailabilityCounts(
    buildDefaultAvailability(dates, classTypes),
    getCountsFromStoredBookings(bookings, dates),
  );
}

export async function getAvailability(dates: string[]): Promise<AvailabilityResponse> {
  const normalizedDates = normalizeDates(dates);
  const settings = await getStudioSettings();
  const pool = getPool();

  if (!pool) {
    return buildAvailabilityFromStoredBookings(
      await readLocalBookings(),
      normalizedDates,
      settings.classTypes,
    );
  }

  await ensureBookingSchema();

  const result = await pool.query<{
    class_date: string;
    class_time: string;
    session: string;
    status: BookingStatus;
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

  return applyAvailabilityCounts(
    buildDefaultAvailability(normalizedDates, settings.classTypes),
    result.rows.map((row) => ({
      date: row.class_date,
      time: row.class_time,
      session: row.session,
      status: row.status,
      total: row.total,
    })),
  );
}

function normalizeBookingInput(
  input: BookingInput,
  owner: BookingOwner,
  settings: StudioSettings,
) {
  const name = cleanText(input.name);
  const email = cleanText(owner.email).toLowerCase();
  const phone = cleanText(input.phone);
  const session = cleanText(input.session);
  const date = cleanText(input.date);
  const time = cleanText(input.time);
  const notes = cleanText(input.notes);
  const classType = getClassType(session, settings.classTypes);
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

  if (isTimeSlotPast(date, timeSlot.time)) {
    throw new BookingValidationError("This class time is no longer available.");
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

type NormalizedBooking = ReturnType<typeof normalizeBookingInput>;

export type CreatedBookingNotificationDetails = {
  id: string;
  status: BookingStatus;
  sessionLabel: string;
  date: string;
  time: string;
  priceLabel: string;
  customerName: string;
  customerEmail: string;
  phone: string | null;
  notes: string | null;
};

export type UserBookingSummary = {
  id: string;
  createdAt: string;
  status: BookingStatus;
  session: string;
  sessionLabel: string;
  date: string;
  time: string;
  priceCents: number;
  priceLabel: string;
};

export type CancelBookingResult = {
  booking: UserBookingSummary;
  bookings: UserBookingSummary[];
  availability: AvailabilityResponse;
};

function formatCreatedAt(value: string | Date | undefined) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return value;
}

function buildBookingResponse(
  booking: Pick<StoredBooking, "id" | "createdAt" | "requestType" | "status">,
  normalizedBooking: NormalizedBooking,
) {
  return {
    id: booking.id,
    createdAt: booking.createdAt,
    requestType: booking.requestType,
    status: booking.status,
    session: normalizedBooking.session,
    sessionLabel: normalizedBooking.classType.label,
    date: normalizedBooking.date,
    time: normalizedBooking.time,
    priceCents: normalizedBooking.classType.priceCents,
    priceLabel: normalizedBooking.classType.priceLabel,
  };
}

function buildNotificationDetails(
  booking: Pick<StoredBooking, "id"> & { status: BookingStatus },
  normalizedBooking: NormalizedBooking,
): CreatedBookingNotificationDetails {
  return {
    id: booking.id,
    status: booking.status,
    sessionLabel: normalizedBooking.classType.label,
    date: normalizedBooking.date,
    time: normalizedBooking.time,
    priceLabel: normalizedBooking.classType.priceLabel,
    customerName: normalizedBooking.name,
    customerEmail: normalizedBooking.email,
    phone: normalizedBooking.phone || null,
    notes: normalizedBooking.notes || null,
  };
}

function buildUserBookingSummary(
  booking: Pick<
    StoredBooking,
    "id" | "createdAt" | "status" | "session" | "classDate" | "classTime" | "priceCents"
  >,
  classTypes: readonly StudioClassType[],
): UserBookingSummary | undefined {
  if (booking.status === "cancelled") {
    return undefined;
  }

  const classType = getClassType(booking.session, classTypes);

  return {
    id: booking.id,
    createdAt: booking.createdAt,
    status: booking.status,
    session: booking.session,
    sessionLabel: classType?.label ?? booking.session,
    date: booking.classDate,
    time: booking.classTime,
    priceCents: booking.priceCents,
    priceLabel: formatPriceLabel(booking.priceCents),
  };
}

function sortNewestFirst<T extends { createdAt: string }>(bookings: T[]) {
  return bookings.toSorted((first, second) =>
    second.createdAt.localeCompare(first.createdAt),
  );
}

function compactBookingSummaries(
  bookings: StoredBooking[],
  classTypes: readonly StudioClassType[],
) {
  return bookings
    .map((booking) => buildUserBookingSummary(booking, classTypes))
    .filter((booking): booking is UserBookingSummary => Boolean(booking));
}

function isValidBookingId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 120;
}

async function createLocalBooking(
  owner: BookingOwner,
  booking: NormalizedBooking,
  settings: StudioSettings,
) {
  return withLocalBookingLock(async () => {
    const bookings = await readLocalBookings();
    const bookedCount = bookings.filter(
      (storedBooking) =>
        storedBooking.classDate === booking.date &&
        storedBooking.classTime === booking.time &&
        storedBooking.session === booking.session &&
        storedBooking.status === "confirmed",
    ).length;
    const isFull = bookedCount >= booking.classType.capacity;
    const status: BookingStatus = isFull ? "waitlist" : "confirmed";
    const requestType: RequestType = isFull ? "waitlist" : "booking";
    const storedBooking: StoredBooking = {
      id: `local_${randomUUID()}`,
      createdAt: new Date().toISOString(),
      userId: owner.userId,
      sessionId: owner.sessionId,
      name: booking.name,
      email: booking.email,
      phone: booking.phone || null,
      session: booking.session,
      classDate: booking.date,
      classTime: booking.time,
      requestType,
      status,
      notes: booking.notes || null,
      priceCents: booking.classType.priceCents,
      capacitySnapshot: booking.classType.capacity,
    };
    const nextBookings = [...bookings, storedBooking];

    await writeLocalBookings(nextBookings);

    return {
      booking: buildBookingResponse(storedBooking, booking),
      notification: buildNotificationDetails(
        { id: storedBooking.id, status },
        booking,
      ),
      availability: buildAvailabilityFromStoredBookings(nextBookings, [
        booking.date,
      ], settings.classTypes),
    };
  });
}

export async function createBooking(owner: BookingOwner, input: BookingInput) {
  const settings = await getStudioSettings();
  const booking = normalizeBookingInput(input, owner, settings);
  const pool = getPool();

  if (!pool) {
    return createLocalBooking(owner, booking, settings);
  }

  await ensureBookingSchema();
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
    const status: BookingStatus = isFull ? "waitlist" : "confirmed";
    const requestType: RequestType = isFull ? "waitlist" : "booking";

    const insertResult = await client.query<{
      id: string;
      created_at: string | Date;
      request_type: RequestType;
      status: BookingStatus;
    }>(
      `
        INSERT INTO bookings (
          user_id,
          session_id,
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
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, $11, $12, $13)
        RETURNING id, created_at, request_type, status;
      `,
      [
        owner.userId,
        owner.sessionId,
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

    const storedBooking = {
      id: insertResult.rows[0]?.id ?? "",
      createdAt: formatCreatedAt(insertResult.rows[0]?.created_at) ?? "",
      requestType: insertResult.rows[0]?.request_type ?? requestType,
      status: insertResult.rows[0]?.status ?? status,
    };

    return {
      booking: buildBookingResponse(storedBooking, booking),
      notification: buildNotificationDetails(storedBooking, booking),
      availability: await getAvailability([booking.date]),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function getUserBookings(userId: string): Promise<UserBookingSummary[]> {
  const settings = await getStudioSettings();
  const pool = getPool();

  if (!pool) {
    const bookings = await readLocalBookings();

    return sortNewestFirst(
      compactBookingSummaries(
        bookings.filter((booking) => booking.userId === userId),
        settings.classTypes,
      ),
    ).slice(0, 50);
  }

  await ensureBookingSchema();

  const result = await pool.query<{
    id: string;
    created_at: string | Date;
    status: BookingStatus;
    session: string;
    class_date: string;
    class_time: string;
    price_cents: number;
  }>(
    `
      SELECT
        id::text AS id,
        created_at,
        status,
        session,
        to_char(class_date, 'YYYY-MM-DD') AS class_date,
        class_time,
        price_cents
      FROM bookings
      WHERE user_id = $1
        AND status IN ('confirmed', 'waitlist')
      ORDER BY created_at DESC
      LIMIT 50;
    `,
    [userId],
  );

  return result.rows
    .map((row) =>
      buildUserBookingSummary({
        id: row.id,
        createdAt: formatCreatedAt(row.created_at) ?? "",
        status: row.status,
        session: row.session,
        classDate: row.class_date,
        classTime: row.class_time,
        priceCents: row.price_cents,
      }, settings.classTypes),
    )
    .filter((booking): booking is UserBookingSummary => Boolean(booking));
}

export async function cancelUserBooking(
  userId: string,
  bookingId: unknown,
): Promise<CancelBookingResult> {
  if (!isValidBookingId(bookingId)) {
    throw new BookingValidationError("Choose a valid booking to cancel.");
  }

  const normalizedBookingId = bookingId.trim();
  const settings = await getStudioSettings();
  const pool = getPool();

  if (!pool) {
    return withLocalBookingLock(async () => {
      const bookings = await readLocalBookings();
      const bookingIndex = bookings.findIndex(
        (booking) =>
          booking.id === normalizedBookingId &&
          booking.userId === userId &&
          (booking.status === "confirmed" || booking.status === "waitlist"),
      );
      const booking = bookings[bookingIndex];

      if (!booking) {
        throw new BookingValidationError("Booking was not found.");
      }

      if (isTimeSlotPast(booking.classDate, booking.classTime)) {
        throw new BookingValidationError("This class can no longer be cancelled.");
      }

      const cancelledBooking: StoredBooking = {
        ...booking,
        status: "cancelled",
      };
      const nextBookings = bookings.toSpliced(bookingIndex, 1, cancelledBooking);
      const cancelledSummary =
        buildUserBookingSummary({
          ...cancelledBooking,
          status: booking.status,
        }, settings.classTypes) ?? undefined;

      if (!cancelledSummary) {
        throw new BookingValidationError("Unable to cancel this booking.");
      }

      await writeLocalBookings(nextBookings);

      return {
        booking: cancelledSummary,
        bookings: sortNewestFirst(
          compactBookingSummaries(
            nextBookings.filter((storedBooking) => storedBooking.userId === userId),
            settings.classTypes,
          ),
        ).slice(0, 50),
        availability: buildAvailabilityFromStoredBookings(nextBookings, [
          booking.classDate,
        ], settings.classTypes),
      };
    });
  }

  await ensureBookingSchema();
  const result = await pool.query<{
    id: string;
    created_at: string | Date;
    status: BookingStatus;
    session: string;
    class_date: string;
    class_time: string;
    price_cents: number;
  }>(
    `
      WITH target AS (
        SELECT
          id,
          created_at,
          status,
          session,
          class_date,
          class_time,
          price_cents
        FROM bookings
        WHERE id::text = $1
          AND user_id = $2
          AND status IN ('confirmed', 'waitlist')
          AND class_date >= CURRENT_DATE
        FOR UPDATE
      ),
      cancelled AS (
        UPDATE bookings
        SET status = 'cancelled'
        FROM target
        WHERE bookings.id = target.id
        RETURNING
          target.id::text AS id,
          target.created_at,
          target.status,
          target.session,
          to_char(target.class_date, 'YYYY-MM-DD') AS class_date,
          target.class_time,
          target.price_cents
        )
      SELECT * FROM cancelled;
    `,
    [normalizedBookingId, userId],
  );
  const cancelledBooking = result.rows[0];

  if (!cancelledBooking) {
    throw new BookingValidationError("Booking was not found or can no longer be cancelled.");
  }

  const summary = buildUserBookingSummary({
    id: cancelledBooking.id,
    createdAt: formatCreatedAt(cancelledBooking.created_at) ?? "",
    status: cancelledBooking.status,
    session: cancelledBooking.session,
    classDate: cancelledBooking.class_date,
    classTime: cancelledBooking.class_time,
    priceCents: cancelledBooking.price_cents,
  }, settings.classTypes);

  if (!summary) {
    throw new BookingValidationError("Unable to cancel this booking.");
  }

  return {
    booking: summary,
    bookings: await getUserBookings(userId),
    availability: await getAvailability([cancelledBooking.class_date]),
  };
}

export type StaffBookingDetail = {
  id: string;
  createdAt: string;
  name: string;
  email: string;
  phone: string | null;
  notes: string | null;
  status: BookingStatus;
  session: string;
  sessionLabel: string;
  date: string;
  time: string;
  priceCents: number;
  priceLabel: string;
};

export type StaffClassSchedule = {
  id: string;
  label: string;
  capacity: number;
  bookedCount: number;
  waitlistCount: number;
  spotsLeft: number;
  revenueCents: number;
  revenueLabel: string;
  bookings: StaffBookingDetail[];
};

export type StaffScheduleSlot = {
  time: string;
  title: string;
  subtitle: string;
  duration: string;
  bookedCount: number;
  waitlistCount: number;
  classes: StaffClassSchedule[];
};

export type InstructorScheduleResponse = {
  date: string;
  dateLabel: string;
  summary: {
    confirmed: number;
    waitlist: number;
    spotsLeft: number;
    totalCapacity: number;
  };
  slots: StaffScheduleSlot[];
};

export type OwnerDashboardResponse = {
  date: string;
  dateLabel: string;
  stats: {
    confirmedToday: number;
    waitlistToday: number;
    upcomingConfirmed: number;
    upcomingWaitlist: number;
    revenueNext30Cents: number;
    revenueNext30Label: string;
    bookedCapacityToday: number;
    totalCapacityToday: number;
  };
  classStats: {
    id: string;
    label: string;
    confirmed: number;
    waitlist: number;
    revenueCents: number;
    revenueLabel: string;
  }[];
  recentBookings: StaffBookingDetail[];
  schedule: InstructorScheduleResponse;
  settings: StudioSettings;
};

function getStudioTodayIso(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
}

function normalizeOptionalDate(date?: string | null) {
  return date && isIsoDate(date) ? date : getStudioTodayIso();
}

function addDays(dateIso: string, days: number) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().split("T")[0] ?? dateIso;
}

function formatStaffDateLabel(dateIso: string) {
  const [year, month, day] = dateIso.split("-").map(Number);

  if (!year || !month || !day) {
    return dateIso;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function isActiveStaffBooking(
  booking: StoredBooking,
): booking is StoredBooking & { status: BookingStatus } {
  return booking.status === "confirmed" || booking.status === "waitlist";
}

function getTimeSortIndex(time: string) {
  const index = TIME_SLOTS.findIndex((slot) => slot.time === time);

  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function buildStaffBookingDetail(
  booking: StoredBooking & { status: BookingStatus },
  classTypes: readonly StudioClassType[],
): StaffBookingDetail {
  const classType = getClassType(booking.session, classTypes);

  return {
    id: booking.id,
    createdAt: booking.createdAt,
    name: booking.name,
    email: booking.email,
    phone: booking.phone,
    notes: booking.notes,
    status: booking.status,
    session: booking.session,
    sessionLabel: classType?.label ?? booking.session,
    date: booking.classDate,
    time: booking.classTime,
    priceCents: booking.priceCents,
    priceLabel: formatPriceLabel(booking.priceCents),
  };
}

function buildScheduleForDate(
  bookings: StoredBooking[],
  date: string,
  settings: StudioSettings,
): InstructorScheduleResponse {
  const activeBookings = bookings
    .filter(isActiveStaffBooking)
    .filter((booking) => booking.classDate === date);
  const slots: StaffScheduleSlot[] = TIME_SLOTS.map((slot) => {
    const classes = settings.classTypes.map((classType) => {
      const classBookings = activeBookings
        .filter(
          (booking) =>
            booking.classTime === slot.time && booking.session === classType.id,
        )
        .map((booking) => buildStaffBookingDetail(booking, settings.classTypes))
        .toSorted((first, second) => {
          if (first.status !== second.status) {
            return first.status === "confirmed" ? -1 : 1;
          }

          return first.name.localeCompare(second.name);
        });
      const bookedCount = classBookings.filter(
        (booking) => booking.status === "confirmed",
      ).length;
      const waitlistCount = classBookings.filter(
        (booking) => booking.status === "waitlist",
      ).length;
      const revenueCents = classBookings
        .filter((booking) => booking.status === "confirmed")
        .reduce((total, booking) => total + booking.priceCents, 0);

      return {
        id: classType.id,
        label: classType.label,
        capacity: classType.capacity,
        bookedCount,
        waitlistCount,
        spotsLeft: Math.max(classType.capacity - bookedCount, 0),
        revenueCents,
        revenueLabel: formatPriceLabel(revenueCents),
        bookings: classBookings,
      };
    });

    return {
      time: slot.time,
      title: slot.title,
      subtitle: slot.subtitle,
      duration: slot.duration,
      bookedCount: classes.reduce((total, item) => total + item.bookedCount, 0),
      waitlistCount: classes.reduce((total, item) => total + item.waitlistCount, 0),
      classes,
    };
  });
  const totalCapacity = TIME_SLOTS.length * settings.classTypes.reduce(
    (total, classType) => total + classType.capacity,
    0,
  );
  const confirmed = activeBookings.filter(
    (booking) => booking.status === "confirmed",
  ).length;
  const waitlist = activeBookings.filter(
    (booking) => booking.status === "waitlist",
  ).length;

  return {
    date,
    dateLabel: formatStaffDateLabel(date),
    summary: {
      confirmed,
      waitlist,
      totalCapacity,
      spotsLeft: Math.max(totalCapacity - confirmed, 0),
    },
    slots,
  };
}

async function getStaffBookingsBetween(startDate: string, endDate: string) {
  const pool = getPool();

  if (!pool) {
    const bookings = await readLocalBookings();

    return bookings.filter(
      (booking) =>
        booking.classDate >= startDate &&
        booking.classDate <= endDate &&
        (booking.status === "confirmed" || booking.status === "waitlist"),
    );
  }

  await ensureBookingSchema();

  const result = await pool.query<{
    id: string;
    created_at: string | Date;
    user_id: string | null;
    session_id: string | null;
    name: string;
    email: string;
    phone: string | null;
    session: string;
    class_date: string;
    class_time: string;
    request_type: RequestType;
    status: BookingStatus | "cancelled";
    notes: string | null;
    price_cents: number;
    capacity_snapshot: number;
  }>(
    `
      SELECT
        id::text AS id,
        created_at,
        user_id,
        session_id,
        name,
        email,
        phone,
        session,
        to_char(class_date, 'YYYY-MM-DD') AS class_date,
        class_time,
        request_type,
        status,
        notes,
        price_cents,
        capacity_snapshot
      FROM bookings
      WHERE class_date BETWEEN $1::date AND $2::date
        AND status IN ('confirmed', 'waitlist')
      ORDER BY class_date ASC, class_time ASC, created_at ASC;
    `,
    [startDate, endDate],
  );

  return result.rows.map((row) => ({
    id: row.id,
    createdAt: formatCreatedAt(row.created_at) ?? "",
    userId: row.user_id,
    sessionId: row.session_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    session: row.session,
    classDate: row.class_date,
    classTime: row.class_time,
    requestType: row.request_type,
    status: row.status,
    notes: row.notes,
    priceCents: row.price_cents,
    capacitySnapshot: row.capacity_snapshot,
  }));
}

export async function getInstructorSchedule(
  requestedDate?: string | null,
): Promise<InstructorScheduleResponse> {
  const date = normalizeOptionalDate(requestedDate);
  const settings = await getStudioSettings();
  const bookings = await getStaffBookingsBetween(date, date);

  return buildScheduleForDate(bookings, date, settings);
}

export async function getOwnerDashboard(
  requestedDate?: string | null,
): Promise<OwnerDashboardResponse> {
  const date = normalizeOptionalDate(requestedDate);
  const endDate = addDays(date, 30);
  const settings = await getStudioSettings();
  const bookings = await getStaffBookingsBetween(date, endDate);
  const activeBookings = bookings.filter(isActiveStaffBooking);
  const todayBookings = activeBookings.filter((booking) => booking.classDate === date);
  const confirmedBookings = activeBookings.filter(
    (booking) => booking.status === "confirmed",
  );
  const waitlistBookings = activeBookings.filter(
    (booking) => booking.status === "waitlist",
  );
  const revenueNext30Cents = confirmedBookings.reduce(
    (total, booking) => total + booking.priceCents,
    0,
  );
  const classStats = settings.classTypes.map((classType) => {
    const classBookings = activeBookings.filter(
      (booking) => booking.session === classType.id,
    );
    const confirmed = classBookings.filter(
      (booking) => booking.status === "confirmed",
    );
    const revenueCents = confirmed.reduce(
      (total, booking) => total + booking.priceCents,
      0,
    );

    return {
      id: classType.id,
      label: classType.label,
      confirmed: confirmed.length,
      waitlist: classBookings.filter((booking) => booking.status === "waitlist")
        .length,
      revenueCents,
      revenueLabel: formatPriceLabel(revenueCents),
    };
  });
  const todayCapacity = TIME_SLOTS.length * settings.classTypes.reduce(
    (total, classType) => total + classType.capacity,
    0,
  );

  return {
    date,
    dateLabel: formatStaffDateLabel(date),
    stats: {
      confirmedToday: todayBookings.filter(
        (booking) => booking.status === "confirmed",
      ).length,
      waitlistToday: todayBookings.filter(
        (booking) => booking.status === "waitlist",
      ).length,
      upcomingConfirmed: confirmedBookings.length,
      upcomingWaitlist: waitlistBookings.length,
      revenueNext30Cents,
      revenueNext30Label: formatPriceLabel(revenueNext30Cents),
      bookedCapacityToday: todayBookings.filter(
        (booking) => booking.status === "confirmed",
      ).length,
      totalCapacityToday: todayCapacity,
    },
    classStats,
    recentBookings: activeBookings
      .map((booking) => buildStaffBookingDetail(booking, settings.classTypes))
      .toSorted((first, second) => second.createdAt.localeCompare(first.createdAt))
      .slice(0, 8),
    schedule: buildScheduleForDate(bookings, date, settings),
    settings,
  };
}
