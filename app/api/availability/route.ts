import { NextResponse } from "next/server";
import {
  BookingValidationError,
  DatabaseNotConfiguredError,
  getAvailability,
} from "../../lib/bookings";
import {
  assertRateLimit,
  getRateLimitIdentity,
  rateLimitErrorResponse,
} from "../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dates = searchParams.get("dates")?.split(",") ?? [];

  try {
    await assertRateLimit({
      key: `availability:get:${getRateLimitIdentity(request)}`,
      limit: 180,
      windowSeconds: 60,
    });

    return NextResponse.json(await getAvailability(dates));
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "Unable to load availability." }, { status: 500 });
  }
}
