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
