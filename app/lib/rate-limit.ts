import "server-only";

import { NextResponse } from "next/server";
import { isProductionRuntime } from "./database";
import { logger } from "./logger";

type RateLimitOptions = {
  key: string;
  limit: number;
  windowSeconds: number;
};

type RedisResponse = {
  result?: unknown;
  error?: string;
};

declare global {
  // eslint-disable-next-line no-var
  var museRateLimitBuckets: Map<string, { count: number; expiresAt: number }> | undefined;
}

export class RateLimitConfigurationError extends Error {
  constructor() {
    super("Rate limiting is not configured.");
    this.name = "RateLimitConfigurationError";
  }
}

export class RateLimitExceededError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many requests. Please try again shortly.");
    this.name = "RateLimitExceededError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function getRedisConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.RATE_LIMIT_REDIS_REST_URL;
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.RATE_LIMIT_REDIS_REST_TOKEN;

  return url && token ? { url: url.replace(/\/$/, ""), token } : undefined;
}

function getLocalBucket(key: string, windowSeconds: number) {
  globalThis.museRateLimitBuckets ??= new Map();

  const now = Date.now();
  const current = globalThis.museRateLimitBuckets.get(key);

  if (!current || current.expiresAt <= now) {
    const next = { count: 0, expiresAt: now + windowSeconds * 1000 };
    globalThis.museRateLimitBuckets.set(key, next);
    return next;
  }

  return current;
}

async function runRedisCommand(config: { url: string; token: string }, parts: string[]) {
  const response = await fetch(
    `${config.url}/${parts.map((part) => encodeURIComponent(part)).join("/")}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.token}`,
      },
    },
  );

  const payload = (await response.json().catch(() => ({}))) as RedisResponse;

  if (!response.ok || payload.error) {
    throw new Error(payload.error || `Redis returned ${response.status}.`);
  }

  return payload.result;
}

export function getRateLimitIdentity(request: Request, fallback = "anonymous") {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip");

  return firstForwardedIp || realIp || fallback;
}

export async function assertRateLimit({
  key,
  limit,
  windowSeconds,
}: RateLimitOptions) {
  const redis = getRedisConfig();
  const bucketKey = `muse:rl:${key}`;

  if (!redis) {
    if (isProductionRuntime()) {
      throw new RateLimitConfigurationError();
    }

    const bucket = getLocalBucket(bucketKey, windowSeconds);
    bucket.count += 1;

    if (bucket.count > limit) {
      const retryAfter = Math.max(Math.ceil((bucket.expiresAt - Date.now()) / 1000), 1);
      throw new RateLimitExceededError(retryAfter);
    }

    return;
  }

  try {
    const count = Number(await runRedisCommand(redis, ["incr", bucketKey]));

    if (count === 1) {
      await runRedisCommand(redis, ["expire", bucketKey, String(windowSeconds)]);
    }

    if (count > limit) {
      throw new RateLimitExceededError(windowSeconds);
    }
  } catch (error) {
    if (error instanceof RateLimitExceededError) {
      throw error;
    }

    logger.error("rate_limit_backend_failed", {
      error: error instanceof Error ? error.message : "Unknown rate limit error",
    });

    if (isProductionRuntime()) {
      throw new RateLimitConfigurationError();
    }
  }
}

export function rateLimitErrorResponse(error: unknown) {
  if (error instanceof RateLimitExceededError) {
    return NextResponse.json(
      { error: error.message },
      {
        status: 429,
        headers: {
          "Retry-After": String(error.retryAfterSeconds),
        },
      },
    );
  }

  if (error instanceof RateLimitConfigurationError) {
    return NextResponse.json(
      { error: "API protection is not configured." },
      { status: 503 },
    );
  }

  return undefined;
}
