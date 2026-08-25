"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { useCreateGoal } from "@/hooks/use-goals";
import { useCategories } from "@/hooks/use-categories";
import { useAccounts } from "@/hooks/use-accounts";
import { toast } from "@/lib/toast";
import { ApiRequestError } from "@/lib/api-client";

const GOAL_TYPE_LABELS = {
  TARGET_BALANCE: "Save a target amount",
  TARGET_DATE: "Save a target amount by a date",
  MONTHLY_CONTRIBUTION: "Contribute a set amount monthly",
  DEBT_PAYOFF: "Pay off a debt",
} as const;

export function AddGoalDialog({ open, onOpenChange, budgetId }: { open: boolean; onOpenChange: (open: boolean) => void; budgetId: string }) {
  const createGoal = useCreateGoal(budgetId);
  const categories = useCategories(budgetId);
  const accounts = useAccounts(budgetId);

  const [name, setName] = useState("");
  const [type, setType] = useState<keyof typeof GOAL_TYPE_LABELS>("TARGET_BALANCE");
  const [categoryId, setCategoryId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [monthlyAmount, setMonthlyAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const debtAccounts = accounts.data?.filter((a) => ["CREDIT_CARD", "LOAN", "OTHER_LIABILITY"].includes(a.type)) ?? [];
  const flatCategories = categories.data?.flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name }))) ?? [];

  async function submit() {
    setError(null);
    if (!name.trim()) return setError("Give the goal a name.");
    try {
      await createGoal.mutateAsync({
        name: name.trim(),
        type,
        categoryId: type !== "DEBT_PAYOFF" ? categoryId : undefined,
        accountId: type === "DEBT_PAYOFF" ? accountId : undefined,
        targetAmountCents: targetAmount ? parseDecimalToCents(targetAmount) : undefined,
        targetDate: type === "TARGET_DATE" && targetDate ? targetDate : undefined,
        monthlyContributionCents: monthlyAmount ? parseDecimalToCents(monthlyAmount) : undefined,
      });
      toast.success("Goal created.");
      onOpenChange(false);
      setName("");
      setTargetAmount("");
      setMonthlyAmount("");
      setTargetDate("");
    } catch (err) {
      if (err instanceof MoneyError) setError("Enter valid dollar amounts.");
      else setError(err instanceof ApiRequestError ? err.message : "Couldn't create that goal. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="goal-name">Name</Label>
            <Input id="goal-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Emergency Fund" autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Goal type</Label>
            <Select value={type} onValueChange={(v) => setType(v as keyof typeof GOAL_TYPE_LABELS)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(GOAL_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "DEBT_PAYOFF" ? (
            <div className="flex flex-col gap-1.5">
              <Label>Debt account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select an account" />
                </SelectTrigger>
                <SelectContent>
                  {debtAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {debtAccounts.length === 0 && (
                <p className="text-xs text-foreground-muted">
                  Add a credit card or loan account first, then set its interest rate and minimum payment from the Debt page.
                </p>
              )}
            </div>
          ) : (
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

          {(type === "TARGET_BALANCE" || type === "TARGET_DATE") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-target">Target amount</Label>
              <Input id="goal-target" inputMode="decimal" placeholder="0.00" value={targetAmount} onChange={(e) => setTargetAmount(e.target.value)} />
            </div>
          )}
          {type === "TARGET_DATE" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-date">Target date</Label>
              <Input id="goal-date" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
            </div>
          )}
          {type === "MONTHLY_CONTRIBUTION" && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="goal-monthly">Monthly contribution</Label>
              <Input id="goal-monthly" inputMode="decimal" placeholder="0.00" value={monthlyAmount} onChange={(e) => setMonthlyAmount(e.target.value)} />
            </div>
          )}

          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createGoal.isPending}>
            {createGoal.isPending ? "Creating…" : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
