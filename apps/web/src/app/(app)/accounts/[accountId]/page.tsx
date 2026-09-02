"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useAccount, useUpdateAccount } from "@/hooks/use-accounts";
import { TransactionsPanel } from "@/components/transactions/transactions-panel";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Button } from "@/components/ui/button";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { useFormatCents } from "@/hooks/use-locale-format";
import { ReconcileDialog } from "@/components/accounts/reconcile-dialog";

export default function AccountDetailPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = use(params);
  const { budgetId } = useCurrentBudget();
  const account = useAccount(budgetId, accountId);
  const updateAccount = useUpdateAccount(budgetId, accountId);
  const [reconcileOpen, setReconcileOpen] = useState(false);

  if (!budgetId) return <EmptyBudgetState />;
  if (account.isLoading || !account.data) {
    return <div className="p-6"><div className="h-24 animate-pulse rounded-lg bg-surface-muted" /></div>;
  }

  const { data } = account;

  return (
    <div className="p-4 sm:p-6">
      <Link href="/accounts" className="mb-4 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground">
        <ArrowLeft className="size-4" /> All accounts
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{data.name}</h1>
          <p className="text-sm text-foreground-muted">
            {ACCOUNT_TYPE_LABELS[data.type]}
            {data.institution ? ` · ${data.institution}` : ""}
            {data.isClosed ? " · Closed" : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setReconcileOpen(true)}>
            Reconcile
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => updateAccount.mutate({ isClosed: !data.isClosed })}
          >
            {data.isClosed ? "Reopen account" : "Close account"}
          </Button>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <BalanceStat label="Current balance" cents={data.balances.currentCents} emphasize />
        <BalanceStat label="Cleared" cents={data.balances.clearedCents} />
        <BalanceStat label="Uncleared" cents={data.balances.unclearedCents} />
      </div>

      <TransactionsPanel budgetId={budgetId} filters={{ accountId }} defaultAccountId={accountId} />

      <ReconcileDialog
        open={reconcileOpen}
        onOpenChange={setReconcileOpen}
        budgetId={budgetId}
        accountId={accountId}
        currentClearedCents={data.balances.clearedCents}
      />
    </div>
  );
}

function BalanceStat({ label, cents, emphasize }: { label: string; cents: number; emphasize?: boolean }) {
  const formatCents = useFormatCents();
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className={cn("mt-1 tabular-nums font-semibold", emphasize ? "text-lg" : "text-base", cents < 0 && "text-negative")}>
        {formatCents(cents)}
      </p>
    </div>
  );
}
