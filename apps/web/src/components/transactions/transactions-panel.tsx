"use client";

import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CLEARED_STATUS_LABELS } from "@/lib/constants";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { usePayees } from "@/hooks/use-payees";
import { useTags } from "@/hooks/use-tags";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";
import { useDeleteTransaction, useTransactions, type TransactionFilters, type TransactionView } from "@/hooks/use-transactions";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import { toast } from "@/lib/toast";

export function TransactionsPanel({
  budgetId,
  filters,
  defaultAccountId,
  emptyMessage = "No transactions yet. Add your first one to start tracking your spending.",
}: {
  budgetId: string;
  filters: TransactionFilters;
  defaultAccountId?: string;
  emptyMessage?: string;
}) {
  const [search, setSearch] = useState(filters.search ?? "");
  const [tagId, setTagId] = useState<string | undefined>(filters.tagId);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionView | null>(null);
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();

  const accounts = useAccounts(budgetId);
  const categories = useCategories(budgetId);
  const payees = usePayees(budgetId);
  const tags = useTags(budgetId);
  const effectiveFilters = { ...filters, search: search || undefined, tagId };
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useTransactions(budgetId, effectiveFilters);
  const deleteTransaction = useDeleteTransaction(budgetId);

  const items = data?.pages.flatMap((p) => p.items) ?? [];

  async function handleDelete(transaction: TransactionView) {
    if (!confirm("Delete this transaction? This can't be undone.")) return;
    try {
      await deleteTransaction.mutateAsync(transaction.id);
      toast.success("Transaction deleted.");
      setFormOpen(false);
      setEditing(null);
    } catch {
      toast.error("Couldn't delete that transaction. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-foreground-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search memo, payee, or amount"
              className="pl-8"
              aria-label="Search transactions"
            />
          </div>
          {(tags.data?.length ?? 0) > 0 && (
            <Select value={tagId ?? "all"} onValueChange={(v) => setTagId(v === "all" ? undefined : v)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Any tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any tag</SelectItem>
                {tags.data?.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" /> Add transaction
        </Button>
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-lg bg-surface-muted" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <p className="text-foreground-muted">{emptyMessage}</p>
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="size-4" /> Add your first transaction
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[6rem_1fr_1fr_10rem_5rem_7rem] gap-2 border-b border-border bg-surface-muted px-3 py-2 text-xs font-medium text-foreground-muted sm:grid">
            <div>Date</div>
            <div>Payee</div>
            <div>Category</div>
            <div>Account</div>
            <div>Status</div>
            <div className="text-right">Amount</div>
          </div>
          {items.map((txn) => (
            <button
              key={txn.id}
              type="button"
              onClick={() => {
                setEditing(txn);
                setFormOpen(true);
              }}
              className="grid w-full grid-cols-2 gap-1 border-b border-border bg-surface px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-surface-muted sm:grid-cols-[6rem_1fr_1fr_10rem_5rem_7rem] sm:items-center sm:gap-2"
            >
              <div className="text-foreground-muted">{formatDate(txn.date)}</div>
              <div className="flex min-w-0 flex-wrap items-center gap-1">
                <span className="truncate font-medium">
                  {txn.payee?.name ?? (txn.type === "TRANSFER" ? `Transfer: ${txn.transferAccount?.name}` : "—")}
                </span>
                {txn.tags.map((t) => (
                  <Badge key={t.id} variant="neutral" className="shrink-0">
                    {t.name}
                  </Badge>
                ))}
              </div>
              <div className="truncate text-foreground-muted sm:block">
                {txn.type === "TRANSFER"
                  ? "Transfer"
                  : txn.isSplit
                    ? `Split (${txn.splits.length})`
                    : (txn.splits[0]?.category?.name ?? "Uncategorized")}
              </div>
              <div className="hidden truncate text-foreground-muted sm:block">{txn.account.name}</div>
              <div className="hidden sm:block">
                <Badge variant={txn.cleared === "RECONCILED" ? "brand" : txn.cleared === "CLEARED" ? "positive" : "neutral"}>
                  {CLEARED_STATUS_LABELS[txn.cleared]}
                </Badge>
              </div>
              <div className={cn("text-right font-medium tabular-nums", txn.amountCents < 0 ? "text-foreground" : "text-positive")}>
                {formatCents(txn.amountCents)}
              </div>
            </button>
          ))}
        </div>
      )}

      {hasNextPage && (
        <Button variant="outline" onClick={() => fetchNextPage()} disabled={isFetchingNextPage} className="self-center">
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </Button>
      )}

      {accounts.data && categories.data && payees.data && (
        <TransactionFormDialog
          open={formOpen}
          onOpenChange={(open) => {
            setFormOpen(open);
            if (!open) setEditing(null);
          }}
          budgetId={budgetId}
          accounts={accounts.data}
          categoryGroups={categories.data}
          payees={payees.data}
          defaultAccountId={defaultAccountId}
          editing={editing}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
