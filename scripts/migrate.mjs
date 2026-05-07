import { existsSync, readFileSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

for (const fileName of [".env.local", ".env"]) {
  const filePath = join(process.cwd(), fileName);

  if (!existsSync(filePath)) {
    continue;
  }

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");

    process.env[key] ??= value;
  }
}

const productionRuntime =
  process.env.NODE_ENV === "production" ||
  Boolean(process.env.RAILWAY_ENVIRONMENT) ||
  (process.env.npm_lifecycle_event === "start" &&
    process.env.ALLOW_INSECURE_LOCAL_START !== "true");
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  if (productionRuntime) {
    console.error("DATABASE_URL is required before running production migrations.");
    process.exit(1);
  }

  console.log("DATABASE_URL is not set; skipping migrations for local development.");
  process.exit(0);
}

const { Pool } = pg;
const rootDir = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const migrationsDir = join(rootDir, "migrations");

function getPostgresSslMode(connectionString) {
  const envSslMode = process.env.PGSSLMODE?.toLowerCase();

  if (envSslMode) {
    return envSslMode;
  }

  try {
    return new URL(connectionString).searchParams.get("sslmode")?.toLowerCase();
  } catch {
    return undefined;
  }
}

function removePostgresSslMode(connectionString) {
  try {
    const url = new URL(connectionString);

    if (!url.searchParams.has("sslmode")) {
      return connectionString;
    }

    url.searchParams.delete("sslmode");
    return url.toString();
  } catch {
    return connectionString;
  }
}

function getPostgresSslConfig(connectionString) {
  const sslMode = getPostgresSslMode(connectionString);

  if (!sslMode || sslMode === "disable") {
    return undefined;
  }

  if (sslMode === "verify-ca" || sslMode === "verify-full") {
    return { rejectUnauthorized: true };
  }

  return { rejectUnauthorized: false };
}

function getPostgresConnectionConfig(connectionString) {
  return {
    connectionString: removePostgresSslMode(connectionString),
    ssl: getPostgresSslConfig(connectionString),
  };
}

const pool = new Pool({
  ...getPostgresConnectionConfig(databaseUrl),
  max: 1,
});

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function runMigration(client, fileName, sql) {
  await client.query("BEGIN");

  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('muse_schema_migrations'));");
    const existing = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1;",
      [fileName],
    );

    if (existing.rowCount === 0) {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1);", [fileName]);
      console.log(`Applied migration ${fileName}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main() {
  const client = await pool.connect();

  try {
    await ensureMigrationTable(client);
    const migrationFiles = (await readdir(migrationsDir))
      .filter((fileName) => fileName.endsWith(".sql"))
      .sort();

    for (const fileName of migrationFiles) {
      const sql = await readFile(join(migrationsDir, fileName), "utf8");
      await runMigration(client, fileName, sql);
    }

    console.log("Database migrations are up to date.");
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Migration failed.");
  process.exit(1);
});
