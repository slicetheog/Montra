"use client";

import { useState } from "react";
import { Plus, Target, Trash2 } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useDeleteGoal, useGoals } from "@/hooks/use-goals";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { AddGoalDialog } from "@/components/goals/add-goal-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCents, formatDate, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

export default function GoalsPage() {
  const { budgetId } = useCurrentBudget();
  const [addOpen, setAddOpen] = useState(false);
  const goals = useGoals(budgetId);
  const deleteGoal = useDeleteGoal(budgetId);

  if (!budgetId) return <EmptyBudgetState />;

  async function handleDelete(id: string) {
    if (!confirm("Delete this goal? Your money and category stay put — only the goal tracking is removed.")) return;
    try {
      await deleteGoal.mutateAsync(id);
      toast.success("Goal deleted.");
    } catch {
      toast.error("Couldn't delete that goal. Please try again.");
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Goals</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> New goal
        </Button>
      </div>

      {goals.isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      ) : (goals.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <Target className="size-8 text-foreground-muted" />
          <p className="text-foreground-muted">No goals yet.</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Create a savings goal and track your progress
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.data!.map((goal) => (
            <Card key={goal.id} className="p-4">
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <p className="font-semibold">{goal.name}</p>
                  <p className="text-xs text-foreground-muted">{goal.category?.name ?? goal.account?.name}</p>
                </div>
                <button onClick={() => handleDelete(goal.id)} className="text-foreground-muted hover:text-negative" aria-label="Delete goal">
                  <Trash2 className="size-4" />
                </button>
              </div>

              {goal.progress && (
                <>
                  <Progress value={goal.progress.percentComplete} className="mb-1.5" />
                  <div className="flex items-center justify-between text-xs text-foreground-muted">
                    <span>{formatCents(goal.currentAmountCents)} saved</span>
                    <span>{Math.round(goal.progress.percentComplete)}%</span>
                  </div>
                </>
              )}

              <div className="mt-3 flex flex-col gap-1 text-sm">
                {goal.targetAmountCents != null && (
                  <p>
                    Target: <span className="font-medium">{formatCents(goal.targetAmountCents)}</span>
                  </p>
                )}
                {goal.targetDate && (
                  <p>
                    By: <span className="font-medium">{formatDate(goal.targetDate)}</span>
                  </p>
                )}
                {goal.progress?.isComplete && <p className="font-medium text-positive">Goal reached! 🎉</p>}
                {goal.type === "DEBT_PAYOFF" &&
                  goal.projection != null &&
                  typeof goal.projection === "object" &&
                  "payoffDate" in goal.projection && (
                    <p className={cn((goal.projection as { payoffDate: string | null }).payoffDate ? "" : "text-negative")}>
                      {(goal.projection as { payoffDate: string | null }).payoffDate
                        ? `Payoff by ${formatDate((goal.projection as { payoffDate: string }).payoffDate)}`
                        : "Current payment won't pay this off — increase it on the Debt page."}
                    </p>
                  )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <AddGoalDialog open={addOpen} onOpenChange={setAddOpen} budgetId={budgetId} />
    </div>
  );
}
