import { z } from "zod";
import { handleApi } from "@/server/api-helpers";
import { requireSessionUser } from "@/server/auth/session";
import { updateProfile } from "@/server/services/profile";

const schema = z.object({ name: z.string().trim().min(1).max(120) });

export async function PATCH(request: Request) {
  return handleApi(async () => {
    const user = await requireSessionUser();
    const body = schema.parse(await request.json());
    return updateProfile(user.id, body.name);
  });
}
