import { NextResponse } from "next/server";
import {
  BookingValidationError,
  DatabaseNotConfiguredError,
  createBooking,
} from "../../lib/bookings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send booking details as JSON." }, { status: 400 });
  }

  try {
    return NextResponse.json(await createBooking(payload ?? {}), { status: 201 });
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "Unable to create booking." }, { status: 500 });
  }
}
