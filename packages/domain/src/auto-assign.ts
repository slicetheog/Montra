import { add, cents, clampNonNegative, isPositive, max, scaleProportionally, sub, sum, ZERO, type Cents } from "./money";
import { expandOccurrences, type RecurrenceFrequency } from "./recurrence";

/**
 * Autopilot budgeting: proposes a full period's category assignments from
 * data the app already has — recurring bills due in the target period, and
 * (for categories with no recurring bill of their own) a recent spending
 * average — instead of assigning every category by hand every month.
 *
 * Two-step split, mirroring how this is actually used:
 *  1. `recurringDueCents` for a category — sum up every recurring series'
 *     occurrences landing in the target period (see `sumRecurringDue`).
 *  2. `buildAutoAssignPlan` turns that (plus a spending average and the
 *     category's current Available) into a plan: how much more each
 *     category needs, scaled down to fit Ready to Assign if the raw asks
 *     exceed it.
 */

export interface RecurringBillSeries {
  categoryId: string;
  /** Absolute magnitude — this module only deals in expense bills, never signed. */
  amountCents: Cents;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  /** The series' next not-yet-materialized occurrence — same field RecurringTransaction stores. Caller is responsible for catching this up to "now" first (see services/recurring.ts's catchUpSchedule), same as the cash-flow forecast does. */
  nextOccurrenceDate: Date;
  endDate?: Date | null;
  occurrencesLimit?: number | null;
  occurrencesAlreadyCreated?: number;
}

/**
 * How many times, and for how much total, a single series lands within
 * `[periodStart, periodEndExclusive)`.
 */
function occurrencesInPeriod(series: RecurringBillSeries, periodStart: Date, periodEndExclusive: Date): number {
  const dates: Date[] = [];
  if (series.nextOccurrenceDate.getTime() < periodEndExclusive.getTime()) {
    dates.push(series.nextOccurrenceDate);
  }
  const rest = expandOccurrences({
    after: series.nextOccurrenceDate,
    until: new Date(periodEndExclusive.getTime() - 1),
    frequency: series.frequency,
    intervalCount: series.intervalCount,
    endDate: series.endDate ?? undefined,
    occurrencesLimit: series.occurrencesLimit ?? undefined,
    occurrencesAlreadyCreated: (series.occurrencesAlreadyCreated ?? 0) + dates.length,
  });
  return [...dates, ...rest].filter((d) => d.getTime() >= periodStart.getTime() && d.getTime() < periodEndExclusive.getTime()).length;
}

/**
 * Sums every series' occurrences landing in the target period, grouped by
 * category — the "known, certain" half of a category's suggested amount.
 * A biweekly bill landing twice in one period counts twice; that's correct
 * (it really will happen twice).
 */
export function sumRecurringDue(
  series: RecurringBillSeries[],
  periodStart: Date,
  periodEndExclusive: Date,
): Map<string, Cents> {
  const byCategory = new Map<string, Cents>();
  for (const s of series) {
    const count = occurrencesInPeriod(s, periodStart, periodEndExclusive);
    if (count === 0) continue;
    const due = cents(s.amountCents * count);
    byCategory.set(s.categoryId, add(byCategory.get(s.categoryId) ?? ZERO, due));
  }
  return byCategory;
}

export interface AutoAssignCategoryInput {
  categoryId: string;
  /** Current Available for this category this period — rollover + assigned + activity so far. Can be negative if overspent. */
  currentAvailableCents: Cents;
  /** Sum of this category's recurring-bill occurrences landing in the target period — 0 if it has none. */
  recurringDueCents: Cents;
  /** Absolute average of recent months' spending in this category. Ignored for a category that already has a recurring bill covering it, so a bill and its own past payments are never double-counted. */
  historicalAverageCents: Cents;
}

export interface AutoAssignLine {
  categoryId: string;
  /** The suggested delta to assign — always positive; a category needing nothing has no line at all. */
  amountCents: Cents;
  source: "recurring" | "average";
}

export interface AutoAssignPlan {
  lines: AutoAssignLine[];
  /** Sum of every line's amountCents, after any scale-down. */
  totalCents: Cents;
  readyToAssignCents: Cents;
  /** readyToAssignCents - totalCents; always >= 0. */
  remainingCents: Cents;
  /** True when the raw asks exceeded Ready to Assign and every line was scaled down proportionally to fit. */
  wasScaledDown: boolean;
}

/**
 * Builds the suggested plan. Each category's raw ask is
 * max(recurringDue, historicalAverage) minus whatever's already sitting in
 * Available — so a category with a big rollover balance already covering
 * next month's bill gets asked for nothing more. If the raw asks add up to
 * more than Ready to Assign, every line is scaled down proportionally
 * (via money.ts's scaleProportionally) rather than funding some categories
 * in full and others not at all.
 */
export function buildAutoAssignPlan(params: {
  categories: AutoAssignCategoryInput[];
  readyToAssignCents: Cents;
}): AutoAssignPlan {
  const { categories, readyToAssignCents } = params;

  const raw = categories
    .map((c) => {
      const need = max(c.recurringDueCents, c.historicalAverageCents);
      const source: AutoAssignLine["source"] = isPositive(c.recurringDueCents) ? "recurring" : "average";
      const shortfall = clampNonNegative(sub(need, max(c.currentAvailableCents, ZERO)));
      return { categoryId: c.categoryId, amountCents: shortfall, source };
    })
    .filter((line) => isPositive(line.amountCents));

  const totalRaw = sum(raw.map((l) => l.amountCents));
  const budget = clampNonNegative(readyToAssignCents);

  let lines = raw;
  let wasScaledDown = false;
  if (isPositive(totalRaw) && totalRaw > budget) {
    const scaled = scaleProportionally(
      raw.map((l) => l.amountCents),
      budget,
    );
    lines = raw.map((l, i) => ({ ...l, amountCents: scaled[i] })).filter((l) => isPositive(l.amountCents));
    wasScaledDown = true;
  }

  const totalCents = sum(lines.map((l) => l.amountCents));
  return {
    lines,
    totalCents,
    readyToAssignCents,
    remainingCents: clampNonNegative(sub(readyToAssignCents, totalCents)),
    wasScaledDown,
  };
}
