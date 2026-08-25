"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CategoryRow, CategoryRowHeader } from "@/components/budget/category-row";
import { MoveMoneyDialog } from "@/components/budget/move-money-dialog";
import { useAssignMoney, useBudgetMonth, useMoveMoney } from "@/hooks/use-budget-month";
import { formatCents, formatMonthLabel, cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function BudgetScreen({ budgetId }: { budgetId: string }) {
  const [month, setMonth] = useState(() => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)));
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [moveDialogFor, setMoveDialogFor] = useState<string | null | "open">(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addCategoryFor, setAddCategoryFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const queryClient = useQueryClient();
  const { data, isLoading } = useBudgetMonth(budgetId, month);
  const assignMoney = useAssignMoney(budgetId, month);
  const moveMoney = useMoveMoney(budgetId, month);

  function shiftMonth(delta: number) {
    setMonth((m) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + delta, 1)));
  }

  const filteredGroups = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.groups;
    const q = search.trim().toLowerCase();
    return data.groups
      .map((g) => ({ ...g, categories: g.categories.filter((c) => c.name.toLowerCase().includes(q)) }))
      .filter((g) => g.categories.length > 0);
  }, [data, search]);

  async function invalidateGroups() {
    await queryClient.invalidateQueries({ queryKey: ["budget-month", budgetId] });
  }

  async function createGroup() {
    if (!newName.trim()) return;
    await api.post(`/api/budgets/${budgetId}/category-groups`, { name: newName.trim() });
    setNewName("");
    setAddGroupOpen(false);
    await invalidateGroups();
    toast.success("Category group added.");
  }

  async function createCategory(groupId: string) {
    if (!newName.trim()) return;
    await api.post(`/api/budgets/${budgetId}/categories`, { groupId, name: newName.trim() });
    setNewName("");
    setAddCategoryFor(null);
    await invalidateGroups();
    toast.success("Category added.");
  }

  if (isLoading || !data) {
    return (
      <div className="p-6">
        <div className="h-24 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  const readyToAssign = data.readyToAssignCents;
  const fullyBudgeted = readyToAssign === 0;

  return (
    <div className="flex flex-col">
      <h1 className="sr-only">Budget</h1>
      <div className="border-b border-border bg-surface px-4 py-4 sm:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              <ChevronLeft className="size-4" />
            </Button>
            <span className="w-40 text-center text-base font-semibold" aria-live="polite">
              {formatMonthLabel(month)}
            </span>
            <Button variant="ghost" size="icon" onClick={() => shiftMonth(1)} aria-label="Next month">
              <ChevronRight className="size-4" />
            </Button>
          </div>
          <div className="relative w-48 sm:w-64">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-foreground-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search categories"
              className="pl-8"
              aria-label="Search categories"
            />
          </div>
        </div>

        <div
          className={cn(
            "mt-4 flex flex-col items-start justify-between gap-3 rounded-lg p-4 sm:flex-row sm:items-center",
            fullyBudgeted ? "bg-positive-tint" : readyToAssign < 0 ? "bg-negative-tint" : "bg-brand-tint",
          )}
        >
          <div>
            <p
              className={cn(
                "text-2xl font-semibold tabular-nums",
                fullyBudgeted ? "text-positive" : readyToAssign < 0 ? "text-negative" : "text-brand-strong",
              )}
            >
              {formatCents(readyToAssign)}
            </p>
            <p className="text-sm text-foreground-muted">
              {fullyBudgeted
                ? "You're fully budgeted — every dollar has a job."
                : readyToAssign < 0
                  ? "You've assigned more than you have. Reduce some assignments below."
                  : "Available to budget — assign it to your priorities below."}
            </p>
          </div>
          <div className="flex gap-6 text-right text-sm">
            <div>
              <p className="text-foreground-muted">Assigned</p>
              <p className="font-medium tabular-nums">{formatCents(data.totals.totalAssignedCents)}</p>
            </div>
            <div>
              <p className="text-foreground-muted">Activity</p>
              <p className="font-medium tabular-nums">{formatCents(data.totals.totalActivityCents)}</p>
            </div>
            <div>
              <p className="text-foreground-muted">Available</p>
              <p className="font-medium tabular-nums">{formatCents(data.totals.totalAvailableCents)}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6">
        {filteredGroups.length === 0 && !search && (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
            <p className="text-foreground-muted">No categories yet.</p>
            <Button onClick={() => setAddGroupOpen(true)}>
              <Plus className="size-4" />
              Create your first category group
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {filteredGroups.map((group) => {
            const isCollapsed = collapsed[group.groupId];
            return (
              <div key={group.groupId} className="overflow-hidden rounded-lg border border-border bg-surface">
                <div className="flex w-full items-center gap-2 bg-surface-muted px-3 py-2 text-sm font-semibold">
                  <button
                    type="button"
                    onClick={() => setCollapsed((c) => ({ ...c, [group.groupId]: !c[group.groupId] }))}
                    className="flex flex-1 items-center gap-2 text-left"
                    aria-expanded={!isCollapsed}
                  >
                    <ChevronDown className={cn("size-4 shrink-0 transition-transform", isCollapsed && "-rotate-90")} />
                    {group.name}
                  </button>
                  {!group.isSystem && (
                    <button
                      type="button"
                      onClick={() => setAddCategoryFor(group.groupId)}
                      className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-normal text-foreground-muted hover:bg-surface hover:text-foreground"
                    >
                      <Plus className="size-3" /> Category
                    </button>
                  )}
                </div>
                {!isCollapsed && (
                  <div>
                    <CategoryRowHeader />
                    {group.categories.map((category) => (
                      <CategoryRow
                        key={category.categoryId}
                        category={category}
                        onAssign={async (categoryId, cents) => {
                          const delta = cents - category.assignedCents;
                          if (delta === 0) return;
                          await assignMoney.mutateAsync({ categoryId, amountCents: delta });
                        }}
                        onMoveMoney={(categoryId) => setMoveDialogFor(categoryId)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <Button variant="outline" className="mt-4" onClick={() => setAddGroupOpen(true)}>
          <Plus className="size-4" />
          Add category group
        </Button>
      </div>

      <MoveMoneyDialog
        open={Boolean(moveDialogFor)}
        onOpenChange={(open) => !open && setMoveDialogFor(null)}
        groups={data.groups}
        fromCategoryId={typeof moveDialogFor === "string" ? moveDialogFor : null}
        onMove={(input) => moveMoney.mutateAsync(input)}
      />

      <Dialog open={addGroupOpen} onOpenChange={setAddGroupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category group</DialogTitle>
          </DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Housing" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddGroupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createGroup}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(addCategoryFor)} onOpenChange={(open) => !open && setAddCategoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New category</DialogTitle>
          </DialogHeader>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Groceries" autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddCategoryFor(null)}>
              Cancel
            </Button>
            <Button onClick={() => addCategoryFor && createCategory(addCategoryFor)}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
