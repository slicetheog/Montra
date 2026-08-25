/**
 * All budget "months" are keyed by their UTC month start (day 1, 00:00:00
 * UTC) so that date-only comparisons never drift due to local timezones.
 */
export function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function addMonths(date: Date, count: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, 1));
}

export function isSameMonth(a: Date, b: Date): boolean {
  return monthStart(a).getTime() === monthStart(b).getTime();
}

export function monthEndExclusive(date: Date): Date {
  return addMonths(monthStart(date), 1);
}

export function formatMonthKey(date: Date): string {
  const d = monthStart(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ordered list of month starts from `from` to `to` inclusive. */
export function monthRange(from: Date, to: Date): Date[] {
  const start = monthStart(from);
  const end = monthStart(to);
  const months: Date[] = [];
  let cursor = start;
  // Guard against pathological ranges (e.g. bad input swapping start/end).
  let iterations = 0;
  while (cursor.getTime() <= end.getTime() && iterations < 2400) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
    iterations++;
  }
  return months;
}
