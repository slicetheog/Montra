import { prisma } from "@montra/db";
import { handleApi } from "@/server/api-helpers";
import { getSessionUser } from "@/server/auth/session";
import { isAiAssistantConfigured } from "@/server/ai";
import { listBudgets } from "@/server/services/budgets";

export async function GET() {
  return handleApi(async () => {
    const sessionUser = await getSessionUser();
    if (!sessionUser) return { user: null };

    const [settings, entitlement, budgets] = await Promise.all([
      prisma.userSettings.findUnique({ where: { userId: sessionUser.id } }),
      prisma.entitlement.findUnique({ where: { userId: sessionUser.id } }),
      listBudgets(sessionUser.id),
    ]);

    return {
      user: sessionUser,
      settings,
      adsRemoved: entitlement?.adsRemoved ?? false,
      budgets: budgets.map((b) => ({ id: b.id, name: b.name, currency: b.currency, isOwner: b.isOwner })),
      needsOnboarding: !settings?.onboardingCompletedAt,
      aiAssistantAvailable: isAiAssistantConfigured(),
    };
  });
}
