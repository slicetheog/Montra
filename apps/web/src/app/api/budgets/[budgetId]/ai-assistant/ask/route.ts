import { z } from "zod";
import { handleApi, RateLimitedError } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { askAssistant } from "@/server/services/ai-assistant";
import { aiAssistantRateLimiter, clientKeyFrom } from "@/server/auth/rate-limit";

type Params = { params: Promise<{ budgetId: string }> };

const schema = z.object({ question: z.string().trim().min(1).max(500) });

export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const { allowed, retryAfterMs } = await aiAssistantRateLimiter.consume(
      clientKeyFrom(request.headers, `ai-assistant:${user.id}`),
    );
    if (!allowed) throw new RateLimitedError(retryAfterMs);
    const body = schema.parse(await request.json());
    return askAssistant(user.id, budgetId, body.question);
  });
}
