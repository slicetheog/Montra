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

export function formatDate(date: string | Date, format: "short" | "long" = "short"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: format === "long" ? "long" : "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
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
