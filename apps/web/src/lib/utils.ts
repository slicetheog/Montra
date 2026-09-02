import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format integer cents as a locale currency string for display. */
export function formatCents(
  amountCents: number,
  opts: { currency?: string; signDisplay?: "auto" | "exceptZero" | "never" } = {},
): string {
  const { currency = "USD", signDisplay = "auto" } = opts;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay,
  }).format(amountCents / 100);
}

/**
 * `pattern` is the Settings → Preferences → "Date format" value
 * (MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD) — see useFormatDate(), which
 * binds this to the viewer's actual saved preference. The default here
 * ("MM/DD/YYYY") reproduces this function's original US-convention output
 * exactly, so a call site that hasn't been migrated to the hook yet is
 * unaffected. ISO (YYYY-MM-DD) always renders as plain digits, since that
 * format doesn't have a "long, named-month" convention to begin with;
 * MM/DD/YYYY and DD/MM/YYYY instead just reorder "Month Day, Year" vs.
 * "Day Month Year" — friendlier than raw digits for a "short" label, and
 * still the real distinction the setting promises.
 */
export function formatDate(date: string | Date, format: "short" | "long" = "short", pattern: string = "MM/DD/YYYY"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (pattern === "YYYY-MM-DD") {
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const day = d.getUTCDate();
  const year = d.getUTCFullYear();
  const month = new Intl.DateTimeFormat("en-US", { month: format === "long" ? "long" : "short", timeZone: "UTC" }).format(d);
  return pattern === "DD/MM/YYYY" ? `${day} ${month} ${year}` : `${month} ${day}, ${year}`;
}

/**
 * Whole calendar days from today until `date`, both compared as UTC dates
 * (matching how the app stores every other date — see FINANCIAL_ENGINE.md)
 * rather than the viewer's local timezone, so this can't say "tomorrow" or
 * "today" a day off from what the date itself actually says.
 */
export function daysUntil(date: string | Date): number {
  const d = typeof date === "string" ? new Date(date) : date;
  const targetUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((targetUtc - todayUtc) / 86_400_000);
}

export function formatMonthLabel(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(d);
}
