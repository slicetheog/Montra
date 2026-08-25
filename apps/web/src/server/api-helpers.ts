import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { UnauthorizedError } from "@/server/auth/session";

/**
 * Central error -> HTTP response mapping. Every API route funnels its
 * handler body through this so we NEVER leak a raw database/stack-trace
 * error to the client (spec: Error Handling) while still logging full
 * detail server-side for debugging.
 */
export class ForbiddenError extends Error {
  constructor(message = "You don't have access to that resource.") {
    super(message);
  }
}

export class NotFoundError extends Error {
  constructor(message = "That item couldn't be found.") {
    super(message);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class RateLimitedError extends Error {
  constructor(public retryAfterMs?: number) {
    super("Too many requests. Please slow down and try again shortly.");
  }
}

export function apiError(error: unknown): NextResponse {
  if (error instanceof UnauthorizedError) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (error instanceof ForbiddenError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof NotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof ConflictError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof RateLimitedError) {
    return NextResponse.json(
      { error: error.message },
      { status: 429, headers: error.retryAfterMs ? { "Retry-After": String(Math.ceil(error.retryAfterMs / 1000)) } : {} },
    );
  }
  if (error instanceof ValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Some information wasn't valid.", fields: error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  // Unknown/unexpected error: log full detail server-side, tell the user
  // nothing technical went wrong that they need to worry about their data over.
  console.error("[api] unhandled error:", error);
  return NextResponse.json(
    { error: "Something went wrong on our end. Your existing data is safe. Please try again." },
    { status: 500 },
  );
}

export function apiOk<T>(data: T, init?: { status?: number }): NextResponse {
  return NextResponse.json(data, { status: init?.status ?? 200 });
}

/** Wrap a route handler body so any thrown error is mapped uniformly. */
export async function handleApi<T>(fn: () => Promise<T>): Promise<NextResponse> {
  try {
    const result = await fn();
    if (result instanceof NextResponse) return result;
    return apiOk(result);
  } catch (error) {
    return apiError(error);
  }
}
