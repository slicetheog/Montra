import { cents, type Cents } from "./money";

export type RecurrenceFrequency =
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "EVERY_N_MONTHS"
  | "YEARLY"
  | "CUSTOM";

/**
 * Computes the next occurrence date after `from`. `intervalCount` is used
 * by EVERY_N_MONTHS (months) and CUSTOM (days) — for every other frequency
 * it's ignored so a bad/legacy value can't silently change behavior.
 */
export function computeNextOccurrence(
  from: Date,
  frequency: RecurrenceFrequency,
  intervalCount = 1,
): Date {
  const d = new Date(from.getTime());
  switch (frequency) {
    case "DAILY":
      d.setUTCDate(d.getUTCDate() + 1);
      return d;
    case "WEEKLY":
      d.setUTCDate(d.getUTCDate() + 7);
      return d;
    case "BIWEEKLY":
      d.setUTCDate(d.getUTCDate() + 14);
      return d;
    case "MONTHLY":
      return addCalendarMonths(d, 1);
    case "EVERY_N_MONTHS":
      return addCalendarMonths(d, Math.max(1, intervalCount));
    case "YEARLY":
      return addCalendarMonths(d, 12);
    case "CUSTOM":
      d.setUTCDate(d.getUTCDate() + Math.max(1, intervalCount));
      return d;
  }
}

/**
 * How many times a year a series with this cadence lands — the same idea
 * as a budgeting spreadsheet's frequency-conversion table (a $600 annual
 * bill "costs" $50/month, so every bill can be compared on equal footing
 * regardless of how often it's actually paid). DAILY and CUSTOM use 365
 * rather than 365.25 — close enough for a display estimate, and it keeps
 * every case here an exact, auditable ratio.
 */
export function occurrencesPerYear(frequency: RecurrenceFrequency, intervalCount = 1): number {
  const n = Math.max(1, intervalCount);
  switch (frequency) {
    case "DAILY":
      return 365 / n;
    case "WEEKLY":
      return 52 / n;
    case "BIWEEKLY":
      return 26;
    case "MONTHLY":
      return 12;
    case "EVERY_N_MONTHS":
      return 12 / n;
    case "YEARLY":
      return 1;
    case "CUSTOM":
      return 365 / n;
  }
}

/** Normalizes any cadence to a monthly-equivalent figure for apples-to-apples comparison. */
export function monthlyEquivalentCents(amountCents: Cents, frequency: RecurrenceFrequency, intervalCount = 1): Cents {
  return cents(Math.round((amountCents * occurrencesPerYear(frequency, intervalCount)) / 12));
}

function addCalendarMonths(date: Date, count: number): Date {
  const day = date.getUTCDate();
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
  // Clamp to the last day of the target month so "Jan 31 + 1mo" -> Feb 28/29,
  // not silently rolling into March.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  target.setUTCHours(date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds());
  return target;
}

/**
 * Expands all occurrences of a recurring transaction due on or before
 * `until`, starting strictly after `after` (the last-created occurrence, or
 * the series start date). Bounded by `endDate`/`occurrencesLimit` when set.
 * Used both to materialize due transactions and to preview upcoming ones.
 */
export function expandOccurrences(params: {
  after: Date;
  until: Date;
  frequency: RecurrenceFrequency;
  intervalCount?: number;
  endDate?: Date | null;
  occurrencesLimit?: number | null;
  occurrencesAlreadyCreated?: number;
  maxResults?: number;
}): Date[] {
  const {
    after,
    until,
    frequency,
    intervalCount = 1,
    endDate,
    occurrencesLimit,
    occurrencesAlreadyCreated = 0,
    maxResults = 500,
  } = params;

  const results: Date[] = [];
  let cursor = after;
  let created = occurrencesAlreadyCreated;

  while (results.length < maxResults) {
    const next = computeNextOccurrence(cursor, frequency, intervalCount);
    if (next.getTime() > until.getTime()) break;
    if (endDate && next.getTime() > endDate.getTime()) break;
    if (occurrencesLimit != null && created >= occurrencesLimit) break;
    results.push(next);
    cursor = next;
    created += 1;
  }
  return results;
}
