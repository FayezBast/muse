import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { sendBookingNotifications } from "../../lib/email";
import {
  type BookingOwner,
  BookingValidationError,
  DatabaseNotConfiguredError,
  cancelUserBooking,
  createBooking,
  getUserBookings,
} from "../../lib/bookings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getAuthenticatedBookingOwner(): Promise<BookingOwner | undefined> {
  const { sessionId, userId } = await auth();

  if (!userId || !sessionId) {
    return undefined;
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const email = user.primaryEmailAddress?.emailAddress;

  if (!email) {
    throw new BookingValidationError(
      "Add a primary email address to your account before booking.",
    );
  }

  const fallbackName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return {
    userId,
    sessionId,
    name: user.fullName || fallbackName || email,
    email,
  };
}

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your bookings." }, { status: 401 });
  }

  try {
    return NextResponse.json({ bookings: await getUserBookings(userId) });
  } catch (error) {
    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "Unable to load your bookings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let owner: BookingOwner | undefined;

  try {
    owner = await getAuthenticatedBookingOwner();
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to verify your account." }, { status: 500 });
  }

  if (!owner) {
    return NextResponse.json({ error: "Sign in to book a class." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send booking details as JSON." }, { status: 400 });
  }

  try {
    const result = await createBooking(owner, payload ?? {});
    const notificationResult = await sendBookingNotifications(result.notification);

    return NextResponse.json(
      {
        booking: result.booking,
        availability: result.availability,
        notification: notificationResult,
      },
      { status: 201 },
    );
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

export async function DELETE(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Sign in to cancel a booking." }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send cancellation details as JSON." }, { status: 400 });
  }

  try {
    const bookingId =
      payload && typeof payload === "object" && "bookingId" in payload
        ? (payload as { bookingId?: unknown }).bookingId
        : undefined;

    return NextResponse.json(await cancelUserBooking(userId, bookingId));
  } catch (error) {
    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "Unable to cancel booking." }, { status: 500 });
  }
}
