import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { getInvitePreview } from "@/server/services/budget-members";

type Params = { params: Promise<{ token: string }> };

/** Requires login (not just possession of the link) purely so the accept page always has a session to act on next — the token itself is what's actually checked. */
export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    await requireSessionUser();
    const { token } = await params;
    return getInvitePreview(token);
  });
}
