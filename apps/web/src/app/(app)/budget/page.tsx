"use client";

import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useMe } from "@/hooks/use-me";
import { BudgetScreen } from "@/components/budget/budget-screen";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";

export default function BudgetPage() {
  const { budgetId } = useCurrentBudget();
  const { data: me, isLoading } = useMe();
  if (!budgetId) return <EmptyBudgetState />;
  // Waits for settings to load (usually already cached by the time this
  // page mounts — see AppShell) so BudgetScreen's initial month always
  // starts from the right firstDayOfMonth instead of the calendar
  // default and then jumping once settings arrive.
  if (isLoading || !me) {
    return (
      <div className="p-6">
        <div className="h-24 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }
  return <BudgetScreen budgetId={budgetId} firstDayOfMonth={me.settings?.firstDayOfMonth ?? 1} />;
}
