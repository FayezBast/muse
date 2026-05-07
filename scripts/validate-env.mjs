import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

if (!productionRuntime) {
  process.exit(0);
}

const required = [
  "APP_URL",
  "DATABASE_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "RESEND_API_KEY",
  "BOOKING_EMAIL_FROM",
  "BOOKING_INSTRUCTOR_EMAIL",
  "BOOKING_OWNER_EMAIL",
];

const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.RATE_LIMIT_REDIS_REST_URL;
const redisToken =
  process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.RATE_LIMIT_REDIS_REST_TOKEN;

const missing = required.filter((name) => !process.env[name]);
const invalid = [];

const clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (clerkPublishableKey && !clerkPublishableKey.startsWith("pk_live_")) {
  invalid.push("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY must start with pk_live_ in production");
}

if (clerkSecretKey && !clerkSecretKey.startsWith("sk_live_")) {
  invalid.push("CLERK_SECRET_KEY must start with sk_live_ in production");
}

if (
  process.env.E2E_AUTH_MOCK === "true" ||
  process.env.NEXT_PUBLIC_E2E_AUTH_MOCK === "true"
) {
  invalid.push("E2E auth mock must be disabled in production");
}

if (!redisUrl) {
  missing.push("UPSTASH_REDIS_REST_URL");
}

if (!redisToken) {
  missing.push("UPSTASH_REDIS_REST_TOKEN");
}

if (missing.length > 0) {
  console.error(
    `Production environment validation failed. Missing: ${Array.from(new Set(missing)).join(", ")}`,
  );
  process.exit(1);
}

if (invalid.length > 0) {
  console.error(
    `Production environment validation failed. ${invalid.join("; ")}.`,
  );
  process.exit(1);
}

try {
  const appUrl = new URL(process.env.APP_URL);

  if (appUrl.hostname === "localhost" || appUrl.hostname === "127.0.0.1") {
    console.error("Production environment validation failed. APP_URL must be your public production URL.");
    process.exit(1);
  }
} catch {
  console.error("Production environment validation failed. APP_URL must be an absolute URL.");
  process.exit(1);
}
