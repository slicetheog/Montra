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
  DAILY: "Daily",
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  EVERY_N_MONTHS: "Every N months",
  YEARLY: "Yearly",
  CUSTOM: "Every N days",
} as const;

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
  const [frequency, setFrequency] = useState<keyof typeof FREQUENCY_LABELS>("MONTHLY");
  const [intervalCount, setIntervalCount] = useState("1");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [autoCreate, setAutoCreate] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!accountId) return setError("Choose an account.");
    try {
      const magnitude = parseDecimalToCents(amount || "0");
      if (magnitude === 0) return setError("Enter an amount.");
      await createRecurring.mutateAsync({
        accountId,
        payeeName: payeeName || undefined,
        categoryId: categoryId || undefined,
        amountCents: type === "EXPENSE" ? -Math.abs(magnitude) : Math.abs(magnitude),
        type,
        frequency,
        intervalCount: ["EVERY_N_MONTHS", "CUSTOM"].includes(frequency) ? Number(intervalCount) || 1 : undefined,
        startDate,
        autoCreate,
      });
      toast.success("Recurring transaction created.");
      onOpenChange(false);
      setPayeeName("");
      setAmount("");
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
              <Select value={frequency} onValueChange={(v) => setFrequency(v as keyof typeof FREQUENCY_LABELS)}>
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
              <Label htmlFor="rec-start">Start date</Label>
              <Input id="rec-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
          </div>

          {(frequency === "EVERY_N_MONTHS" || frequency === "CUSTOM") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="rec-interval">Every N {frequency === "CUSTOM" ? "days" : "months"}</Label>
              <Input id="rec-interval" type="number" min={1} className="w-24" value={intervalCount} onChange={(e) => setIntervalCount(e.target.value)} />
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
