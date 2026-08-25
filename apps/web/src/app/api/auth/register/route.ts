import { prisma } from "@montra/db";
import { handleApi, ConflictError, ValidationError, RateLimitedError } from "@/server/api-helpers";
import { createSession } from "@/server/auth/session";
import { hashPassword, validatePasswordStrength } from "@/server/auth/password";
import { registerSchema } from "@/server/validation/auth";
import { registerRateLimiter, clientKeyFrom } from "@/server/auth/rate-limit";
import { logAudit } from "@/server/services/audit";

export async function POST(request: Request) {
  return handleApi(async () => {
    const { allowed, retryAfterMs } = await registerRateLimiter.consume(
      clientKeyFrom(request.headers, "register"),
    );
    if (!allowed) throw new RateLimitedError(retryAfterMs);

    const body = registerSchema.parse(await request.json());

    const strengthIssue = validatePasswordStrength(body.password);
    if (strengthIssue) throw new ValidationError(strengthIssue);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      throw new ConflictError("An account with that email already exists. Try signing in instead.");
    }

    const passwordHash = await hashPassword(body.password);

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name,
        passwordHash,
        settings: { create: {} },
        entitlement: { create: { adsRemoved: false } },
      },
    });

    await logAudit({ userId: user.id, action: "user.registered", entityType: "User", entityId: user.id });
    await createSession(user.id);

    return { id: user.id, email: user.email, name: user.name };
  });
}
