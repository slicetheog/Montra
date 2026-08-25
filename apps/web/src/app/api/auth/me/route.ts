import { prisma } from "@montra/db";
import { handleApi } from "@/server/api-helpers";
import { getSessionUser } from "@/server/auth/session";

export async function GET() {
  return handleApi(async () => {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { user: null };

    const [settings, entitlement, budgets] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: sessionUser.id } }),
      prisma.entitlement.findUnique({ where: { userId: sessionUser.id } }),
      prisma.budget.findMany({
        where: { userId: sessionUser.id, isArchived: false },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, currency: true },
      }),
    ]);

    return {
      user: sessionUser,
      settings,
      adsRemoved: entitlement?.adsRemoved ?? false,
      budgets,
      needsOnboarding: !settings?.onboardingCompletedAt,
    };
  });
}
