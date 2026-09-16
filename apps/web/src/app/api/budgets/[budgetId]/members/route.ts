import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { inviteMember, listMembers } from "@/server/services/budget-members";

type Params = { params: Promise<{ budgetId: string }> };

const inviteSchema = z.object({ email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254) });

export async function GET(_request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    return listMembers(user.id, budgetId);
  });
}

export async function POST(request: Request, { params }: Params) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const { budgetId } = await params;
    const body = inviteSchema.parse(await request.json());
    return inviteMember(user.id, budgetId, body.email);
  });
}
