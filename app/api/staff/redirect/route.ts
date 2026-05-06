import { NextResponse } from "next/server";
import { getStaffAccess } from "../../../lib/staff-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const access = await getStaffAccess();

    return NextResponse.json({
      destination: access.destination,
      role: access.isOwner ? "owner" : access.isInstructor ? "instructor" : null,
    });
  } catch {
    return NextResponse.json({ destination: null, role: null });
  }
}
