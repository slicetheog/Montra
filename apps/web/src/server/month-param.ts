import { ValidationError } from "@/server/api-helpers";

/**
 * Parses a "YYYY-MM" route param (the calendar month the client's month
 * picker is displaying — see hooks/use-budget-month.ts's monthKey) into
 * the period-start Date for that calendar month.
 *
 * `firstDayOfMonth` pins the day to the user's configured budget-period
 * start (1-28, default 1) *within that literal calendar month* — this is
 * a different operation from @montra/domain's monthStart (which asks
 * "which period does this arbitrary instant belong to," and can roll a
 * date back into the *previous* calendar month). Here the client has
 * already picked a specific calendar month by name, so the day is simply
 * placed inside it, never rolled backward — the client is the one
 * responsible for picking the calendar month whose period is the one it
 * actually wants (see budget-screen.tsx's shiftMonth/initial state,
 * which step by real periods using monthStart/addMonths so the two sides
 * agree).
 */
export function parseMonthParam(month: string, firstDayOfMonth = 1): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new ValidationError("Invalid month — expected YYYY-MM.");
  const day = Math.min(28, Math.max(1, Math.trunc(firstDayOfMonth) || 1));
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, day));
}
