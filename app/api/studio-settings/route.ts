import { NextResponse } from "next/server";
import { StaffAuthError, requireStaff } from "../../lib/staff-auth";
import { getStudioSettings, updateStudioSettings } from "../../lib/studio-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ settings: await getStudioSettings() });
  } catch {
    return NextResponse.json(
      { error: "Unable to load studio settings." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    await requireStaff("owner");
  } catch (error) {
    if (error instanceof StaffAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to verify staff access." }, { status: 500 });
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send studio settings as JSON." }, { status: 400 });
  }

  try {
    return NextResponse.json({ settings: await updateStudioSettings(payload) });
  } catch {
    return NextResponse.json(
      { error: "Unable to update studio settings." },
      { status: 500 },
    );
  }
}
