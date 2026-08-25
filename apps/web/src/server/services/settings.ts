import "server-only";
import { prisma } from "@montra/db";

export async function updateUserSettings(
  userId: string,
  patch: Partial<{
    currency: string;
    dateFormat: string;
    firstDayOfMonth: number;
    theme: "LIGHT" | "DARK" | "SYSTEM";
    notificationsEnabled: boolean;
    completeOnboarding: boolean;
  }>,
) {
  const onboardingCompletedAt = patch.completeOnboarding ? new Date() : undefined;
  const shared = {
    currency: patch.currency,
    dateFormat: patch.dateFormat,
    firstDayOfMonth: patch.firstDayOfMonth,
    theme: patch.theme,
    notificationsEnabled: patch.notificationsEnabled,
    onboardingCompletedAt,
  };

  return prisma.userSettings.upsert({
    where: { userId },
    update: shared,
    create: { userId, ...shared },
  });
}
