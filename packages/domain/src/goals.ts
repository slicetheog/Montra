import { add, Cents, clampNonNegative, sub, ZERO } from "./money";
import { addMonths, monthStart } from "./dates";

export interface GoalProgress {
  remainingCents: Cents;
  percentComplete: number; // 0-100, clamped
  isComplete: boolean;
}

export function computeGoalProgress(targetCents: Cents, currentCents: Cents): GoalProgress {
  const remaining = clampNonNegative(sub(targetCents, currentCents));
  const percent = targetCents <= 0 ? 100 : Math.min(100, Math.max(0, (currentCents / targetCents) * 100));
  return {
    remainingCents: remaining,
    percentComplete: Math.round(percent * 10) / 10,
    isComplete: currentCents >= targetCents,
  };
}

/**
 * Money needed per month to reach `targetCents` by `targetDate`, given
 * `currentCents` saved as of `asOf`. Whole months are counted from the
 * first of `asOf`'s month to the first of `targetDate`'s month; a target
 * date within the current month recommends the full remainder this month.
 */
export function computeRecommendedMonthlyContribution(params: {
  targetCents: Cents;
  currentCents: Cents;
  targetDate: Date;
  asOf: Date;
}): Cents {
  const remaining = clampNonNegative(sub(params.targetCents, params.currentCents));
  if (remaining === 0) return ZERO;

  const monthsRemaining = monthsBetween(monthStart(params.asOf), monthStart(params.targetDate));
  const divisor = Math.max(1, monthsRemaining);
  return Math.ceil(remaining / divisor) as Cents;
}

/**
 * Given a fixed monthly contribution, project the month the goal will be
 * fully funded. Returns null if the contribution can never reach the
 * target (<=0 and not already met).
 */
export function computeEstimatedCompletionDate(params: {
  targetCents: Cents;
  currentCents: Cents;
  monthlyContributionCents: Cents;
  asOf: Date;
}): Date | null {
  if (params.currentCents >= params.targetCents) return monthStart(params.asOf);
  if (params.monthlyContributionCents <= 0) return null;

  const remaining = sub(params.targetCents, params.currentCents);
  const monthsNeeded = Math.ceil(remaining / params.monthlyContributionCents);
  // Cap the projection at 100 years out so a tiny contribution doesn't
  // produce an absurd date far beyond what Date can meaningfully represent.
  const cappedMonths = Math.min(monthsNeeded, 1200);
  return addMonths(monthStart(params.asOf), cappedMonths);
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + (b.getUTCMonth() - a.getUTCMonth());
}

// ---------------------------------------------------------------------------
// Debt payoff projection (simple fixed-payment amortization)
// ---------------------------------------------------------------------------

export interface DebtPayoffProjection {
  months: number;
  payoffDate: Date | null; // null if the payment never clears the debt
  totalInterestCents: Cents;
  totalPaidCents: Cents;
}

/**
 * Simulates a fixed monthly payment against a balance accruing interest
 * monthly at `annualRateBps` (basis points, e.g. 1999 = 19.99% APR, applied
 * as APR/12 each month). Interest is rounded to the nearest cent each
 * month (standard practice; documented in FINANCIAL_ENGINE.md). Iteration
 * is capped at 600 months (50 years) — if the payment doesn't even cover
 * accruing interest, the debt never clears and we report that rather than
 * loop forever.
 */
export function computeDebtPayoffProjection(params: {
  balanceCents: Cents;
  annualRateBps: number;
  monthlyPaymentCents: Cents;
  asOf: Date;
}): DebtPayoffProjection {
  const MAX_MONTHS = 600;
  let balance = Math.abs(params.balanceCents);
  let totalInterest = 0;
  let months = 0;

  if (balance <= 0) {
    return { months: 0, payoffDate: monthStart(params.asOf), totalInterestCents: ZERO, totalPaidCents: ZERO };
  }

  const monthlyRate = params.annualRateBps / 10000 / 12;

  while (balance > 0 && months < MAX_MONTHS) {
    const interest = Math.round(balance * monthlyRate);
    const payment = Math.min(params.monthlyPaymentCents, balance + interest);
    if (payment <= interest) {
      // Payment doesn't even cover interest — balance never decreases.
      return {
        months: -1,
        payoffDate: null,
        totalInterestCents: totalInterest as Cents,
        totalPaidCents: ZERO,
      };
    }
    balance = balance + interest - payment;
    totalInterest += interest;
    months += 1;
  }

  const cleared = balance <= 0;
  return {
    months: cleared ? months : -1,
    payoffDate: cleared ? addMonths(monthStart(params.asOf), months) : null,
    totalInterestCents: totalInterest as Cents,
    totalPaidCents: cleared ? add(Math.abs(params.balanceCents) as Cents, totalInterest as Cents) : ZERO,
  };
}
