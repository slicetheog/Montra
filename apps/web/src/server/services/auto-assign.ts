import "server-only";
import { prisma } from "@montra/db";
import {
  add,
  addMonths,
  buildAutoAssignPlan,
  catchUpSchedule,
  cents,
  monthEndExclusive,
  monthStart,
  sumRecurringDue,
  ZERO,
  type AutoAssignPlan,
  type RecurringBillSeries,
} from "@montra/domain";
import { requireBudgetAccess } from "@/server/services/budgets";
import { resolveFirstDayOfMonth } from "@/server/services/settings";
import { getMonthView, getReadyToAssign } from "@/server/services/budget";
import { assignMoney } from "@/server/services/budget";

/** How many periods of spending history to average for a category with no recurring bill of its own. */
const HISTORY_PERIODS = 3;

/**
 * Builds the autopilot suggestion for a period: for every non-system
 * category, how much more to assign given (a) recurring bills due in the
 * period and (b) a recent spending average for categories with no
 * recurring bill — scaled to fit Ready to Assign if the raw asks exceed
 * it. Read-only; nothing here changes any assignment. See
 * applyAutoAssignPlan for actually committing a plan.
 */
export async function getAutoAssignPlan(userId: string, budgetId: string, month: Date): Promise<AutoAssignPlan> {
  await requireBudgetAccess(budgetId, userId);
  const firstDayOfMonth = await resolveFirstDayOfMonth(userId);
  const periodStart = monthStart(month, firstDayOfMonth);
  const periodEndExclusive = monthEndExclusive(periodStart, firstDayOfMonth);
  const historyStart = addMonths(periodStart, -HISTORY_PERIODS, firstDayOfMonth);
  const asOf = new Date();

  const [monthView, readyToAssignCents, recurringRows, historyRows] = await Promise.all([
    getMonthView(userId, budgetId, periodStart),
    getReadyToAssign(prisma, budgetId, periodStart, firstDayOfMonth),
    prisma.recurringTransaction.findMany({
      where: { budgetId, isActive: true, type: "EXPENSE", categoryId: { not: null } },
      select: {
        categoryId: true,
        amountCents: true,
        frequency: true,
        intervalCount: true,
        nextOccurrenceDate: true,
        endDate: true,
        occurrencesLimit: true,
        occurrencesCreated: true,
      },
    }),
    prisma.transactionSplit.groupBy({
      by: ["categoryId"],
      where: {
        categoryId: { not: null },
        amountCents: { lt: 0 },
        // Same exclusion as reports.ts's spendingByCategory: a credit-card
        // payment's checking-side leg is money moving between the user's
        // own accounts, not new spending in that category.
        transaction: { budgetId, type: { not: "TRANSFER" }, date: { gte: historyStart, lt: periodStart } },
      },
      _sum: { amountCents: true },
    }),
  ]);

  // Recurring series need to be "caught up" to now before expanding, same
  // as the cash-flow forecast does — an overdue reminder-only series (auto-
  // create off) shouldn't look like it's due 6 times just because nobody's
  // logged it in 6 months.
  const recurringSeries: RecurringBillSeries[] = recurringRows.map((r) => {
    const caughtUp = catchUpSchedule({
      nextOccurrenceDate: r.nextOccurrenceDate,
      frequency: r.frequency,
      intervalCount: r.intervalCount,
      occurrencesCreated: r.occurrencesCreated,
      occurrencesLimit: r.occurrencesLimit,
      endDate: r.endDate,
      asOf,
    });
    return {
      categoryId: r.categoryId!,
      amountCents: cents(Math.abs(r.amountCents)),
      frequency: r.frequency,
      intervalCount: r.intervalCount,
      nextOccurrenceDate: caughtUp.nextOccurrenceDate,
      endDate: r.endDate,
      occurrencesLimit: r.occurrencesLimit,
      occurrencesAlreadyCreated: caughtUp.occurrencesCreated,
    };
  });
  const recurringDueByCategory = sumRecurringDue(recurringSeries, periodStart, periodEndExclusive);

  const historyByCategory = new Map(
    historyRows.map((r) => [r.categoryId!, cents(Math.round(Math.abs(r._sum.amountCents ?? 0) / HISTORY_PERIODS))]),
  );

  const categories = monthView.groups
    .flatMap((g) => g.categories)
    .filter((c) => !c.isSystem)
    .map((c) => ({
      categoryId: c.categoryId,
      currentAvailableCents: cents(c.availableCents),
      recurringDueCents: recurringDueByCategory.get(c.categoryId) ?? ZERO,
      historicalAverageCents: historyByCategory.get(c.categoryId) ?? ZERO,
    }));

  return buildAutoAssignPlan({ categories, readyToAssignCents });
}

/**
 * Applies a previously-fetched plan: assigns each line's amount to its
 * category for the period. Takes the plan's own lines rather than
 * recomputing, so what the user reviewed is exactly what gets applied even
 * if their data changes in the moment between preview and confirm.
 */
export async function applyAutoAssignPlan(
  userId: string,
  budgetId: string,
  month: Date,
  lines: { categoryId: string; amountCents: number }[],
) {
  await requireBudgetAccess(budgetId, userId);
  for (const line of lines) {
    if (line.amountCents <= 0) continue;
    await assignMoney(userId, budgetId, line.categoryId, month, cents(line.amountCents), "Auto-assigned");
  }
  return { appliedCents: add(...lines.map((l) => cents(Math.max(0, l.amountCents)))) };
}
