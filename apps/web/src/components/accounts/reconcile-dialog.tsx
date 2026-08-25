"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { formatCents } from "@/lib/utils";
import { api, ApiRequestError } from "@/lib/api-client";
import { toast } from "@/lib/toast";

export function ReconcileDialog({
  open,
  onOpenChange,
  budgetId,
  accountId,
  currentClearedCents,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  accountId: string;
  currentClearedCents: number;
}) {
  const queryClient = useQueryClient();
  const [statementDate, setStatementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reconcile = useMutation({
    mutationFn: (input: { statementDate: string; statementBalanceCents: number }) =>
      api.post(`/api/budgets/${budgetId}/accounts/${accountId}/reconcile`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["transactions", budgetId] });
    },
  });

  async function submit() {
    setError(null);
    try {
      const cents = parseDecimalToCents(balance || "0");
      await reconcile.mutateAsync({ statementDate, statementBalanceCents: cents });
      toast.success("Account reconciled.", "Cleared transactions are now locked in as reconciled.");
      onOpenChange(false);
      setBalance("");
    } catch (err) {
      if (err instanceof MoneyError) setError("Enter a valid statement balance.");
      else setError(err instanceof ApiRequestError ? err.message : "Couldn't reconcile. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile account</DialogTitle>
          <DialogDescription>
            Enter the ending balance from your latest bank statement. We&apos;ll compare it to your cleared
            transactions ({formatCents(currentClearedCents)}) and add an adjustment if anything&apos;s off.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stmt-date">Statement date</Label>
            <Input id="stmt-date" type="date" value={statementDate} onChange={(e) => setStatementDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="stmt-balance">Statement ending balance</Label>
            <Input id="stmt-balance" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={reconcile.isPending}>
            {reconcile.isPending ? "Reconciling…" : "Reconcile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
