import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { deleteAccount } from "@/server/services/profile";

const schema = z.object({ password: z.string().min(1) });

export async function DELETE(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const body = schema.parse(await request.json());
    await deleteAccount(user.id, body.password);
    return { ok: true };
  });
}
