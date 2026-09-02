"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { useFormatCents } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";
import type { CategoryGroupView } from "@/hooks/use-budget-month";
import { ApiRequestError } from "@/lib/api-client";

export function MoveMoneyDialog({
  open,
  onOpenChange,
  groups,
  fromCategoryId,
  onMove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: CategoryGroupView[];
  fromCategoryId: string | null;
  onMove: (input: { fromCategoryId: string; toCategoryId: string; amountCents: number }) => Promise<unknown>;
}) {
  const [from, setFrom] = useState(fromCategoryId ?? "");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const formatCents = useFormatCents();
  const [saving, setSaving] = useState(false);

  const allCategories = groups.flatMap((g) => g.categories.map((c) => ({ ...c, groupName: g.name })));
  const fromCategory = allCategories.find((c) => c.categoryId === (from || fromCategoryId));

  async function submit() {
    setError(null);
    const source = from || fromCategoryId;
    if (!source || !to) {
      setError("Choose both a source and destination category.");
      return;
    }
    try {
      const cents = parseDecimalToCents(amount);
      if (cents <= 0) {
        setError("Enter an amount greater than $0.");
        return;
      }
      setSaving(true);
      await onMove({ fromCategoryId: source, toCategoryId: to, amountCents: cents });
      onOpenChange(false);
      setAmount("");
      toast.success("Money moved.");
    } catch (err) {
      if (err instanceof MoneyError) setError("Enter a valid dollar amount.");
      else setError(err instanceof ApiRequestError ? err.message : "Couldn't move that money. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move money</DialogTitle>
          <DialogDescription>Shift funds between categories without touching your accounts.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>From</Label>
            <Select value={from || fromCategoryId || ""} onValueChange={setFrom}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {allCategories.map((c) => (
                  <SelectItem key={c.categoryId} value={c.categoryId}>
                    {c.groupName} · {c.name} ({formatCents(c.availableCents)} available)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>To</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {allCategories
                  .filter((c) => c.categoryId !== (from || fromCategoryId))
                  .map((c) => (
                    <SelectItem key={c.categoryId} value={c.categoryId}>
                      {c.groupName} · {c.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-amount">Amount</Label>
            <Input
              id="move-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            {fromCategory && (
              <p className="text-xs text-foreground-muted">
                Up to {formatCents(fromCategory.availableCents)} available to move.
              </p>
            )}
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Moving…" : "Move money"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
