"use client";

import { useState } from "react";
import { AlertTriangle, Plus, Target, Trash2 } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useDeleteGoal, useGoalFeasibility, useGoals, useUpdateGoal, type GoalPriority } from "@/hooks/use-goals";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { AddGoalDialog } from "@/components/goals/add-goal-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";

const PRIORITY_RANK: Record<GoalPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const PRIORITY_LABELS: Record<GoalPriority, string> = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };
const PRIORITY_STYLES: Record<GoalPriority, string> = {
  HIGH: "bg-negative/10 text-negative",
  MEDIUM: "bg-accent/10 text-accent",
  LOW: "bg-surface-muted text-foreground-muted",
};

export default function GoalsPage() {
  const { budgetId } = useCurrentBudget();
  const [addOpen, setAddOpen] = useState(false);
  const goals = useGoals(budgetId);
  const deleteGoal = useDeleteGoal(budgetId);
  const updateGoal = useUpdateGoal(budgetId);
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();

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

  const sortedGoals = [...(goals.data ?? [])].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Goals</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> New goal
        </Button>
      </div>

      <GoalFeasibilityBanner budgetId={budgetId} />

      {goals.isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      ) : sortedGoals.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <Target className="size-8 text-foreground-muted" />
          <p className="text-foreground-muted">No goals yet.</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Create a savings goal and track your progress
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sortedGoals.map((goal) => (
            <Card key={goal.id} className="p-4">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{goal.name}</p>
                  <p className="text-xs text-foreground-muted">{goal.category?.name ?? goal.account?.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Select value={goal.priority} onValueChange={(v) => updateGoal.mutate({ id: goal.id, input: { priority: v as GoalPriority } })}>
                    <SelectTrigger className={cn("h-6 w-auto gap-1 border-none px-2 py-0 text-[10px] font-medium", PRIORITY_STYLES[goal.priority])}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <button onClick={() => handleDelete(goal.id)} className="text-foreground-muted hover:text-negative" aria-label="Delete goal">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>

              {goal.progress && (
                <>
                  <Progress
                    value={goal.progress.percentComplete}
                    className="mb-1.5"
                    aria-label={`${goal.name} progress`}
                  />
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

/**
 * "Your goals want $X/mo but you only have $Y left over" — a reality
 * check against Ready to Assign, run in priority order so it's clear not
 * just whether everything fits but which goals do (see
 * server/services/goals.ts's getGoalFeasibility). Silent whenever
 * everything already fits — this only needs to speak up when it's telling
 * you something.
 */
function GoalFeasibilityBanner({ budgetId }: { budgetId: string }) {
  const feasibility = useGoalFeasibility(budgetId);
  const formatCents = useFormatCents();
  const data = feasibility.data;
  if (!data || !data.isOverCommitted) return null;

  const firstShortfall = data.items.find((i) => !i.fits);

  return (
    <Card className="mb-4 flex items-start gap-3 border-negative/30 bg-negative/5 p-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-negative" />
      <div className="text-sm">
        <p>
          Your goals ask for <span className="font-medium">{formatCents(data.totalRequestedCents)}/mo</span>, but only{" "}
          <span className="font-medium">{formatCents(data.availableCents)}</span> is ready to assign right now.
        </p>
        {firstShortfall && (
          <p className="mt-1 text-foreground-muted">
            Going in priority order, <span className="font-medium">{firstShortfall.name}</span> is the first one that doesn&apos;t fit yet —
            lower a Low-priority goal&apos;s contribution, or free up money elsewhere.
          </p>
        )}
      </div>
    </Card>
  );
}
