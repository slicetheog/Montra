import "server-only";
import { prisma } from "@montra/db";
import { monthStart } from "@montra/domain";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { getMonthView } from "@/server/services/budget";
import { getNetWorthNow } from "@/server/services/net-worth";
import { listGoals } from "@/server/services/goals";
import { listRecurring } from "@/server/services/recurring";

export async function getDashboardSummary(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const now = new Date();
  const monthStartDate = monthStart(now);

  const [netWorth, month, goals, recurring, recentTransactions, cashAccounts] = await Promise.all([
    getNetWorthNow(userId, budgetId),
    getMonthView(userId, budgetId, monthStartDate),
    listGoals(userId, budgetId),
    listRecurring(userId, budgetId),
    prisma.transaction.findMany({
      where: { budgetId },
      orderBy: [{ date: "desc" }, { id: "desc" }],
      take: 8,
      include: { payee: { select: { name: true } }, account: { select: { name: true } }, splits: { include: { category: { select: { name: true } } } } },
    }),
    prisma.account.findMany({
      where: { budgetId, type: { in: ["CHECKING", "SAVINGS", "CASH"] } },
      select: { id: true },
    }),
  ]);

  const cashBalances = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { accountId: { in: cashAccounts.map((a) => a.id) } },
    _sum: { amountCents: true },
  });
  const cashCents = cashBalances.reduce((sum, b) => sum + (b._sum.amountCents ?? 0), 0);

  const monthIncomeAgg = await prisma.transaction.aggregate({
    where: { budgetId, type: "INCOME", date: { gte: monthStartDate } },
    _sum: { amountCents: true },
  });
  const monthSpendingAgg = await prisma.transaction.aggregate({
    where: { budgetId, type: { in: ["EXPENSE", "CREDIT_CARD_PAYMENT"] }, date: { gte: monthStartDate } },
    _sum: { amountCents: true },
  });

  const upcoming = recurring
    .filter((r) => r.isActive)
    .sort((a, b) => a.nextOccurrenceDate.getTime() - b.nextOccurrenceDate.getTime())
    .slice(0, 5);

  // The soonest scheduled paycheck, surfaced separately from the general
  // "Upcoming" list so it can be shown prominently — it's the direct answer
  // to "why does my budget look tight right now," without ever being
  // counted in readyToAssignCents itself: a forecast is not money that has
  // actually landed, and every other figure on this dashboard reflects
  // only the ledger as it stands today (see FINANCIAL_ENGINE.md).
  const nextPaycheck = recurring
    .filter((r) => r.isActive && r.type === "INCOME")
    .sort((a, b) => a.nextOccurrenceDate.getTime() - b.nextOccurrenceDate.getTime())[0];

  return {
    nextPaycheck: nextPaycheck
      ? {
          amountCents: nextPaycheck.amountCents,
          date: nextPaycheck.nextOccurrenceDate,
          payeeName: nextPaycheck.payee?.name ?? null,
          accountName: nextPaycheck.account.name,
        }
      : null,
    netWorthCents: netWorth.netWorthCents,
    cashCents,
    totalDebtCents: netWorth.totalLiabilitiesCents,
    monthIncomeCents: monthIncomeAgg._sum.amountCents ?? 0,
    monthSpendingCents: Math.abs(monthSpendingAgg._sum.amountCents ?? 0),
    readyToAssignCents: month.readyToAssignCents,
    totalAssignedCents: month.totals.totalAssignedCents,
    totalAvailableCents: month.totals.totalAvailableCents,
    goals: goals.slice(0, 3),
    upcomingRecurring: upcoming,
    recentTransactions,
  };
}
