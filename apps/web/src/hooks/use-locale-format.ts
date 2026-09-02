"use client";

import { useCallback } from "react";
import { useMe } from "@/hooks/use-me";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { formatCents as formatCentsRaw, formatDate as formatDateRaw } from "@/lib/utils";

/**
 * The currency a given amount should display in. Budgets can each carry
 * their own currency (set at creation), so the active budget's currency
 * wins; falling back to the account-level Settings preference, then USD.
 * Previously neither of these was ever actually read — every amount in
 * the app rendered as USD regardless of what a user picked.
 */
export function useCurrency(): string {
  const { budget } = useCurrentBudget();
  const { data: me } = useMe();
  return budget?.currency ?? me?.settings?.currency ?? "USD";
}

/** formatCents bound to the viewer's real currency — see useCurrency(). */
export function useFormatCents() {
  const currency = useCurrency();
  return useCallback(
    (amountCents: number, opts: { signDisplay?: "auto" | "exceptZero" | "never" } = {}) =>
      formatCentsRaw(amountCents, { currency, ...opts }),
    [currency],
  );
}

/** formatDate bound to the viewer's Settings → "Date format" preference. */
export function useFormatDate() {
  const { data: me } = useMe();
  const pattern = me?.settings?.dateFormat ?? "MM/DD/YYYY";
  return useCallback((date: string | Date, format: "short" | "long" = "short") => formatDateRaw(date, format, pattern), [pattern]);
}
