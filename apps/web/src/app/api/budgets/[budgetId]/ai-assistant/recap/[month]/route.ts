import { z } from "zod";
import { handleApi, RateLimitedError } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { generateMonthlyRecap, getMonthlyRecap } from "@/server/services/ai-assistant";
import { resolveFirstDayOfMonth } from "@/server/services/settings";
import { parseMonthParam } from "@/server/month-param";
import { aiAssistantRateLimiter, clientKeyFrom } from "@/server/auth/rate-limit";

type Params = { params: Promise<{ budgetId: string; month: string }> };

/** Reads back a previously generated recap, if any — never calls the API. */
export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    const firstDayOfMonth = await resolveFirstDayOfMonth(user.id);
    return getMonthlyRecap(user.id, budgetId, parseMonthParam(month, firstDayOfMonth));
  });
}

const bodySchema = z.object({ force: z.boolean().optional() });

/** Generates a recap (or returns the cached one, unless `force` is set). */
export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId, month } = await params;
    const { allowed, retryAfterMs } = await aiAssistantRateLimiter.consume(
      clientKeyFrom(request.headers, `ai-assistant:${user.id}`),
    );
    if (!allowed) throw new RateLimitedError(retryAfterMs);
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const firstDayOfMonth = await resolveFirstDayOfMonth(user.id);
    return generateMonthlyRecap(user.id, budgetId, parseMonthParam(month, firstDayOfMonth), body.force);
  });
}
