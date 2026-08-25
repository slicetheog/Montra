"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import { useMe } from "@/hooks/use-me";
import { useHasHydrated } from "@/hooks/use-hydrated";

interface CurrentBudgetState {
  budgetId: string | null;
  setBudgetId: (id: string) => void;
}

const useCurrentBudgetStore = create<CurrentBudgetState>()(
  persist(
    (set) => ({
      budgetId: null,
      setBudgetId: (id) => set({ budgetId: id }),
    }),
    { name: "montra-current-budget" },
  ),
);

/** Resolves the active budget, defaulting to the user's first budget. */
export function useCurrentBudget() {
  const { data: me } = useMe();
  // Server-side rendering never has `me` or the persisted `budgetId`
  // (localStorage doesn't exist there), so both are always null/empty in
  // the server-rendered HTML. On the client, though, the `/api/auth/me`
  // fetch can resolve *before* React's post-hydration recheck fires — so a
  // naive derivation can already see real data on what React still
  // considers the hydration-matching render, producing a mismatch that
  // React will not patch back into the DOM (e.g. a `disabled` attribute
  // stuck at its server value forever). Deriving nothing but `null`/`[]`
  // until `hydrated` flips true guarantees the first client render is
  // byte-for-byte identical to the server's, so the switch to real data
  // always lands as an ordinary post-hydration update instead.
  const hydrated = useHasHydrated();
  const { budgetId, setBudgetId } = useCurrentBudgetStore();
  const persistedId = hydrated ? budgetId : null;
  const budgets = hydrated ? (me?.budgets ?? []) : [];

  useEffect(() => {
    if (!me) return;
    const stillExists = persistedId && me.budgets.some((b) => b.id === persistedId);
    if (!stillExists && me.budgets.length > 0) {
      setBudgetId(me.budgets[0].id);
    }
  }, [me, persistedId, setBudgetId]);

  const activeId = persistedId && budgets.some((b) => b.id === persistedId) ? persistedId : (budgets[0]?.id ?? null);
  const budget = budgets.find((b) => b.id === activeId) ?? null;

  return { budgetId: activeId, budget, budgets, setBudgetId };
}
