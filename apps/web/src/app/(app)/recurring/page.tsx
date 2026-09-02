"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Repeat, Sparkles, Trash2, X } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import {
  useCreateRecurring,
  useDeleteRecurring,
  useRecurring,
  useRecurringSuggestions,
  useUpdateRecurring,
  type RecurringCandidate,
} from "@/hooks/use-recurring";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { AddRecurringDialog } from "@/components/recurring/add-recurring-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  EVERY_N_MONTHS: "Every few months",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};

export default function RecurringPage() {
  const { budgetId } = useCurrentBudget();
  const [addOpen, setAddOpen] = useState(false);
  const recurring = useRecurring(budgetId);
  const updateRecurring = useUpdateRecurring(budgetId);
  const deleteRecurring = useDeleteRecurring(budgetId);
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();

  if (!budgetId) return <EmptyBudgetState />;

  async function handleDelete(id: string) {
    if (!confirm("Delete this recurring transaction? Past transactions it already created stay put.")) return;
    try {
      await deleteRecurring.mutateAsync(id);
      toast.success("Recurring transaction deleted.");
    } catch {
      toast.error("Couldn't delete that. Please try again.");
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> Dashboard
      </Link>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring transactions</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> New recurring transaction
        </Button>
      </div>

      <RecurringSuggestions key={budgetId} budgetId={budgetId} />

      {recurring.isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      ) : (recurring.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <Repeat className="size-8 text-foreground-muted" />
          <p className="text-foreground-muted">No recurring transactions yet.</p>
          <p className="max-w-sm text-sm text-foreground-muted">
            Rent, a paycheck, subscriptions — anything that repeats can be set up once here.
          </p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add your first recurring transaction
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recurring.data!.map((r) => (
            <Card key={r.id} className="flex items-center justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.payee?.name ?? r.memo ?? r.account.name}</p>
                <p className="text-xs text-foreground-muted">
                  {FREQUENCY_LABELS[r.frequency]} · Next {formatDate(r.nextOccurrenceDate)} · {r.account.name}
                  {r.category ? ` · ${r.category.name}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-medium tabular-nums">{formatCents(r.amountCents)}</span>
              <label className="flex shrink-0 items-center gap-2 text-xs text-foreground-muted">
                Auto-create
                <Switch
                  checked={r.autoCreate}
                  onCheckedChange={(v) => updateRecurring.mutate({ id: r.id, input: { autoCreate: v } })}
                />
              </label>
              <button
                onClick={() => handleDelete(r.id)}
                className="shrink-0 text-foreground-muted hover:text-negative"
                aria-label={`Delete recurring transaction: ${r.payee?.name ?? r.memo ?? "transaction"}`}
              >
                <Trash2 className="size-4" />
              </button>
            </Card>
          ))}
        </div>
      )}

      <AddRecurringDialog open={addOpen} onOpenChange={setAddOpen} budgetId={budgetId} />
    </div>
  );
}

const SUGGESTION_FREQUENCY_LABELS: Record<RecurringCandidate["frequency"], string> = {
  WEEKLY: "week",
  BIWEEKLY: "2 weeks",
  MONTHLY: "month",
  YEARLY: "year",
};

function dismissedKey(budgetId: string) {
  return `montra-dismissed-recurring-suggestions:${budgetId}`;
}

/**
 * "This $15.49 Netflix charge has landed here every month, 4 times
 * running — want to make it recurring?" — see
 * server/services/recurring.ts's suggestRecurringTransactions() for the
 * exact detection heuristic. Dismissal is local-only (localStorage, not
 * a server flag): a real "no thanks, stop asking" preference isn't
 * critical enough to justify a schema/table for it, and the suggestion
 * naturally stops appearing anyway once the pattern is turned into (or
 * covered by) a real recurring transaction.
 */
function readDismissed(budgetId: string): Set<string> {
  try {
    const raw = localStorage.getItem(dismissedKey(budgetId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function RecurringSuggestions({ budgetId }: { budgetId: string }) {
  const suggestions = useRecurringSuggestions(budgetId);
  const createRecurring = useCreateRecurring(budgetId);
  const formatCents = useFormatCents();
  // Lazy initializer (not an effect + setState — the read is synchronous,
  // there's nothing external to subscribe to) reads localStorage once per
  // mount. A budget switch remounts this component naturally via
  // `key={budgetId}` where it's rendered below, so this stays correct
  // without needing to react to budgetId changing in place.
  const [dismissed, setDismissed] = useState<Set<string>>(() => readDismissed(budgetId));

  function candidateKey(c: RecurringCandidate) {
    return `${c.payeeId}:${c.accountId}:${c.amountCents}`;
  }

  function dismiss(c: RecurringCandidate) {
    const next = new Set(dismissed).add(candidateKey(c));
    setDismissed(next);
    try {
      localStorage.setItem(dismissedKey(budgetId), JSON.stringify([...next]));
    } catch {
      // Best-effort — losing the dismissal just means it can resurface later, not a failure worth surfacing.
    }
  }

  async function addCandidate(c: RecurringCandidate) {
    try {
      await createRecurring.mutateAsync({
        accountId: c.accountId,
        payeeName: c.payeeName,
        amountCents: c.amountCents,
        type: c.amountCents < 0 ? "EXPENSE" : "INCOME",
        frequency: c.frequency,
        startDate: c.lastDate.slice(0, 10),
        autoCreate: false,
      });
      toast.success("Recurring transaction created.");
      dismiss(c);
    } catch {
      toast.error("Couldn't create that. Please try again.");
    }
  }

  const visible = (suggestions.data ?? []).filter((c) => !dismissed.has(candidateKey(c)));
  if (visible.length === 0) return null;

  return (
    <div className="mb-4 flex flex-col gap-2">
      {visible.slice(0, 3).map((c) => (
        <Card key={candidateKey(c)} className="flex items-center gap-3 border-brand/30 bg-brand-tint p-3">
          <Sparkles className="size-4 shrink-0 text-brand" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-medium">{c.payeeName}</span> has charged {formatCents(Math.abs(c.amountCents))} every{" "}
            {SUGGESTION_FREQUENCY_LABELS[c.frequency]} for the last {c.occurrences} times — make it recurring?
          </p>
          <Button size="sm" onClick={() => addCandidate(c)} disabled={createRecurring.isPending} className="shrink-0">
            Add
          </Button>
          <button
            onClick={() => dismiss(c)}
            className="shrink-0 text-foreground-muted hover:text-foreground"
            aria-label={`Dismiss suggestion for ${c.payeeName}`}
          >
            <X className="size-4" />
          </button>
        </Card>
      ))}
    </div>
  );
}
