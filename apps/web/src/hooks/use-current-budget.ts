"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useEffect } from "react";
import { useMe } from "@/hooks/use-me";

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
  const { budgetId, setBudgetId } = useCurrentBudgetStore();

  useEffect(() => {
    if (!me) return;
    const stillExists = budgetId && me.budgets.some((b) => b.id === budgetId);
    if (!stillExists && me.budgets.length > 0) {
      setBudgetId(me.budgets[0].id);
    }
  }, [me, budgetId, setBudgetId]);

  const budgets = me?.budgets ?? [];
  const activeId = budgetId && budgets.some((b) => b.id === budgetId) ? budgetId : (budgets[0]?.id ?? null);
  const budget = budgets.find((b) => b.id === activeId) ?? null;

  return { budgetId: activeId, budget, budgets, setBudgetId };
}
