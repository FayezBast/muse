import { NextResponse } from "next/server";
import { getInstructorSchedule } from "../../../lib/bookings";
import { StaffAuthError, requireStaff } from "../../../lib/staff-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStaff("instructor");
  } catch (error) {
    if (error instanceof StaffAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to verify staff access." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);

  try {
    return NextResponse.json(await getInstructorSchedule(searchParams.get("date")));
  } catch {
    return NextResponse.json(
      { error: "Unable to load instructor schedule." },
      { status: 500 },
    );
  }
}
