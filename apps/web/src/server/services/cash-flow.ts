import "server-only";
import { prisma } from "@montra/db";
import { catchUpSchedule, cents, projectCashFlow, type ForecastSeriesInput } from "@montra/domain";
import type { AccountType } from "@prisma/client";
import { requireBudgetOwnership } from "@/server/services/budgets";

const CASH_ACCOUNT_TYPES: AccountType[] = ["CHECKING", "SAVINGS", "CASH"];

/**
 * The forward-looking companion to the dashboard's "next paycheck"
 * banner: projects the combined balance of every open checking/savings/
 * cash account forward by expanding each account's active recurring
 * series (paychecks and bills alike — see @montra/domain's
 * cash-flow-forecast for the actual walk). Scoped to the same account
 * set the dashboard already sums into "Cash" (see getDashboardSummary),
 * so the forecast's starting balance always matches what's shown there.
 *
 * Read-only: an overdue reminder-only series (autoCreate off) is caught
 * up to its next future date for projection purposes via
 * catchUpSchedule, but nothing here writes back to the recurring series
 * itself — that only happens through materializeDueRecurring.
 */
export async function getCashFlowForecast(userId: string, budgetId: string, horizonDays = 60) {
  await requireBudgetOwnership(budgetId, userId);
  const asOf = new Date();

  const cashAccounts = await prisma.account.findMany({
    where: { budgetId, type: { in: CASH_ACCOUNT_TYPES }, isClosed: false },
    select: { id: true, name: true },
  });
  const accountIds = cashAccounts.map((a) => a.id);

  const [balances, series] = await Promise.all([
    accountIds.length
      ? prisma.transaction.groupBy({ by: ["accountId"], where: { accountId: { in: accountIds } }, _sum: { amountCents: true } })
      : Promise.resolve([]),
    accountIds.length
      ? prisma.recurringTransaction.findMany({
          where: { budgetId, accountId: { in: accountIds }, isActive: true },
          include: { payee: { select: { name: true } }, account: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const startingBalanceCents = cents(balances.reduce((sum, b) => sum + (b._sum.amountCents ?? 0), 0));

  const forecastSeries: ForecastSeriesInput[] = series
    .filter((s) => s.type !== "TRANSFER") // recurring transfers aren't supported (see services/recurring.ts) — defensive only
    .map((s) => {
      const caughtUp = catchUpSchedule({
        nextOccurrenceDate: s.nextOccurrenceDate,
        frequency: s.frequency,
        intervalCount: s.intervalCount,
        occurrencesCreated: s.occurrencesCreated,
        occurrencesLimit: s.occurrencesLimit,
        endDate: s.endDate,
        asOf,
      });
      return {
        id: s.id,
        label: s.payee?.name ?? s.memo ?? s.account.name,
        type: s.type as ForecastSeriesInput["type"],
        amountCents: cents(s.amountCents),
        frequency: s.frequency,
        intervalCount: s.intervalCount,
        nextOccurrenceDate: caughtUp.nextOccurrenceDate,
        endDate: s.endDate,
        occurrencesLimit: s.occurrencesLimit,
        occurrencesAlreadyCreated: caughtUp.occurrencesCreated,
      };
    });

  const forecast = projectCashFlow({ startingBalanceCents, series: forecastSeries, asOf, horizonDays });

  return {
    accountNames: cashAccounts.map((a) => a.name),
    hasScheduledSeries: forecastSeries.length > 0,
    ...forecast,
  };
}
