import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { changePassword } from "@/server/services/profile";

const schema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(1) });

export async function POST(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const body = schema.parse(await request.json());
    await changePassword(user.id, body.currentPassword, body.newPassword);
    return { ok: true };
  });
}
