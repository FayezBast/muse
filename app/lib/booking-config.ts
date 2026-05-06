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
