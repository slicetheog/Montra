"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { useCreateRecurring } from "@/hooks/use-recurring";
import { toast } from "@/lib/toast";
import { ApiRequestError } from "@/lib/api-client";

const FREQUENCY_LABELS = {
  ONE_TIME: "One-time (won't repeat)",
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  SEMI_MONTHLY: "Twice a month (e.g. 1st & 15th)",
  MONTHLY: "Monthly",
  EVERY_N_MONTHS: "Every N months",
  YEARLY: "Yearly",
  CUSTOM: "Every N days",
} as const;

/** SEMI_MONTHLY and ONE_TIME aren't real RecurrenceFrequency values in the
 *  domain (see packages/domain/src/recurrence.ts) — UI sugar over it.
 *  SEMI_MONTHLY ("1st & 15th") becomes two independent MONTHLY recurring
 *  transactions, one per date, the same convenience the onboarding
 *  paycheck step offers. ONE_TIME becomes a single MONTHLY series capped
 *  at occurrencesLimit: 1 — the frequency itself is irrelevant once it can
 *  only ever fire once. Every other value here maps straight to a real
 *  domain frequency. */
type UIFrequency = keyof typeof FREQUENCY_LABELS;

export function AddRecurringDialog({ open, onOpenChange, budgetId }: { open: boolean; onOpenChange: (open: boolean) => void; budgetId: string }) {
  const accounts = useAccounts(budgetId);
  const categories = useCategories(budgetId);
  const createRecurring = useCreateRecurring(budgetId);
  const flatCategories = categories.data?.flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name }))) ?? [];

  const [accountId, setAccountId] = useState("");
  const [payeeName, setPayeeName] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [type, setType] = useState<"EXPENSE" | "INCOME">("EXPENSE");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<UIFrequency>("MONTHLY");
  const [intervalCount, setIntervalCount] = useState("1");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [startDate2, setStartDate2] = useState(""); // second payday, semi-monthly only
  const [autoCreate, setAutoCreate] = useState(true);
  const [totalAmount, setTotalAmount] = useState(""); // optional, for a bounded/installment bill
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!accountId) return setError("Choose an account.");
    if (frequency === "SEMI_MONTHLY" && !startDate2) return setError("Enter the second date.");
    try {
      const magnitude = parseDecimalToCents(amount || "0");
      if (magnitude === 0) return setError("Enter an amount.");
      const totalAmountCents = type === "EXPENSE" && totalAmount ? parseDecimalToCents(totalAmount) : undefined;
      const shared = {
        accountId,
        payeeName: payeeName || undefined,
        categoryId: categoryId || undefined,
        amountCents: type === "EXPENSE" ? -Math.abs(magnitude) : Math.abs(magnitude),
        type,
        autoCreate,
        totalAmountCents,
      };
      if (frequency === "SEMI_MONTHLY") {
        // Two independent MONTHLY recurring transactions, one per date —
        // see the UIFrequency doc comment above.
        for (const date of [startDate, startDate2]) {
          await createRecurring.mutateAsync({ ...shared, frequency: "MONTHLY", startDate: date });
        }
      } else if (frequency === "ONE_TIME") {
        await createRecurring.mutateAsync({ ...shared, frequency: "MONTHLY", occurrencesLimit: 1, startDate });
      } else {
        await createRecurring.mutateAsync({
          ...shared,
          frequency,
          intervalCount: ["EVERY_N_MONTHS", "CUSTOM"].includes(frequency) ? Number(intervalCount) || 1 : undefined,
          startDate,
        });
      }
      toast.success("Recurring transaction created.");
      onOpenChange(false);
      setPayeeName("");
      setAmount("");
      setTotalAmount("");
    } catch (err) {
      if (err instanceof MoneyError) setError("Enter a valid dollar amount.");
      else setError(err instanceof ApiRequestError ? err.message : "Couldn't create that. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New recurring transaction</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as "EXPENSE" | "INCOME")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EXPENSE">Expense</SelectItem>
                  <SelectItem value="INCOME">Income</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.data?.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-payee">Payee</Label>
              <Input id="rec-payee" value={payeeName} onChange={(e) => setPayeeName(e.target.value)} placeholder="e.g. Rent, Employer" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-amount">Amount</Label>
              <Input id="rec-amount" inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>

          {type === "EXPENSE" && (
            <div className="flex flex-col gap-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {flatCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.groupName} · {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Frequency</Label>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as UIFrequency)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-start">{frequency === "SEMI_MONTHLY" ? "First date" : frequency === "ONE_TIME" ? "Due date" : "Start date"}</Label>
              <Input id="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          {frequency === "SEMI_MONTHLY" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-start-2">Second date</Label>
              <Input id="rec-start-2" type="date" className="max-w-[calc(50%-0.375rem)]" value={startDate2} onChange={(e) => setStartDate2(e.target.value)} />
            </div>
          )}

          {(frequency === "EVERY_N_MONTHS" || frequency === "CUSTOM") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-interval">Every N {frequency === "CUSTOM" ? "days" : "months"}</Label>
              <Input id="rec-interval" type="number" min={1} className="w-24" value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} />
            </div>
          )}

          {type === "EXPENSE" && frequency !== "SEMI_MONTHLY" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-total">Total amount to pay off (optional)</Label>
              <Input id="rec-total" inputMode="decimal" placeholder="e.g. a payment plan's full balance" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
              <p className="text-xs text-foreground-muted">
                For a one-time bill paid in installments — we&apos;ll track progress toward this total from the payments you actually log.
              </p>
            </div>
          )}

          <label className="flex items-center justify-between gap-3">
            <span>
              <span className="block text-sm font-medium">Create automatically</span>
              <span className="block text-xs text-foreground-muted">Off means we&apos;ll remind you instead of adding it for you.</span>
            </span>
            <Switch checked={autoCreate} onCheckedChange={setAutoCreate} />
          </label>

          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createRecurring.isPending}>
            {createRecurring.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
