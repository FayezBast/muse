import { NextResponse } from "next/server";
import { auth } from "../../../../lib/auth-server";
import {
  DatabaseNotConfiguredError,
  getUserBooking,
  type UserBookingSummary,
} from "../../../../lib/bookings";
import { formatStudioCalendarDateTime } from "../../../../lib/booking-config";
import {
  assertRateLimit,
  getRateLimitIdentity,
  rateLimitErrorResponse,
} from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    bookingId: string;
  }>;
};

function escapeCalendarText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replace(/\r?\n/g, "\\n");
}

function compactTimestamp(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] ?? "";
}

function calendarFilename(booking: UserBookingSummary) {
  return `muse-${booking.date}-${booking.time}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildCalendarFile(booking: UserBookingSummary) {
  const dates = formatStudioCalendarDateTime(booking.date, booking.time);

  if (!dates) {
    return undefined;
  }

  const status = booking.status === "waitlist" ? "TENTATIVE" : "CONFIRMED";
  const description =
    booking.status === "waitlist"
      ? "MUSE Pilates waitlist request."
      : "MUSE Pilates booking.";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MUSE Pilates//Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:MUSE Pilates",
    "X-WR-TIMEZONE:Asia/Beirut",
    "BEGIN:VEVENT",
    `UID:${escapeCalendarText(`${booking.id}@muse-pilates`)}`,
    `DTSTAMP:${compactTimestamp()}Z`,
    `DTSTART;TZID=Asia/Beirut:${dates.start}`,
    `DTEND;TZID=Asia/Beirut:${dates.end}`,
    `SUMMARY:${escapeCalendarText(`MUSE Pilates - ${booking.sessionLabel}`)}`,
    `DESCRIPTION:${escapeCalendarText(description)}`,
    "LOCATION:MUSE Pilates",
    `STATUS:${status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}

export async function GET(request: Request, context: RouteContext) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json(
      { error: "Sign in to add this booking to your calendar." },
      { status: 401 },
    );
  }

  try {
    await assertRateLimit({
      key: `bookings:calendar:${userId}:${getRateLimitIdentity(request)}`,
      limit: 60,
      windowSeconds: 60,
    });

    const { bookingId } = await context.params;
    const booking = await getUserBooking(userId, bookingId);

    if (!booking) {
      return NextResponse.json({ error: "Booking was not found." }, { status: 404 });
    }

    const calendarFile = buildCalendarFile(booking);

    if (!calendarFile) {
      return NextResponse.json(
        { error: "Unable to create calendar file for this booking." },
        { status: 422 },
      );
    }

    return new Response(calendarFile, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": `attachment; filename="${calendarFilename(booking)}.ics"`,
        "Content-Type": "text/calendar; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Unable to create calendar file." },
      { status: 500 },
    );
  }
}
