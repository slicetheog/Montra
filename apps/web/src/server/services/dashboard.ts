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

  return {
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
