import "server-only";

import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var musePgPool: Pool | undefined;
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    return undefined;
  }

  if (!globalThis.musePgPool) {
    globalThis.musePgPool = new Pool({
      connectionString,
      max: 5,
      ssl:
        process.env.PGSSLMODE === "require" || process.env.DATABASE_SSL === "true"
          ? { rejectUnauthorized: false }
          : undefined,
    });
  }

  return globalThis.musePgPool;
}
