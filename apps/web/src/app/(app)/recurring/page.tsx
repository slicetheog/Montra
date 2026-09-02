"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Repeat, Trash2 } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useDeleteRecurring, useRecurring, useUpdateRecurring } from "@/hooks/use-recurring";
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
