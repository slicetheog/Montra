import { prisma } from "@montra/db";
import { handleApi, ValidationError, RateLimitedError } from "@/server/api-helpers";
import { createSession } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";
import { loginSchema } from "@/server/validation/auth";
import { loginRateLimiter, clientKeyFrom } from "@/server/auth/rate-limit";
import { logAudit } from "@/server/services/audit";

const GENERIC_ERROR = "That email or password isn't right. Please try again.";

export async function POST(request: Request) {
  return handleApi(async () => {
    const body = loginSchema.parse(await request.json());

    // Rate-limit by IP+email together so one attacker can't lock out a
    // victim's account by hammering it (a shared IP limit alone would),
    // while still bounding brute force from a single source.
    const { allowed, retryAfterMs } = await loginRateLimiter.consume(
      clientKeyFrom(request.headers, `login:${body.email}`),
    );
    if (!allowed) throw new RateLimitedError(retryAfterMs);

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    if (!user) throw new ValidationError(GENERIC_ERROR);

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) throw new ValidationError(GENERIC_ERROR);

    await createSession(user.id);
    await logAudit({ userId: user.id, action: "user.login", entityType: "User", entityId: user.id });

    return { id: user.id, email: user.email, name: user.name };
  });
}
