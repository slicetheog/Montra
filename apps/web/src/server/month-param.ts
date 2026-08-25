import { ValidationError } from "@/server/api-helpers";

/** Parses a "YYYY-MM" route param into a UTC month-start Date. */
export function parseMonthParam(month: string): Date {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new ValidationError("Invalid month — expected YYYY-MM.");
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}
