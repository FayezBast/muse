import { NextResponse } from "next/server";
import { queueBookingNotifications } from "../../lib/email-queue";
import { sendBookingCancellationNotifications } from "../../lib/email";
import { auth, clerkClient } from "../../lib/auth-server";
import {
  type BookingOwner,
  BookingValidationError,
  DatabaseNotConfiguredError,
  cancelUserBooking,
  createBooking,
  getUserBookings,
} from "../../lib/bookings";
import {
  assertRateLimit,
  getRateLimitIdentity,
  rateLimitErrorResponse,
} from "../../lib/rate-limit";
import {
  assertSameOrigin,
  jsonError,
  parseJsonBody,
} from "../../lib/security";
import { bookingInputSchema, cancelBookingSchema } from "../../lib/validation";

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

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Sign in to view your bookings." }, { status: 401 });
  }

  try {
    await assertRateLimit({
      key: `bookings:get:${userId}:${getRateLimitIdentity(request)}`,
      limit: 60,
      windowSeconds: 60,
    });

    return NextResponse.json({ bookings: await getUserBookings(userId) });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "Unable to load your bookings." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let owner: BookingOwner | undefined;

  try {
    assertSameOrigin(request);
    owner = await getAuthenticatedBookingOwner();
  } catch (error) {
    const securityResponse = jsonError(error, "Unable to verify your account.");

    if (securityResponse.status !== 500) {
      return securityResponse;
    }

    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to verify your account." }, { status: 500 });
  }

  if (!owner) {
    return NextResponse.json({ error: "Sign in to book a class." }, { status: 401 });
  }

  try {
    await assertRateLimit({
      key: `bookings:post:${owner.userId}:${getRateLimitIdentity(request)}`,
      limit: 8,
      windowSeconds: 60,
    });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return NextResponse.json({ error: "Unable to protect booking endpoint." }, { status: 503 });
  }

  try {
    const payload = await parseJsonBody(request, bookingInputSchema);
    const result = await createBooking(owner, {
      ...payload,
      idempotencyKey:
        request.headers.get("idempotency-key") ?? payload.idempotencyKey,
    });
    const notificationResult = await queueBookingNotifications(result.notification);

    return NextResponse.json(
      {
        booking: result.booking,
        availability: result.availability,
        notification: notificationResult,
      },
      { status: 201 },
    );
  } catch (error) {
    const validationResponse = jsonError(error, "Unable to create booking.");

    if (validationResponse.status !== 500) {
      return validationResponse;
    }

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

  try {
    assertSameOrigin(request);
    await assertRateLimit({
      key: `bookings:delete:${userId}:${getRateLimitIdentity(request)}`,
      limit: 20,
      windowSeconds: 60,
    });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const securityResponse = jsonError(error, "Unable to protect cancellation endpoint.");

    if (securityResponse.status !== 500) {
      return securityResponse;
    }

    return NextResponse.json({ error: "Unable to protect cancellation endpoint." }, { status: 503 });
  }

  try {
    const payload = await parseJsonBody(request, cancelBookingSchema);
    const result = await cancelUserBooking(userId, payload.bookingId);
    const notificationResult = result.notification
      ? await sendBookingCancellationNotifications(result.notification)
      : { status: "skipped", reason: "Cancellation notification details unavailable." };

    return NextResponse.json({
      ...result,
      notification: notificationResult,
    });
  } catch (error) {
    const validationResponse = jsonError(error, "Unable to cancel booking.");

    if (validationResponse.status !== 500) {
      return validationResponse;
    }

    if (error instanceof BookingValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof DatabaseNotConfiguredError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json({ error: "Unable to cancel booking." }, { status: 500 });
  }
}
