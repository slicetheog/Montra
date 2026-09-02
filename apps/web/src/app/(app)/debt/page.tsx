"use client";

import { useState } from "react";
import { CreditCard, Pencil, Snowflake, TrendingDown } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useDebts, useUpsertDebt, useDebtStrategy, type DebtStrategyResult } from "@/hooks/use-debts";
import { useAccounts } from "@/hooks/use-accounts";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

export default function DebtPage() {
  const { budgetId } = useCurrentBudget();
  const debts = useDebts(budgetId);
  const accounts = useAccounts(budgetId);
  const upsertDebt = useUpsertDebt(budgetId);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();

  if (!budgetId) return <EmptyBudgetState />;

  const debtAccountIds = new Set(debts.data?.debts.map((d) => d.accountId));
  const undetailedDebtAccounts = (accounts.data ?? []).filter(
    (a) => ["CREDIT_CARD", "LOAN", "OTHER_LIABILITY"].includes(a.type) && !debtAccountIds.has(a.id),
  );

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">Debt</h1>
      <p className="mb-6 text-sm text-foreground-muted">Track what you owe and when you&apos;ll be free of it.</p>

      {debts.data && (
        <Card className="mb-6 p-4">
          <p className="text-xs text-foreground-muted">Total debt</p>
          <p className="text-2xl font-semibold tabular-nums text-negative">{formatCents(-debts.data.totalDebtCents)}</p>
        </Card>
      )}

      {(debts.data?.debts.length ?? 0) >= 2 && <DebtStrategyCard budgetId={budgetId} />}

      {(debts.data?.debts.length ?? 0) === 0 && undetailedDebtAccounts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <CreditCard className="size-8 text-foreground-muted" />
          <p className="text-foreground-muted">No debt accounts yet. Add a credit card or loan account to track payoff progress.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {debts.data?.debts.map((d) => (
            <Card key={d.accountId} className="p-4">
              <div className="mb-2 flex items-start justify-between">
                <p className="font-semibold">{d.accountName}</p>
                <button onClick={() => setEditingAccountId(d.accountId)} className="text-foreground-muted hover:text-foreground" aria-label="Edit debt details">
                  <Pencil className="size-4" />
                </button>
              </div>
              <p className="text-xl font-semibold tabular-nums text-negative">{formatCents(d.currentBalanceCents)}</p>
              <div className="mt-3 flex flex-col gap-1 text-sm text-foreground-muted">
                <p>{(d.debt.interestRateBps / 100).toFixed(2)}% APR</p>
                <p>Minimum payment: {formatCents(d.debt.minimumPaymentCents)}</p>
                {d.projection.payoffDate ? (
                  <p className="text-foreground">
                    Payoff by <span className="font-medium">{formatDate(d.projection.payoffDate)}</span> ({d.projection.months} mo,{" "}
                    {formatCents(d.projection.totalInterestCents)} interest)
                  </p>
                ) : (
                  <p className="font-medium text-negative">This payment won&apos;t clear the balance — increase it.</p>
                )}
              </div>
            </Card>
          ))}

          {undetailedDebtAccounts.map((a) => (
            <Card key={a.id} className="flex flex-col items-start gap-2 p-4">
              <p className="font-semibold">{a.name}</p>
              <p className="text-sm text-foreground-muted">Add interest rate and minimum payment to track payoff.</p>
              <Button size="sm" variant="outline" onClick={() => setEditingAccountId(a.id)}>
                Set up debt tracking
              </Button>
            </Card>
          ))}
        </div>
      )}

      {editingAccountId && (
        <DebtDetailsDialog
          onOpenChange={(open) => !open && setEditingAccountId(null)}
          existing={debts.data?.debts.find((d) => d.accountId === editingAccountId)?.debt}
          onSave={async (input) => {
            await upsertDebt.mutateAsync({ accountId: editingAccountId, ...input });
            toast.success("Debt details saved.");
            setEditingAccountId(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * "Which debt do I attack first?" — a question the per-debt cards above
 * can't answer, since each of their projections assumes paying only its
 * own minimum in isolation. Runs both standard strategies (snowball:
 * smallest balance first, for quick wins that build momentum; avalanche:
 * highest rate first, for the least total interest) against every debt
 * at once and shows the actual difference between them.
 */
function DebtStrategyCard({ budgetId }: { budgetId: string }) {
  const [extra, setExtra] = useState("0");
  const extraCents = Math.max(0, Math.round((parseFloat(extra || "0") || 0) * 100));
  const strategy = useDebtStrategy(budgetId, extraCents);
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();

  return (
    <Card className="mb-6 p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">Payoff strategy</h2>
          <p className="text-sm text-foreground-muted">Which debt to attack first, snowball vs. avalanche.</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="strategy-extra" className="text-xs">
            Extra per month (beyond minimums)
          </Label>
          <Input id="strategy-extra" inputMode="decimal" className="w-40" value={extra} onChange={(e) => setExtra(e.target.value)} />
        </div>
      </div>

      {strategy.isLoading || !strategy.data ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <StrategyColumn
            icon={Snowflake}
            title="Snowball"
            subtitle="Smallest balance first — quick wins."
            result={strategy.data.snowball}
            debtNames={strategy.data.debtNames}
            recommended={strategy.data.snowball.totalInterestCents <= strategy.data.avalanche.totalInterestCents}
            formatCents={formatCents}
            formatDate={formatDate}
          />
          <StrategyColumn
            icon={TrendingDown}
            title="Avalanche"
            subtitle="Highest interest rate first — least total interest."
            result={strategy.data.avalanche}
            debtNames={strategy.data.debtNames}
            recommended={strategy.data.avalanche.totalInterestCents < strategy.data.snowball.totalInterestCents}
            formatCents={formatCents}
            formatDate={formatDate}
          />
        </div>
      )}
    </Card>
  );
}

function StrategyColumn({
  icon: Icon,
  title,
  subtitle,
  result,
  debtNames,
  recommended,
  formatCents,
  formatDate,
}: {
  icon: typeof Snowflake;
  title: string;
  subtitle: string;
  result: DebtStrategyResult;
  debtNames: Record<string, string>;
  recommended: boolean;
  formatCents: (cents: number) => string;
  formatDate: (date: string, format?: "short" | "long") => string;
}) {
  return (
    <div className={cn("rounded-lg border p-3", recommended ? "border-brand bg-brand-tint" : "border-border")}>
      <div className="mb-2 flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Icon className="size-4" /> {title}
        </span>
        {recommended && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-medium text-brand-foreground">Less interest</span>
        )}
      </div>
      <p className="mb-2 text-xs text-foreground-muted">{subtitle}</p>
      <ol className="mb-3 flex flex-col gap-1 text-sm">
        {result.order.map((id, i) => (
          <li key={id} className="flex items-center gap-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-surface-muted text-[10px] font-medium">{i + 1}</span>
            {debtNames[id] ?? "Account"}
          </li>
        ))}
      </ol>
      {result.totalMonths > 0 ? (
        <p className="text-sm">
          Debt-free in <span className="font-medium">{result.totalMonths} mo</span>
          {result.payoffDate && <> ({formatDate(result.payoffDate)})</>} · {formatCents(result.totalInterestCents)} total interest
        </p>
      ) : (
        <p className="text-sm font-medium text-negative">These payments won&apos;t clear every balance — add more extra.</p>
      )}
    </div>
  );
}

function DebtDetailsDialog({
  onOpenChange,
  existing,
  onSave,
}: {
  onOpenChange: (open: boolean) => void;
  existing?: { originalBalanceCents: number; interestRateBps: number; minimumPaymentCents: number; dueDayOfMonth: number | null };
  onSave: (input: { originalBalanceCents: number; interestRateBps: number; minimumPaymentCents: number; dueDayOfMonth?: number }) => Promise<void>;
}) {
  const [originalBalance, setOriginalBalance] = useState(existing ? (existing.originalBalanceCents / 100).toFixed(2) : "");
  const [rate, setRate] = useState(existing ? (existing.interestRateBps / 100).toString() : "");
  const [minPayment, setMinPayment] = useState(existing ? (existing.minimumPaymentCents / 100).toFixed(2) : "");
  const [dueDay, setDueDay] = useState(existing?.dueDayOfMonth?.toString() ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError(null);
    try {
      setSaving(true);
      await onSave({
        originalBalanceCents: originalBalance ? parseDecimalToCents(originalBalance) : 0,
        interestRateBps: Math.round(parseFloat(rate || "0") * 100),
        minimumPaymentCents: minPayment ? parseDecimalToCents(minPayment) : 0,
        dueDayOfMonth: dueDay ? Number(dueDay) : undefined,
      });
    } catch (err) {
      setError(err instanceof MoneyError ? "Enter valid dollar amounts." : "Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Debt details</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-original">Original balance</Label>
            <Input id="debt-original" inputMode="decimal" placeholder="0.00" value={originalBalance} onChange={(e) => setOriginalBalance(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-rate">Interest rate (APR %)</Label>
              <Input id="debt-rate" inputMode="decimal" placeholder="19.99" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="debt-min">Minimum payment</Label>
              <Input id="debt-min" inputMode="decimal" placeholder="0.00" value={minPayment} onChange={(e) => setMinPayment(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="debt-due">Due day of month (optional)</Label>
            <Input id="debt-due" type="number" min={1} max={28} value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
