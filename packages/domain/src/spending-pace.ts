import { cents, type Cents } from "./money";

export interface SpendingPaceInput {
  /** Positive magnitude: total variable/discretionary spend so far this month. */
  monthToDateSpendCents: Cents;
  /** 1-based day of the month "today" falls on. */
  dayOfMonth: number;
  /** Total number of days in the current month. */
  daysInMonth: number;
  /** Positive magnitude: total spend for the full previous month, for comparison. */
  lastMonthSpendCents: Cents;
}

export interface SpendingPaceResult {
  averagePerDayCents: Cents;
  /** Linear projection: average-per-day-so-far extended across the whole month. */
  projectedFullMonthCents: Cents;
  /** Projected full month vs. last month's actual total, as a fraction (0.12 = 12% more). Null if last month had no spending to compare against. */
  changeVsLastMonth: number | null;
}

/**
 * "At this rate, you're on track to spend $X this month" — a linear
 * burn-rate projection (spend-so-far ÷ days-elapsed × days-in-month),
 * the same technique a runway/pace calculation always uses. Deliberately
 * naive: it assumes today's average holds for the rest of the month,
 * which is usually roughly true and gives an early warning long before
 * month-end, rather than a more "accurate" model that can only speak
 * after the fact.
 */
export function computeSpendingPace(input: SpendingPaceInput): SpendingPaceResult {
  const day = Math.max(1, input.dayOfMonth);
  const averagePerDayCents = cents(Math.round(input.monthToDateSpendCents / day));
  const projectedFullMonthCents = cents(averagePerDayCents * input.daysInMonth);
  const changeVsLastMonth = input.lastMonthSpendCents > 0 ? projectedFullMonthCents / input.lastMonthSpendCents - 1 : null;

  return { averagePerDayCents, projectedFullMonthCents, changeVsLastMonth };
}
