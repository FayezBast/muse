import { NextResponse } from "next/server";
import { getStaffAccess } from "../../../lib/staff-auth";
import {
  assertRateLimit,
  getRateLimitIdentity,
  rateLimitErrorResponse,
} from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertRateLimit({
      key: `staff:redirect:${getRateLimitIdentity(request)}`,
      limit: 60,
      windowSeconds: 60,
    });
    const access = await getStaffAccess();

    return NextResponse.json({
      destination: access.destination,
      role: access.isOwner ? "owner" : access.isInstructor ? "instructor" : null,
    });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return NextResponse.json({ destination: null, role: null });
  }
}
