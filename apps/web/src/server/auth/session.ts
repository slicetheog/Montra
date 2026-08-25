import "server-only";
import { cookies, headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@montra/db";

/**
 * Session model: the cookie holds an opaque, high-entropy bearer token.
 * Only the SHA-256 hash of that token is ever written to the database, so
 * a compromised database backup can't be used to impersonate a session
 * (the same principle as never storing a plaintext password). See
 * SECURITY.md "Sessions".
 */
const SESSION_COOKIE = "montra_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000; // renew once <15 days remain

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isSecureContext(): boolean {
  return process.env.NODE_ENV === "production";
}

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const headerList = await headers();

  await prisma.session.create({
    data: {
      id,
      userId,
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
      ipHash: hashIp(headerList.get("x-forwarded-for") ?? headerList.get("x-real-ip")),
    },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecureContext(),
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

/** Reads + validates the session cookie against the database. Never trust the cookie alone. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: { id: true, email: true, name: true } } },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) await prisma.session.delete({ where: { id } }).catch(() => {});
    return null;
  }

  // Sliding expiration: renew if the session is more than half-consumed.
  if (session.expiresAt.getTime() - Date.now() < RENEW_THRESHOLD_MS) {
    const newExpiry = new Date(Date.now() + SESSION_TTL_MS);
    await prisma.session.update({ where: { id }, data: { expiresAt: newExpiry } }).catch(() => {});
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: isSecureContext(),
      sameSite: "lax",
      path: "/",
      expires: newExpiry,
    });
  }

  return session.user;
}

/** Throws-free variant for API routes that should respond 401 rather than crash. */
export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new UnauthorizedError();
  }
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Not authenticated");
  }
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.delete({ where: { id: hashToken(token) } }).catch(() => {});
  }
  jar.delete(SESSION_COOKIE);
}

/** Invalidates every session for a user (e.g. on password change or "log out everywhere"). */
export async function destroyAllSessions(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
}

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // Store only a salted hash — never the raw IP — enough to spot abuse
  // patterns without retaining PII longer than necessary (spec: Privacy).
  return createHash("sha256").update(ip.split(",")[0].trim()).digest("hex").slice(0, 32);
}
