export type ClassTypeId = "reformer" | "mat-pilates";

export type StudioClassType = {
  id: ClassTypeId;
  label: string;
  capacity: number;
  priceCents: number;
  priceLabel: string;
};

export type StudioPackage = {
  id: string;
  kicker: string;
  title: string;
  bonus: string;
  priceLabel?: string;
  points: string[];
  featured?: boolean;
};

export type StudioTimeSlot = {
  time: string;
  title: string;
  subtitle: string;
  duration: string;
  classTypeIds: readonly ClassTypeId[];
};

export const DEFAULT_CLASS_TYPES = [
  {
    id: "reformer",
    label: "Reformer",
    capacity: 4,
    priceCents: 3500,
    priceLabel: "$35",
  },
  {
    id: "mat-pilates",
    label: "Mat Pilates",
    capacity: 6,
    priceCents: 2500,
    priceLabel: "$25",
  },
] as const satisfies readonly StudioClassType[];

export const CLASS_TYPES = DEFAULT_CLASS_TYPES;

export const DEFAULT_PACKAGES: StudioPackage[] = [
  {
    id: "four-class-pack",
    kicker: "Package One",
    title: "4 Classes",
    bonus: "5th class free",
    points: [
      "Pay for 4 classes and receive 1 extra class free.",
      "Ideal if you want a shorter commitment to start.",
    ],
  },
  {
    id: "eight-class-pack",
    kicker: "Package Two",
    title: "8 Classes",
    bonus: "9th class free",
    points: [
      "Pay for 8 classes and receive 1 extra class free.",
      "Best for guests planning a more consistent routine.",
    ],
    featured: true,
  },
];

export const DEFAULT_TIME_SLOTS = [
  {
    time: "10:30 AM",
    title: "Morning Class Slot",
    subtitle: "Choose Reformer or Mat Pilates when booking.",
    duration: "50 min",
    classTypeIds: ["reformer", "mat-pilates"],
  },
  {
    time: "6:00 PM",
    title: "Evening Class Slot",
    subtitle: "Choose Reformer or Mat Pilates when booking.",
    duration: "50 min",
    classTypeIds: ["reformer", "mat-pilates"],
  },
] as const satisfies readonly StudioTimeSlot[];

export const TIME_SLOTS = DEFAULT_TIME_SLOTS;

export const STUDIO_TIME_ZONE = "Asia/Beirut";

export const MAX_GUESTS_PER_TIME = DEFAULT_CLASS_TYPES.reduce(
  (total, classType) => total + classType.capacity,
  0,
);

export function getMaxGuestsPerTime(classTypes: readonly StudioClassType[]) {
  return classTypes.reduce((total, classType) => total + classType.capacity, 0);
}

export function getTotalCapacityForTimeSlots(
  timeSlots: readonly StudioTimeSlot[],
  classTypes: readonly StudioClassType[] = DEFAULT_CLASS_TYPES,
) {
  return timeSlots.reduce(
    (total, slot) =>
      total +
      getTimeSlotClassTypes(slot, classTypes).reduce(
        (slotTotal, classType) => slotTotal + classType.capacity,
        0,
      ),
    0,
  );
}

export function getTimeSlotClassTypes(
  slot: StudioTimeSlot,
  classTypes: readonly StudioClassType[] = DEFAULT_CLASS_TYPES,
) {
  const configuredIds =
    slot.classTypeIds.length > 0
      ? slot.classTypeIds
      : classTypes.map((classType) => classType.id);
  const configuredIdSet = new Set(configuredIds);
  const filteredClassTypes = classTypes.filter((classType) =>
    configuredIdSet.has(classType.id),
  );

  return filteredClassTypes.length > 0 ? filteredClassTypes : [...classTypes];
}

export function isClassTypeAvailableForSlot(
  slot: StudioTimeSlot,
  classTypeId: ClassTypeId,
) {
  return getTimeSlotClassTypes(slot).some((classType) => classType.id === classTypeId);
}

export function formatPriceLabel(priceCents: number) {
  const dollars = priceCents / 100;

  return dollars.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
  });
}

export function getClassType(
  id: string,
  classTypes: readonly StudioClassType[] = DEFAULT_CLASS_TYPES,
) {
  return classTypes.find((classType) => classType.id === id);
}

export function getTimeSlot(
  time: string,
  timeSlots: readonly StudioTimeSlot[] = DEFAULT_TIME_SLOTS,
) {
  return timeSlots.find((slot) => slot.time === time);
}

export function getTimeSlotMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

  if (!match) {
    return undefined;
  }

  const [, rawHour, rawMinute, period] = match;
  const hour = Number(rawHour);
  const minute = Number(rawMinute);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return undefined;
  }

  const normalizedHour =
    period.toUpperCase() === "PM" ? (hour % 12) + 12 : hour % 12;

  return normalizedHour * 60 + minute;
}

export function getTimeSlotSortValue(time: string) {
  return getTimeSlotMinutes(time) ?? Number.MAX_SAFE_INTEGER;
}

export function getStudioNowParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";

  return {
    dateIso: `${getPart("year")}-${getPart("month")}-${getPart("day")}`,
    minutes: Number(getPart("hour")) * 60 + Number(getPart("minute")),
  };
}

export function getStudioTodayIso(now = new Date()) {
  return getStudioNowParts(now).dateIso;
}

export function addDaysToIsoDate(dateIso: string, days: number) {
  const [year, month, day] = dateIso.split("-").map(Number);

  if (!year || !month || !day) {
    return dateIso;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);

  return date.toISOString().slice(0, 10);
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const zonedAsUtc = Date.UTC(
    getPart("year"),
    getPart("month") - 1,
    getPart("day"),
    getPart("hour"),
    getPart("minute"),
    getPart("second"),
  );

  return (zonedAsUtc - date.getTime()) / 60_000;
}

export function getStudioClassStart(dateIso: string, time: string) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const slotMinutes = getTimeSlotMinutes(time);

  if (!year || !month || !day || slotMinutes === undefined) {
    return undefined;
  }

  const hour = Math.floor(slotMinutes / 60);
  const minute = slotMinutes % 60;
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstOffset = getTimeZoneOffsetMinutes(
    new Date(localAsUtc),
    STUDIO_TIME_ZONE,
  );
  const firstGuess = new Date(localAsUtc - firstOffset * 60_000);
  const secondOffset = getTimeZoneOffsetMinutes(firstGuess, STUDIO_TIME_ZONE);

  return new Date(localAsUtc - secondOffset * 60_000);
}

export function isWithinCancellationCutoff(
  dateIso: string,
  time: string,
  cutoffMinutes = 240,
  now = new Date(),
) {
  const start = getStudioClassStart(dateIso, time);

  if (!start) {
    return false;
  }

  return start.getTime() - now.getTime() < cutoffMinutes * 60_000;
}

export function formatStudioCalendarDateTime(
  dateIso: string,
  time: string,
  durationMinutes = 50,
) {
  const [year, month, day] = dateIso.split("-").map(Number);
  const slotMinutes = getTimeSlotMinutes(time);

  if (!year || !month || !day || slotMinutes === undefined) {
    return undefined;
  }

  const start = new Date(
    Date.UTC(year, month - 1, day, Math.floor(slotMinutes / 60), slotMinutes % 60),
  );
  const end = new Date(start);
  end.setUTCMinutes(start.getUTCMinutes() + durationMinutes);
  const compact = (date: Date) =>
    `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(
      date.getUTCDate(),
    ).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(
      date.getUTCMinutes(),
    ).padStart(2, "0")}00`;

  return {
    start: compact(start),
    end: compact(end),
  };
}

export function isTimeSlotPast(dateIso: string, time: string, now = new Date()) {
  const start = getStudioClassStart(dateIso, time);

  if (!dateIso || !start) {
    return false;
  }

  return now.getTime() >= start.getTime();
}
