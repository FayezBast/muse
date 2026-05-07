import { describe, expect, it } from "vitest";
import {
  formatStudioCalendarDateTime,
  getStudioTodayIso,
  isTimeSlotPast,
  isWithinCancellationCutoff,
} from "./booking-config";

describe("studio timezone helpers", () => {
  it("derives today from Beirut time instead of the local machine timezone", () => {
    expect(getStudioTodayIso(new Date("2026-05-06T21:30:00.000Z"))).toBe(
      "2026-05-07",
    );
  });

  it("marks a class as past at the studio wall-clock start time", () => {
    expect(
      isTimeSlotPast("2026-05-07", "10:30 AM", new Date("2026-05-07T07:29:00.000Z")),
    ).toBe(false);
    expect(
      isTimeSlotPast("2026-05-07", "10:30 AM", new Date("2026-05-07T07:30:00.000Z")),
    ).toBe(true);
  });

  it("enforces the four-hour cancellation cutoff in studio time", () => {
    expect(
      isWithinCancellationCutoff(
        "2026-05-07",
        "10:30 AM",
        240,
        new Date("2026-05-07T03:00:00.000Z"),
      ),
    ).toBe(false);
    expect(
      isWithinCancellationCutoff(
        "2026-05-07",
        "10:30 AM",
        240,
        new Date("2026-05-07T04:00:00.000Z"),
      ),
    ).toBe(true);
  });

  it("exports calendar dates as Beirut wall-clock values", () => {
    expect(formatStudioCalendarDateTime("2026-05-07", "10:30 AM")).toEqual({
      start: "20260507T103000",
      end: "20260507T112000",
    });
  });
});
