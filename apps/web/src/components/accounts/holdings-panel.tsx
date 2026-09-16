"use client";

import { useState } from "react";
import { MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCreateHolding, useDeleteHolding, useHoldings, useSyncAccountValue, useUpdateHolding, type HoldingView } from "@/hooks/use-holdings";
import { useFormatCents } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { ApiRequestError } from "@/lib/api-client";
import { HoldingDialog, type HoldingFormState } from "@/components/accounts/holding-dialog";

const EMPTY_FORM: HoldingFormState = { name: "", symbol: "", quantity: "", price: "", costBasis: "" };

export function HoldingsPanel({
  budgetId,
  accountId,
  currentBalanceCents,
}: {
  budgetId: string;
  accountId: string;
  currentBalanceCents: number;
}) {
  const holdings = useHoldings(budgetId, accountId);
  const createHolding = useCreateHolding(budgetId, accountId);
  const updateHolding = useUpdateHolding(budgetId, accountId);
  const deleteHolding = useDeleteHolding(budgetId, accountId);
  const syncValue = useSyncAccountValue(budgetId, accountId);
  const formatCents = useFormatCents();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HoldingFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(holding: HoldingView) {
    setEditingId(holding.id);
    setForm({
      name: holding.name,
      symbol: holding.symbol ?? "",
      quantity: String(holding.quantity),
      price: (holding.currentPriceCents / 100).toFixed(2),
      costBasis: holding.costBasisCents != null ? (holding.costBasisCents / 100).toFixed(2) : "",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  async function submit() {
    setFormError(null);
    if (!form.name.trim()) {
      setFormError("Enter a name for this holding.");
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      setFormError("Enter a quantity greater than 0.");
      return;
    }
    try {
      const currentPriceCents = parseDecimalToCents(form.price || "0");
      const costBasisCents = form.costBasis.trim() ? parseDecimalToCents(form.costBasis) : undefined;
      const input = { name: form.name.trim(), symbol: form.symbol.trim() || undefined, quantity, currentPriceCents, costBasisCents };
      if (editingId) {
        await updateHolding.mutateAsync({ holdingId: editingId, patch: input });
        toast.success("Holding updated.");
      } else {
        await createHolding.mutateAsync(input);
        toast.success("Holding added.");
      }
      setDialogOpen(false);
    } catch (err) {
      if (err instanceof MoneyError) setFormError("Enter a valid price and cost basis.");
      else setFormError(err instanceof ApiRequestError ? err.message : "Couldn't save this holding. Please try again.");
    }
  }

  async function remove(holding: HoldingView) {
    if (!confirm(`Remove "${holding.name}"? This only removes it from your holdings list, not any transactions.`)) return;
    await deleteHolding.mutateAsync(holding.id);
    toast.success("Holding removed.");
  }

  async function sync() {
    const result = await syncValue.mutateAsync();
    toast.success(
      result.adjusted ? "Account balance updated to match your holdings." : "Already matches — nothing to update.",
    );
  }

  const list = holdings.data ?? [];
  const totalMarketValueCents = list.reduce((sum, h) => sum + h.marketValueCents, 0);
  const balanceGapCents = totalMarketValueCents - currentBalanceCents;

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-1.5">
          Holdings
          <InfoTooltip content="What this investment account is made up of. Montra has no live market-data feed, so keep the price on each holding up to date yourself — that's what powers its gain/loss and this account's 'sync value' action." />
        </CardTitle>
        <Button variant="outline" size="sm" onClick={openAdd}>
          <Plus className="size-3.5" /> Add holding
        </Button>
      </CardHeader>
      <CardContent>
        {holdings.isLoading ? (
          <div className="h-16 animate-pulse rounded-lg bg-surface-muted" />
        ) : list.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            No holdings tracked yet. Add what you hold to see its value and performance broken out here.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="flex flex-col divide-y divide-border">
              {list.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {h.name}
                      {h.symbol && <span className="text-foreground-muted"> · {h.symbol}</span>}
                    </p>
                    <p className="text-xs text-foreground-muted">
                      {h.quantity.toLocaleString()} @ {formatCents(h.currentPriceCents)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="font-medium tabular-nums">{formatCents(h.marketValueCents)}</p>
                      {h.gainLossCents != null && (
                        <p className={cn("text-xs tabular-nums", h.gainLossCents < 0 ? "text-negative" : "text-positive")}>
                          {formatCents(h.gainLossCents)}
                          {h.gainLossPercent != null && ` (${h.gainLossPercent > 0 ? "+" : ""}${h.gainLossPercent}%)`}
                        </p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex size-6 shrink-0 items-center justify-center rounded text-foreground-muted hover:bg-surface hover:text-foreground"
                          aria-label={`More actions for ${h.name}`}
                        >
                          <MoreVertical className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(h)}>
                          <Pencil className="size-3.5" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => remove(h)} className="text-negative focus:text-negative">
                          <Trash2 className="size-3.5" /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between rounded-lg border border-border bg-surface-muted p-3 text-sm">
              <div>
                <p className="font-medium">Holdings total: {formatCents(totalMarketValueCents)}</p>
                {balanceGapCents !== 0 && (
                  <p className="text-xs text-foreground-muted">
                    Account balance is {formatCents(currentBalanceCents)} — sync to record the {formatCents(Math.abs(balanceGapCents))}{" "}
                    {balanceGapCents > 0 ? "gain" : "loss"} as a transaction.
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={sync} disabled={syncValue.isPending || balanceGapCents === 0}>
                {syncValue.isPending ? "Syncing…" : "Sync value"}
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <HoldingDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        isEditing={Boolean(editingId)}
        form={form}
        onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        error={formError}
        isPending={createHolding.isPending || updateHolding.isPending}
        onSubmit={submit}
      />
    </Card>
  );
}
