import "server-only";
import { prisma } from "@montra/db";

/**
 * The user's configured budget-period start day (1-28, validated at the
 * settings API boundary — see validation/settings.ts), defaulting to 1
 * (a plain calendar month) when they haven't set one, same as the schema
 * column's own default. Every place that computes "this budget month" —
 * getMonthView, assignMoney, moveMoney, the credit-card offset, the
 * Dashboard's month-to-date aggregates, and the Goals monthly-
 * contribution check — resolves this once and threads it down into
 * @montra/domain's monthStart/monthEndExclusive/etc., so a user paid on,
 * say, the 25th can make their budget "month" track their pay cycle
 * instead of the calendar. Existing data is unaffected: a BudgetMonth row
 * already created under calendar-month boundaries keeps them — this only
 * changes where *new* periods start going forward.
 */
export async function resolveFirstDayOfMonth(userId: string): Promise<number> {
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { firstDayOfMonth: true } });
  return settings?.firstDayOfMonth ?? 1;
}

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
