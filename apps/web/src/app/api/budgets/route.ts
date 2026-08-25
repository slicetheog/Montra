import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { createBudget, listBudgets } from "@/server/services/budgets";

const createBudgetSchema = z.object({
  name: z.string().trim().min(1, "Give your budget a name.").max(80),
  currency: z.string().trim().length(3).optional(),
});

export async function GET() {
  return handleApi(async () => {
    const user = await requireSessionUser();
    return listBudgets(user.id);
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const body = createBudgetSchema.parse(await request.json());
    return createBudget(user.id, body.name, body.currency);
  });
}
