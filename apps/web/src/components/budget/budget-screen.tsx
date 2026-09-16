"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, MoreVertical, Pencil, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { monthStart, addMonths } from "@montra/domain";
import { CategoryRow, CategoryRowHeader } from "@/components/budget/category-row";
import { MoveMoneyDialog } from "@/components/budget/move-money-dialog";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import {
  useAssignMoney,
  useApplyAutoAssign,
  useAutoAssignPlan,
  useBudgetMonth,
  useMoveMoney,
  type CategoryMonthView,
} from "@/hooks/use-budget-month";
import { formatMonthLabel, cn } from "@/lib/utils";
import { useFormatCents } from "@/hooks/use-locale-format";
import { api, ApiRequestError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function BudgetScreen({ budgetId, firstDayOfMonth }: { budgetId: string; firstDayOfMonth: number }) {
  // The real current *period* start (which can fall in the previous
  // calendar month, e.g. Aug 25 for a Sept-10 "today" with
  // firstDayOfMonth=25) — not always the 1st. shiftMonth then steps by
  // whole periods the same way, so the two stay in agreement; see
  // server/month-param.ts's doc comment for how this round-trips through
  // the "YYYY-MM" URL key.
  const [month, setMonth] = useState(() => monthStart(new Date(), firstDayOfMonth));
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [moveDialogFor, setMoveDialogFor] = useState<string | null | "open">(null);
  const [addGroupOpen, setAddGroupOpen] = useState(false);
  const [addCategoryFor, setAddCategoryFor] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ kind: "category" | "group"; id: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [autoAssignOpen, setAutoAssignOpen] = useState(false);

  const queryClient = useQueryClient();
  const formatCents = useFormatCents();
  const { data, isLoading } = useBudgetMonth(budgetId, month);
  const assignMoney = useAssignMoney(budgetId, month);
  const moveMoney = useMoveMoney(budgetId, month);
  const { data: autoAssignPlan, isLoading: autoAssignLoading } = useAutoAssignPlan(budgetId, month, autoAssignOpen);
  const applyAutoAssign = useApplyAutoAssign(budgetId, month);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    data?.groups.forEach((g) => g.categories.forEach((c) => map.set(c.categoryId, c.name)));
    return map;
  }, [data]);

  async function confirmAutoAssign() {
    if (!autoAssignPlan || autoAssignPlan.lines.length === 0) return;
    const lines = autoAssignPlan.lines.map((l) => ({ categoryId: l.categoryId, amountCents: l.amountCents }));
    try {
      await applyAutoAssign.mutateAsync(lines);
      setAutoAssignOpen(false);
      toast.success(`Assigned ${formatCents(autoAssignPlan.totalCents)} across ${lines.length} ${lines.length === 1 ? "category" : "categories"}.`);
    } catch {
      toast.error("Couldn't apply the plan. Please try again.");
    }
  }

  function shiftMonth(delta: number) {
    setMonth((m) => addMonths(m, delta, firstDayOfMonth));
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

  async function submitRename() {
    if (!renameTarget || !newName.trim()) return;
    const path =
      renameTarget.kind === "category"
        ? `/api/budgets/${budgetId}/categories/${renameTarget.id}`
        : `/api/budgets/${budgetId}/category-groups/${renameTarget.id}`;
    try {
      await api.patch(path, { name: newName.trim() });
      setRenameTarget(null);
      setNewName("");
      await invalidateGroups();
      toast.success(renameTarget.kind === "category" ? "Category renamed." : "Category group renamed.");
    } catch {
      toast.error("Couldn't rename that. Please try again.");
    }
  }

  async function deleteCategory(category: CategoryMonthView) {
    // Archiving hides the category going forward, but the money already
    // assigned into it permanently stays counted against Ready to Assign
    // (that's the correct zero-based-budgeting behavior — archiving a
    // category never retroactively "frees up" cash you already gave it a
    // job). Any leftover balance just becomes invisible, so warn instead
    // of silently discarding it.
    const consequence =
      category.availableCents !== 0
        ? `It still has ${formatCents(category.availableCents)} available — that money stays counted in your budget, but you won't be able to view or move it once the category is gone.`
        : "This can't be undone.";
    if (!confirm(`Delete "${category.name}"? ${consequence}`)) return;
    try {
      await api.patch(`/api/budgets/${budgetId}/categories/${category.categoryId}`, { isArchived: true });
      await invalidateGroups();
      toast.success("Category deleted.");
    } catch {
      toast.error("Couldn't delete that category. Please try again.");
    }
  }

  async function deleteGroup(groupId: string, groupName: string) {
    const group = data?.groups.find((g) => g.groupId === groupId);
    if (group && group.categories.length > 0) {
      toast.error("Delete or move its categories first — a group can't be deleted while it still has categories in it.");
      return;
    }
    if (!confirm(`Delete "${groupName}"? This can't be undone.`)) return;
    try {
      await api.patch(`/api/budgets/${budgetId}/category-groups/${groupId}`, { isArchived: true });
      await invalidateGroups();
      toast.success("Category group deleted.");
    } catch (error) {
      toast.error(error instanceof ApiRequestError ? error.message : "Couldn't delete that group. Please try again.");
    }
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
            <p className="flex items-center gap-1.5 text-2xl font-semibold tabular-nums">
              <span className={cn(fullyBudgeted ? "text-positive" : readyToAssign < 0 ? "text-negative" : "text-brand-strong")}>
                {formatCents(readyToAssign)}
              </span>
              <InfoTooltip content="Income you haven't assigned a job to yet — it grows when on-budget income lands and shrinks whenever you assign money to a category, across all time." />
            </p>
            <p className="text-sm text-foreground-muted">
              {fullyBudgeted
                ? "You're fully budgeted — every dollar has a job."
                : readyToAssign < 0
                  ? "You've assigned more than you have. Reduce some assignments below."
                  : "Available to budget — assign it to your priorities below."}
            </p>
            {readyToAssign > 0 && (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => setAutoAssignOpen(true)}>
                <Sparkles className="size-3.5" />
                Auto-assign
              </Button>
            )}
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
              <div
                key={group.groupId}
                data-testid={`category-group-${group.groupId}`}
                className="overflow-hidden rounded-lg border border-border bg-surface"
              >
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
                    <>
                      <button
                        type="button"
                        onClick={() => setAddCategoryFor(group.groupId)}
                        className="flex shrink-0 items-center gap-1 rounded px-2 py-0.5 text-xs font-normal text-foreground-muted hover:bg-surface hover:text-foreground"
                      >
                        <Plus className="size-3" /> Category
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            data-testid={`group-menu-${group.groupId}`}
                            className="flex size-6 shrink-0 items-center justify-center rounded text-foreground-muted hover:bg-surface hover:text-foreground"
                            aria-label={`More actions for ${group.name} group`}
                          >
                            <MoreVertical className="size-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setRenameTarget({ kind: "group", id: group.groupId });
                              setNewName(group.name);
                            }}
                          >
                            <Pencil className="size-3.5" /> Rename group
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteGroup(group.groupId, group.name)}
                            className="text-negative focus:text-negative"
                          >
                            <Trash2 className="size-3.5" /> Delete group
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
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
                        onRename={(c) => {
                          setRenameTarget({ kind: "category", id: c.categoryId });
                          setNewName(c.name);
                        }}
                        onDelete={deleteCategory}
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

      <Dialog open={Boolean(renameTarget)} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{renameTarget?.kind === "group" ? "Rename category group" : "Rename category"}</DialogTitle>
          </DialogHeader>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && submitRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancel
            </Button>
            <Button onClick={submitRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={autoAssignOpen} onOpenChange={setAutoAssignOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-brand" />
              Auto-assign
              <InfoTooltip content="Suggests an assignment for every category from what Montra already knows: recurring bills due this period, and — for categories with no bill of their own — a recent spending average. Nothing is assigned until you apply it." />
            </DialogTitle>
          </DialogHeader>

          {autoAssignLoading ? (
            <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
          ) : !autoAssignPlan || autoAssignPlan.lines.length === 0 ? (
            <p className="py-6 text-center text-sm text-foreground-muted">
              Nothing to suggest right now — every category already looks covered.
            </p>
          ) : (
            <>
              <div className="flex max-h-80 flex-col gap-1 overflow-y-auto">
                {autoAssignPlan.lines.map((line) => (
                  <div key={line.categoryId} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{categoryNameById.get(line.categoryId) ?? "Unknown category"}</span>
                      <span className="shrink-0 rounded-full bg-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground-muted">
                        {line.source === "recurring" ? "Recurring bill" : "Recent average"}
                      </span>
                    </div>
                    <span className="shrink-0 font-medium tabular-nums text-positive">+{formatCents(line.amountCents)}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-foreground-muted">Total to assign</span>
                  <span className="font-semibold tabular-nums">{formatCents(autoAssignPlan.totalCents)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-foreground-muted">Ready to Assign after</span>
                  <span className="font-medium tabular-nums">{formatCents(autoAssignPlan.remainingCents)}</span>
                </div>
                {autoAssignPlan.wasScaledDown && (
                  <p className="mt-1 text-xs text-foreground-muted">
                    These bills and averages added up to more than you have Ready to Assign, so every suggestion was scaled down
                    proportionally to fit.
                  </p>
                )}
              </div>
            </>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setAutoAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmAutoAssign} disabled={!autoAssignPlan || autoAssignPlan.lines.length === 0 || applyAutoAssign.isPending}>
              {applyAutoAssign.isPending ? "Assigning…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
