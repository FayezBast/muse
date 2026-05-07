import { describe, expect, it } from "vitest";
import {
  bookingInputSchema,
  cancelBookingSchema,
  studioSettingsSchema,
} from "./validation";

describe("API validation schemas", () => {
  it("accepts a valid booking request", () => {
    const parsed = bookingInputSchema.parse({
      name: "Fayez Bast",
      session: "reformer",
      date: "2026-05-08",
      time: "10:30 AM",
      phone: "",
      notes: "First class",
      idempotencyKey: "booking-20260508-1030-user",
    });

    expect(parsed.session).toBe("reformer");
  });

  it("rejects invalid booking dates and arbitrary class values", () => {
    expect(() =>
      bookingInputSchema.parse({
        name: "Fayez Bast",
        session: "private-session",
        date: "05/08/2026",
        time: "10:30 AM",
      }),
    ).toThrow();
  });

  it("rejects malformed cancellation payloads", () => {
    expect(() => cancelBookingSchema.parse({ bookingId: "" })).toThrow();
  });

  it("accepts owner-editable class time slots", () => {
    const parsed = studioSettingsSchema.parse({
      classTypes: [
        {
          id: "reformer",
          label: "Reformer",
          capacity: 4,
          priceCents: 3500,
        },
        {
          id: "mat-pilates",
          label: "Mat Pilates",
          capacity: 6,
          priceCents: 2500,
        },
      ],
      timeSlots: [
        {
          time: "8:15 PM",
          title: "Evening Class Slot",
          subtitle: "Choose Reformer or Mat Pilates when booking.",
          duration: "50 min",
        },
      ],
      packages: [
        {
          id: "four-class-pack",
          kicker: "Package One",
          title: "4 Classes",
          bonus: "5th class free",
          points: ["Pay for 4 classes and receive 1 extra class free."],
        },
      ],
    });

    expect(parsed.timeSlots[0]?.time).toBe("8:15 PM");
  });

  it("bounds owner-editable studio settings", () => {
    expect(() =>
      studioSettingsSchema.parse({
        classTypes: [
          {
            id: "reformer",
            label: "Reformer",
            capacity: 200,
            priceCents: 3500,
          },
        ],
        packages: [],
      }),
    ).toThrow();
  });
});
