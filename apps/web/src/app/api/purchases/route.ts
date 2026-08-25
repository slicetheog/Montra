import { handleApi, RateLimitedError } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { purchaseAdRemoval } from "@/server/services/purchases";
import { mutationRateLimiter, clientKeyFrom } from "@/server/auth/rate-limit";

export async function POST(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { allowed } = await mutationRateLimiter.consume(clientKeyFrom(request.headers, `purchase:${user.id}`));
    if (!allowed) throw new RateLimitedError();

    return purchaseAdRemoval(user.id);
  });
}
