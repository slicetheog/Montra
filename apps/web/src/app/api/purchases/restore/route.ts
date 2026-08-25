import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { restorePurchase } from "@/server/services/purchases";

export async function POST() {
  return handleApi(async () => {
    const user = await requireSessionUser();
    return restorePurchase(user.id);
  });
}
