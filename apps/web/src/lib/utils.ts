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

export function formatMonthLabel(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(d);
}
