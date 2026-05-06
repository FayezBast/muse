import { NextResponse } from "next/server";
import { getOwnerDashboard } from "../../../lib/bookings";
import { StaffAuthError, requireStaff } from "../../../lib/staff-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await requireStaff("owner");
  } catch (error) {
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
