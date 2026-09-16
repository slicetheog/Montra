import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { acceptInvite } from "@/server/services/budget-members";

type Params = { params: Promise<{ token: string }> };

export async function POST(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { token } = await params;
    return acceptInvite(user.id, user.email, token);
  });
}
