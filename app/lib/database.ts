import "server-only";

import { Pool } from "pg";
import { logger } from "./logger";

declare global {
  // eslint-disable-next-line no-var
  var musePgPool: Pool | undefined;
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is required in production.");
    this.name = "DatabaseNotConfiguredError";
  }
}

export class DatabaseConnectionError extends Error {
  constructor(message = "Unable to connect to the database.") {
    super(message);
    this.name = "DatabaseConnectionError";
  }
}

export function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || Boolean(process.env.RAILWAY_ENVIRONMENT);
}

export function getPool() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    if (isProductionRuntime()) {
      throw new DatabaseNotConfiguredError();
    }

    return undefined;
  }

  if (!globalThis.musePgPool) {
    globalThis.musePgPool = new Pool({
      connectionString,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : undefined,
    });

    globalThis.musePgPool.on("error", (error) => {
      logger.error("postgres_pool_error", {
        error: error instanceof Error ? error.message : "Unknown Postgres pool error",
      });
    });
  }

  return globalThis.musePgPool;
}

export async function checkDatabaseHealth() {
  const pool = getPool();

  if (!pool) {
    return { ok: false, configured: false };
  }

  try {
    await pool.query("SELECT 1;");
    return { ok: true, configured: true };
  } catch (error) {
    logger.error("postgres_healthcheck_failed", {
      error: error instanceof Error ? error.message : "Unknown database error",
    });
    throw new DatabaseConnectionError();
  }
}
