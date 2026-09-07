/**
 * All budget "months" are keyed by their UTC month start (day 1, 00:00:00
 * UTC) so that date-only comparisons never drift due to local timezones —
 * OR, when the caller passes `firstDayOfMonth` (the UserSettings field of
 * the same name, 1-28), keyed by that configured day instead, so a
 * "budget month" tracks a pay cycle (e.g. the 25th) rather than the
 * calendar. Every call site defaults to 1, so omitting it reproduces
 * exactly today's calendar-month behavior — this is opt-in, not a
 * behavior change for anyone who hasn't touched that setting.
 *
 * Only the *live* budget-period calculations (getMonthView, assignMoney/
 * moveMoney, the credit-card offset, the Dashboard's month-to-date
 * figures, the Goals monthly-contribution check) take this parameter —
 * Reports' and Net Worth's historical trend bucketing intentionally stay
 * on fixed calendar months, since a trend chart wants comparable,
 * unambiguous "January/February/..." buckets regardless of pay cycle.
 */
function normalizeFirstDay(firstDayOfMonth: number): number {
  return Math.min(28, Math.max(1, Math.trunc(firstDayOfMonth) || 1));
}

export function monthStart(date: Date, firstDayOfMonth = 1): Date {
  const day = normalizeFirstDay(firstDayOfMonth);
  // Before this month's period-start day, the period actually began the
  // month before — e.g. with firstDayOfMonth=25, Sept 10 belongs to the
  // period that started Aug 25.
  const monthOffset = date.getUTCDate() < day ? -1 : 0;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + monthOffset, day));
}

export function addMonths(date: Date, count: number, firstDayOfMonth = 1): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, normalizeFirstDay(firstDayOfMonth)));
}

export function isSameMonth(a: Date, b: Date, firstDayOfMonth = 1): boolean {
  return monthStart(a, firstDayOfMonth).getTime() === monthStart(b, firstDayOfMonth).getTime();
}

export function monthEndExclusive(date: Date, firstDayOfMonth = 1): Date {
  return addMonths(monthStart(date, firstDayOfMonth), 1, firstDayOfMonth);
}

export function formatMonthKey(date: Date): string {
  const d = monthStart(date);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Ordered list of calendar-month starts from `from` to `to` inclusive — always calendar months, for historical trend bucketing (see the file header comment). */
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
