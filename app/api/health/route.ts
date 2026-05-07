import { NextResponse } from "next/server";
import { checkDatabaseHealth, isProductionRuntime } from "../../lib/database";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const database = await checkDatabaseHealth();

    if (!database.ok && isProductionRuntime()) {
      return NextResponse.json(
        { ok: false, database: "not_configured" },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      database: database.configured ? "ok" : "dev_not_configured",
    });
  } catch {
    return NextResponse.json({ ok: false, database: "unavailable" }, { status: 503 });
  }
}
