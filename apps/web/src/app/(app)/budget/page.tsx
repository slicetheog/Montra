"use client";

import { useCurrentBudget } from "@/hooks/use-current-budget";
import { BudgetScreen } from "@/components/budget/budget-screen";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";

export default function BudgetPage() {
  const { budgetId } = useCurrentBudget();
  if (!budgetId) return <EmptyBudgetState />;
  return <BudgetScreen budgetId={budgetId} />;
}
