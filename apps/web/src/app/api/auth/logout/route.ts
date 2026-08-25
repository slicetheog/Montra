import { handleApi } from "@/server/api-helpers";
import { destroySession } from "@/server/auth/session";

export async function POST() {
  return handleApi(async () => {
    await destroySession();
    return { ok: true };
  });
}
