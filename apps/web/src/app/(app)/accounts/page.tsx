"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Landmark, Plus } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { AddAccountDialog } from "@/components/accounts/add-account-dialog";
import { TransactionsPanel } from "@/components/transactions/transactions-panel";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/utils";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";

function AccountsPageInner() {
  const { budgetId } = useCurrentBudget();
  const searchParams = useSearchParams();
  const categoryId = searchParams.get("categoryId");
  const [addOpen, setAddOpen] = useState(false);

  const accounts = useAccounts(budgetId);
  const categories = useCategories(budgetId);

  if (!budgetId) return <EmptyBudgetState />;

  if (categoryId) {
    const category = categories.data?.flatMap((g) => g.categories).find((c) => c.id === categoryId);
    return (
      <div className="p-4 sm:p-6">
        <Link href="/accounts" className="mb-4 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground">
          <ArrowLeft className="size-4" /> All accounts
        </Link>
        <h1 className="mb-4 text-xl font-semibold">{category ? `Transactions in ${category.name}` : "Filtered transactions"}</h1>
        <TransactionsPanel budgetId={budgetId} filters={{ categoryId }} />
      </div>
    );
  }

  const onBudget = accounts.data?.filter((a) => a.onBudget) ?? [];
  const offBudget = accounts.data?.filter((a) => !a.onBudget) ?? [];

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Accounts</h1>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Add account
        </Button>
      </div>

      {accounts.isLoading ? (
        <div className="h-32 animate-pulse rounded-lg bg-surface-muted" />
      ) : (accounts.data?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <Landmark className="size-8 text-foreground-muted" />
          <p className="text-foreground-muted">No accounts yet.</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> Add your first account
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <AccountGroup title="Budget accounts" accounts={onBudget} />
          {offBudget.length > 0 && <AccountGroup title="Tracking accounts" accounts={offBudget} />}
        </div>
      )}

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} budgetId={budgetId} />
    </div>
  );
}

function AccountGroup({ title, accounts }: { title: string; accounts: NonNullable<ReturnType<typeof useAccounts>["data"]> }) {
  if (accounts.length === 0) return null;
  return (
    <div>
      <h2 className="mb-2 text-sm font-medium text-foreground-muted">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {accounts.map((account) => (
          <Link key={account.id} href={`/accounts/${account.id}`}>
            <Card className="p-4 transition-colors hover:border-border-strong">
              <div className="flex items-center justify-between">
                <p className="font-medium">{account.name}</p>
                {account.isClosed && <span className="text-xs text-foreground-muted">Closed</span>}
              </div>
              <p className="text-xs text-foreground-muted">{ACCOUNT_TYPE_LABELS[account.type]}</p>
              <p className={`mt-3 text-lg font-semibold tabular-nums ${account.balances.currentCents < 0 ? "text-negative" : ""}`}>
                {formatCents(account.balances.currentCents)}
              </p>
              {account.balances.unclearedCents !== 0 && (
                <p className="text-xs text-foreground-muted">
                  {formatCents(account.balances.clearedCents)} cleared
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AccountsPage() {
  return (
    <Suspense fallback={null}>
      <AccountsPageInner />
    </Suspense>
  );
}
