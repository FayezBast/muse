import { NextResponse } from "next/server";
import { getOwnerDashboard } from "../../../lib/bookings";
import { StaffAuthError, requireStaff } from "../../../lib/staff-auth";
import {
  assertRateLimit,
  getRateLimitIdentity,
  rateLimitErrorResponse,
} from "../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStaff("owner");
    await assertRateLimit({
      key: `admin:overview:${getRateLimitIdentity(request)}`,
      limit: 60,
      windowSeconds: 60,
    });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    if (error instanceof StaffAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to verify staff access." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);

  try {
    return NextResponse.json(await getOwnerDashboard(searchParams.get("date")));
  } catch {
    return NextResponse.json(
      { error: "Unable to load owner dashboard." },
      { status: 500 },
    );
  }
}
