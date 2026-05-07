import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

export class SecurityError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.name = "SecurityError";
    this.status = status;
  }
}

export class RequestValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "RequestValidationError";
    this.status = status;
  }
}

function normalizeOrigin(value: string) {
  return new URL(value).origin;
}

function getAllowedOrigins(request: Request) {
  const requestOrigin = new URL(request.url).origin;
  const requestUrl = new URL(request.url);
  const configuredOrigins = [
    process.env.APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeOrigin(value));
  const localOrigins =
    requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : [];

  return new Set([requestOrigin, ...configuredOrigins, ...localOrigins]);
}

export function assertSameOrigin(request: Request) {
  const method = request.method.toUpperCase();

  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return;
  }

  const origin = request.headers.get("origin");

  if (!origin) {
    const fetchSite = request.headers.get("sec-fetch-site");

    if (fetchSite === "same-origin" || fetchSite === "same-site") {
      return;
    }

    const referer = request.headers.get("referer");

    if (referer) {
      try {
        if (getAllowedOrigins(request).has(normalizeOrigin(referer))) {
          return;
        }
      } catch {
        throw new SecurityError("Invalid request referer.");
      }
    }

    if (process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT) {
      throw new SecurityError("Missing request origin.");
    }

    return;
  }

  let normalizedOrigin: string;

  try {
    normalizedOrigin = normalizeOrigin(origin);
  } catch {
    throw new SecurityError("Invalid request origin.");
  }

  if (!getAllowedOrigins(request).has(normalizedOrigin)) {
    throw new SecurityError("Cross-origin requests are not allowed.");
  }
}

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 16_384,
): Promise<T> {
  const contentLength = request.headers.get("content-length");

  if (contentLength && Number(contentLength) > maxBytes) {
    throw new RequestValidationError("Request body is too large.", 413);
  }

  let rawBody: string;

  try {
    rawBody = await request.text();
  } catch {
    throw new RequestValidationError("Unable to read request body.");
  }

  if (rawBody.length > maxBytes) {
    throw new RequestValidationError("Request body is too large.", 413);
  }

  let payload: unknown;

  try {
    payload = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    throw new RequestValidationError("Send request details as JSON.");
  }

  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new RequestValidationError(
      parsed.error.issues[0]?.message ?? "Request body is invalid.",
    );
  }

  return parsed.data;
}

export function jsonError(error: unknown, fallback: string, fallbackStatus = 500) {
  if (error instanceof SecurityError || error instanceof RequestValidationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  return NextResponse.json({ error: fallback }, { status: fallbackStatus });
}
