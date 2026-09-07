import "server-only";
import { prisma } from "@montra/db";
import { addMonths, cents, computeSpendingPace, monthEndExclusive, monthStart } from "@montra/domain";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { getMonthView } from "@/server/services/budget";
import { getNetWorthNow } from "@/server/services/net-worth";
import { listGoals } from "@/server/services/goals";
import { listRecurring } from "@/server/services/recurring";
import { listDebts } from "@/server/services/debts";
import { resolveFirstDayOfMonth } from "@/server/services/settings";

const DAY_MS = 86_400_000;

export async function getDashboardSummary(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const now = new Date();
  const firstDayOfMonth = await resolveFirstDayOfMonth(userId);
  const monthStartDate = monthStart(now, firstDayOfMonth);

  const [netWorth, month, goals, recurring, debts, recentTransactions, cashAccounts] = await Promise.all([
    getNetWorthNow(userId, budgetId),
    getMonthView(userId, budgetId, monthStartDate),
    listGoals(userId, budgetId),
    listRecurring(userId, budgetId),
    listDebts(userId, budgetId),
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

  // Burn-rate pace, scoped to *variable* spending only (no recurring
  // series behind it — a plain bill is already scheduled, not something
  // that paces up or down day to day). sourceRecurringId is only ever set
  // by the recurring materializer/log-payment path (see
  // services/recurring.ts), so its absence is exactly "logged by hand."
  const prevMonthStart = addMonths(monthStartDate, -1, firstDayOfMonth);
  const [variableThisMonthAgg, variableLastMonthAgg] = await Promise.all([
    prisma.transaction.aggregate({
      where: { budgetId, type: "EXPENSE", sourceRecurringId: null, date: { gte: monthStartDate } },
      _sum: { amountCents: true },
    }),
    prisma.transaction.aggregate({
      where: { budgetId, type: "EXPENSE", sourceRecurringId: null, date: { gte: prevMonthStart, lt: monthStartDate } },
      _sum: { amountCents: true },
    }),
  ]);
  // Elapsed/total days *in this budget period* rather than the calendar
  // month — identical to calendar day-of-month when firstDayOfMonth is 1
  // (the default), but tracks a custom pay-cycle period correctly too.
  const dayOfMonth = Math.floor((now.getTime() - monthStartDate.getTime()) / DAY_MS) + 1;
  const daysInMonth = Math.round((monthEndExclusive(now, firstDayOfMonth).getTime() - monthStartDate.getTime()) / DAY_MS);
  // Too little signal in the first couple of days of the period to project meaningfully.
  const spendingPace =
    dayOfMonth >= 3
      ? computeSpendingPace({
          monthToDateSpendCents: cents(Math.abs(variableThisMonthAgg._sum.amountCents ?? 0)),
          dayOfMonth,
          daysInMonth,
          lastMonthSpendCents: cents(Math.abs(variableLastMonthAgg._sum.amountCents ?? 0)),
        })
      : null;

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

  // Headline debt-interest cost — the same per-debt projection the Debt
  // page already shows, just summed here so it's visible without a click.
  // A debt whose current minimum will never clear it (months: -1)
  // contributes 0 rather than a misleading number; anyWontClear flags
  // that case separately so the copy can say so.
  const debtInterestProjection = {
    totalInterestCents: debts.reduce((sum, d) => sum + (d.projection.months >= 0 ? d.projection.totalInterestCents : 0), 0),
    anyWontClear: debts.some((d) => d.projection.months < 0),
  };

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
    debtInterestProjection,
    spendingPace,
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
