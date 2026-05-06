export const CLASS_TYPES = [
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
] as const;

export type ClassTypeId = (typeof CLASS_TYPES)[number]["id"];

export const TIME_SLOTS = [
  {
    time: "10:30 AM",
    title: "Morning Class Slot",
    subtitle: "Choose Reformer or Mat Pilates when booking.",
    duration: "50 min",
  },
  {
    time: "6:00 PM",
    title: "Evening Class Slot",
    subtitle: "Choose Reformer or Mat Pilates when booking.",
    duration: "50 min",
  },
] as const;

export const STUDIO_TIME_ZONE = "Asia/Beirut";

export const MAX_GUESTS_PER_TIME = CLASS_TYPES.reduce(
  (total, classType) => total + classType.capacity,
  0,
);

export function getClassType(id: string) {
  return CLASS_TYPES.find((classType) => classType.id === id);
}

export function getTimeSlot(time: string) {
  return TIME_SLOTS.find((slot) => slot.time === time);
}

function getTimeSlotMinutes(time: string) {
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

function getStudioNowParts(now = new Date()) {
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

export function isTimeSlotPast(dateIso: string, time: string, now = new Date()) {
  const slotMinutes = getTimeSlotMinutes(time);

  if (!dateIso || slotMinutes === undefined) {
    return false;
  }

  const studioNow = getStudioNowParts(now);

  if (dateIso < studioNow.dateIso) {
    return true;
  }

  if (dateIso > studioNow.dateIso) {
    return false;
  }

  return studioNow.minutes >= slotMinutes;
}
