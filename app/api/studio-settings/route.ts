import { NextResponse } from "next/server";
import { StaffAuthError, requireStaff } from "../../lib/staff-auth";
import { getStudioSettings, updateStudioSettings } from "../../lib/studio-settings";
import {
  assertRateLimit,
  getRateLimitIdentity,
  rateLimitErrorResponse,
} from "../../lib/rate-limit";
import { assertSameOrigin, jsonError, parseJsonBody } from "../../lib/security";
import { studioSettingsSchema } from "../../lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await assertRateLimit({
      key: `settings:get:${getRateLimitIdentity(request)}`,
      limit: 120,
      windowSeconds: 60,
    });

    return NextResponse.json({ settings: await getStudioSettings() });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return NextResponse.json(
      { error: "Unable to load studio settings." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    await requireStaff("owner");
    await assertRateLimit({
      key: `settings:patch:${getRateLimitIdentity(request)}`,
      limit: 20,
      windowSeconds: 60,
    });
  } catch (error) {
    const rateLimitResponse = rateLimitErrorResponse(error);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const securityResponse = jsonError(error, "Unable to verify staff access.");

    if (securityResponse.status !== 500) {
      return securityResponse;
    }

    if (error instanceof StaffAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return NextResponse.json({ error: "Unable to verify staff access." }, { status: 500 });
  }

  try {
    const payload = await parseJsonBody(request, studioSettingsSchema, 32_768);

    return NextResponse.json({ settings: await updateStudioSettings(payload) });
  } catch (error) {
    const validationResponse = jsonError(error, "Unable to update studio settings.");

    if (validationResponse.status !== 500) {
      return validationResponse;
    }

    return NextResponse.json(
      { error: "Unable to update studio settings." },
      { status: 500 },
    );
  }
}
