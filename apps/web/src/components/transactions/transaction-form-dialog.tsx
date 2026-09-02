"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { parseDecimalToCents, MoneyError, splitEvenly } from "@montra/domain";
import { useFormatCents } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";
import { ApiRequestError } from "@/lib/api-client";
import { TRANSACTION_TYPE_LABELS } from "@/lib/constants";
import type { AccountView } from "@/hooks/use-accounts";
import type { CategoryGroupListItem } from "@/hooks/use-categories";
import type { PayeeView } from "@/hooks/use-payees";
import {
  useCreateTransaction,
  useUpdateTransaction,
  type CreateTransactionInput,
  type TransactionView,
} from "@/hooks/use-transactions";

interface SplitDraft {
  categoryId: string | null;
  amount: string;
  memo: string;
}

interface FormBodyProps {
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  accounts: AccountView[];
  categoryGroups: CategoryGroupListItem[];
  payees: PayeeView[];
  defaultAccountId?: string;
  editing?: TransactionView | null;
  onDelete?: (transaction: TransactionView) => void;
}

/**
 * Mounted fresh (via a `key` in the wrapper below) every time the dialog
 * opens, so all fields simply compute their initial value from props —
 * no effect-based "reset the form" synchronization needed.
 */
function TransactionFormBody({
  onOpenChange,
  budgetId,
  accounts,
  categoryGroups,
  payees,
  defaultAccountId,
  editing,
  onDelete,
}: FormBodyProps) {
  const createTransaction = useCreateTransaction(budgetId);
  const updateTransaction = useUpdateTransaction(budgetId);
  const formatCents = useFormatCents();

  const [type, setType] = useState<CreateTransactionInput["type"]>(
    (editing?.type as CreateTransactionInput["type"]) ?? "EXPENSE",
  );
  const [accountId, setAccountId] = useState(editing?.accountId ?? defaultAccountId ?? accounts[0]?.id ?? "");
  const [transferAccountId, setTransferAccountId] = useState(editing?.transferAccountId ?? "");
  const [date, setDate] = useState(() => editing?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10));
  const [payeeName, setPayeeName] = useState(editing?.payee?.name ?? "");
  const [memo, setMemo] = useState(editing?.memo ?? "");
  const [cleared, setCleared] = useState(editing ? editing.cleared !== "UNCLEARED" : false);
  const [amount, setAmount] = useState(editing ? (Math.abs(editing.amountCents) / 100).toFixed(2) : "");
  const [splits, setSplits] = useState<SplitDraft[]>(
    editing && editing.splits.length > 0
      ? editing.splits.map((s) => ({
          categoryId: s.categoryId,
          amount: (Math.abs(s.amountCents) / 100).toFixed(2),
          memo: s.memo ?? "",
        }))
      : [{ categoryId: null, amount: "", memo: "" }],
  );
  const [error, setError] = useState<string | null>(null);

  const selectableCategories = useMemo(
    () =>
      categoryGroups.flatMap((g) =>
        g.categories
          .filter((c) => c.linkedAccountId !== accountId) // don't let a CC's own payment category be picked manually for its own spend
          .map((c) => ({ ...c, groupName: g.name })),
      ),
    [categoryGroups, accountId],
  );

  const isOutflow = type === "EXPENSE" || type === "CREDIT_CARD_PAYMENT" || type === "TRANSFER";
  const isTransfer = type === "TRANSFER";

  function updateSplit(index: number, patch: Partial<SplitDraft>) {
    setSplits((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function splitEvenlyAcrossRows() {
    try {
      const total = parseDecimalToCents(amount || "0");
      const shares = splitEvenly(total, splits.length);
      setSplits((prev) => prev.map((s, i) => ({ ...s, amount: (Math.abs(shares[i]) / 100).toFixed(2) })));
    } catch {
      toast.error("Enter a total amount first.");
    }
  }

  async function submit() {
    setError(null);
    try {
      if (!accountId) throw new Error("Choose an account.");
      const totalCents = parseDecimalToCents(amount || "0");
      if (totalCents === 0) throw new Error("Enter an amount.");
      const signedTotal = isOutflow ? -Math.abs(totalCents) : Math.abs(totalCents);

      let splitInputs: { categoryId: string | null; amountCents: number; memo?: string }[] | undefined;
      if (!isTransfer) {
        if (splits.length === 1) {
          // The common case: one category, no separate per-split amount to
          // type — it's just the transaction total.
          splitInputs = [{ categoryId: splits[0].categoryId, amountCents: signedTotal, memo: splits[0].memo || undefined }];
        } else {
          splitInputs = splits.map((s) => ({
            categoryId: s.categoryId,
            amountCents: isOutflow
              ? -Math.abs(parseDecimalToCents(s.amount || "0"))
              : Math.abs(parseDecimalToCents(s.amount || "0")),
            memo: s.memo || undefined,
          }));
          const sum = splitInputs.reduce((a, s) => a + s.amountCents, 0);
          if (sum !== signedTotal) {
            throw new Error(
              `Splits total ${formatCents(sum)} but the transaction is ${formatCents(signedTotal)}. They must match exactly.`,
            );
          }
        }
      }

      if (isTransfer && !transferAccountId) throw new Error("Choose which account this transfers to.");

      const payload: CreateTransactionInput = {
        accountId,
        date,
        payeeName: payeeName || undefined,
        memo: memo || undefined,
        cleared: cleared ? "CLEARED" : "UNCLEARED",
        type,
        amountCents: signedTotal,
        splits: splitInputs,
        transferAccountId: isTransfer ? transferAccountId : undefined,
      };

      if (editing) {
        await updateTransaction.mutateAsync({ id: editing.id, input: payload });
        toast.success("Transaction updated.");
      } else {
        await createTransaction.mutateAsync(payload);
        toast.success("Transaction added.");
      }
      onOpenChange(false);
    } catch (err) {
      if (err instanceof MoneyError) setError("Enter valid dollar amounts.");
      else if (err instanceof ApiRequestError) setError(err.message);
      else if (err instanceof Error) setError(err.message);
      else setError("Something went wrong. Please try again.");
    }
  }

  const saving = createTransaction.isPending || updateTransaction.isPending;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
      </DialogHeader>

      <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as CreateTransactionInput["type"])} disabled={Boolean(editing)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRANSACTION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="txn-date">Date</Label>
              <Input id="txn-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{isTransfer ? "From account" : "Account"}</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {isTransfer ? (
              <div className="flex flex-col gap-1.5">
                <Label>To account</Label>
                <Select value={transferAccountId} onValueChange={setTransferAccountId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts
                      .filter((a) => a.id !== accountId)
                      .map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="txn-payee">Payee</Label>
                <Input
                  id="txn-payee"
                  list="payee-list"
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="e.g. Shell, Costco"
                />
                <datalist id="payee-list">
                  {payees.map((p) => (
                    <option key={p.id} value={p.name} />
                  ))}
                </datalist>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-amount">Amount ({isOutflow ? "outflow" : "inflow"})</Label>
            <Input
              id="txn-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {!isTransfer && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <Label>Category{splits.length > 1 ? " splits" : ""}</Label>
                <div className="flex gap-2">
                  {splits.length > 1 && (
                    <button type="button" onClick={splitEvenlyAcrossRows} className="text-xs text-brand hover:underline">
                      Split evenly
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setSplits((prev) =>
                        // Give the existing category the full amount as a
                        // starting point once a second row appears — up to
                        // then, the total *is* the (single) split's amount.
                        prev.length === 1
                          ? [{ ...prev[0], amount: amount || prev[0].amount }, { categoryId: null, amount: "", memo: "" }]
                          : [...prev, { categoryId: null, amount: "", memo: "" }],
                      )
                    }
                    className="flex items-center gap-1 text-xs text-brand hover:underline"
                  >
                    <Plus className="size-3" /> Add split
                  </button>
                </div>
              </div>
              {splits.map((split, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={split.categoryId ?? "none"} onValueChange={(v) => updateSplit(i, { categoryId: v === "none" ? null : v })}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Uncategorized</SelectItem>
                      {selectableCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.groupName} · {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {splits.length > 1 && (
                    <>
                      <Input
                        className="w-28"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label={`Split ${i + 1} amount`}
                        value={split.amount}
                        onChange={(e) => updateSplit(i, { amount: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setSplits((prev) => prev.filter((_, idx) => idx !== i))}
                        className="text-foreground-muted hover:text-negative"
                        aria-label="Remove split"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-memo">Memo</Label>
            <Textarea id="txn-memo" value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={cleared} onCheckedChange={(v) => setCleared(v === true)} />
            Mark as cleared
          </label>

          {error && (
            <p role="alert" className="text-sm text-negative">
              {error}
            </p>
          )}
      </div>

      <DialogFooter className={editing && onDelete ? "sm:justify-between" : undefined}>
        {editing && onDelete && (
          <Button variant="ghost" className="text-negative hover:bg-negative-tint" onClick={() => onDelete(editing)}>
            Delete
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add transaction"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}

export function TransactionFormDialog({
  open,
  onOpenChange,
  ...bodyProps
}: FormBodyProps & { open: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {open && (
          <TransactionFormBody
            key={bodyProps.editing?.id ?? "new"}
            onOpenChange={onOpenChange}
            {...bodyProps}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
