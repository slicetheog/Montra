/**
 * The zero-based budgeting calculation kernel.
 *
 * This module is pure and framework-free: every function takes plain data
 * the caller has already fetched/aggregated (usually via Prisma) and
 * returns a computed result. No function here talks to a database. That
 * split is deliberate (see /ARCHITECTURE.md):
 *
 *   UI -> Application Services (apps/web/src/server) -> this engine -> (facts)
 *                              \-> Prisma/Postgres (facts fetched here)
 *
 * so every rule can be unit tested without a database, and the UI never
 * computes a balance itself — it only renders what this module produced.
 *
 * THE CORE IDENTITY (this is what "give every dollar a job" means in code):
 *
 *   Ready to Assign  = cumulative on-budget income  -  cumulative assigned
 *   Category Available(month) = Available(month-1) + Assigned(month) + Activity(month)
 *
 * Both "Assigned" and "Activity" are ledger sums (Assignment rows and
 * TransactionSplit rows respectively) — never a UI-maintained counter.
 */

import { add, cents, Cents, clampNonNegative, min as minCents, sub, sum, ZERO } from "./money";

// ---------------------------------------------------------------------------
// Ready to Assign ("Available to Budget")
// ---------------------------------------------------------------------------

/**
 * "Ready to Assign" is the pool of money not yet given a job. It grows
 * whenever categoryless income lands in an on-budget account, and shrinks
 * whenever the user assigns money to a category — cumulatively, across all
 * time up through the month being viewed (assigning in a future month
 * still comes out of today's pool, exactly like YNAB's model).
 */
export function computeReadyToAssign(
  cumulativeOnBudgetIncomeCents: Cents,
  cumulativeAssignedCents: Cents,
): Cents {
  return sub(cumulativeOnBudgetIncomeCents, cumulativeAssignedCents);
}

// ---------------------------------------------------------------------------
// Category Available / rollover
// ---------------------------------------------------------------------------

export interface MonthLedgerFacts {
  /** Sum of this category's Assignment rows for this month. */
  assignedCents: Cents;
  /** Sum of this category's TransactionSplit amounts for this month. Outflows are negative. */
  activityCents: Cents;
}

/** One step of the rollover recurrence: this month's ending Available. */
export function computeCategoryAvailable(priorAvailableCents: Cents, month: MonthLedgerFacts): Cents {
  return add(priorAvailableCents, month.assignedCents, month.activityCents);
}

/**
 * Walk a category's full month-by-month history (oldest first, starting
 * from the category's creation month) and return the Available balance for
 * every month, since a positive OR negative balance always carries forward.
 */
export function computeAvailableSeries(monthsOldestFirst: MonthLedgerFacts[]): Cents[] {
  const series: Cents[] = [];
  let running = ZERO;
  for (const month of monthsOldestFirst) {
    running = computeCategoryAvailable(running, month);
    series.push(running);
  }
  return series;
}

export interface CategorySummary {
  categoryId: string;
  assignedCents: Cents;
  activityCents: Cents;
  availableCents: Cents;
}

export interface BudgetTotals {
  totalAssignedCents: Cents;
  totalActivityCents: Cents;
  totalAvailableCents: Cents;
}

export function computeBudgetTotals(categories: CategorySummary[]): BudgetTotals {
  return {
    totalAssignedCents: sum(categories.map((c) => c.assignedCents)),
    totalActivityCents: sum(categories.map((c) => c.activityCents)),
    totalAvailableCents: sum(categories.map((c) => c.availableCents)),
  };
}

// ---------------------------------------------------------------------------
// Split transaction validation
// ---------------------------------------------------------------------------

export class SplitMismatchError extends Error {
  constructor(totalCents: Cents, splitSumCents: Cents) {
    super(
      `Split amounts (${splitSumCents}) must sum exactly to the transaction total (${totalCents}).`,
    );
  }
}

/** A transaction's splits must always sum to its total — enforced here, not just in the UI. */
export function assertSplitsSumToTotal(totalCents: Cents, splitAmountsCents: Cents[]): void {
  const splitSum = sum(splitAmountsCents);
  if (splitSum !== totalCents) {
    throw new SplitMismatchError(totalCents, splitSum);
  }
}

// ---------------------------------------------------------------------------
// Credit card auto-offset
// ---------------------------------------------------------------------------

/**
 * When money is spent on a credit card against a budget category, the
 * amount actually available in that category (up to what was available)
 * moves into the card's "Payment: <Card>" category — it's no longer money
 * you can spend elsewhere, it's money earmarked to pay the card bill.
 * Spending beyond what the category had available is *not* auto-moved
 * (there's nothing to move); it simply shows as overspending in the
 * category, same as a cash overspend.
 *
 * @param spendOutflowCents Positive magnitude of the purchase.
 * @param categoryAvailableBeforeCents The category's Available immediately before this purchase.
 * @returns The (non-negative) amount to move from the spending category into the card's payment category.
 */
export function computeCreditCardOffset(
  spendOutflowCents: Cents,
  categoryAvailableBeforeCents: Cents,
): Cents {
  return minCents(spendOutflowCents, clampNonNegative(categoryAvailableBeforeCents));
}

// ---------------------------------------------------------------------------
// Move money / cover overspending are just constrained Assignment writes —
// the constraint (can't move more than is available) lives here so the API
// layer and any future client share one rule.
// ---------------------------------------------------------------------------

export class InsufficientFundsError extends Error {
  constructor(availableCents: Cents, requestedCents: Cents) {
    super(`Only ${availableCents} cents available to move, requested ${requestedCents}.`);
  }
}

export function assertCanMove(sourceAvailableCents: Cents, amountCents: Cents): void {
  if (amountCents > sourceAvailableCents) {
    throw new InsufficientFundsError(sourceAvailableCents, amountCents);
  }
}

// ---------------------------------------------------------------------------
// Net worth
// ---------------------------------------------------------------------------

/**
 * Account balances already carry the correct sign (assets positive,
 * liabilities negative, by virtue of how their transactions were entered),
 * so net worth is simply their sum.
 */
export function computeNetWorth(accountBalancesCents: Cents[]): Cents {
  return sum(accountBalancesCents);
}

export { cents };
