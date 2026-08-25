"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { useCreateAccount } from "@/hooks/use-accounts";
import { toast } from "@/lib/toast";
import { ApiRequestError } from "@/lib/api-client";

export function AddAccountDialog({
  open,
  onOpenChange,
  budgetId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
}) {
  const createAccount = useCreateAccount(budgetId);
  const [name, setName] = useState("");
  const [type, setType] = useState("CHECKING");
  const [institution, setInstitution] = useState("");
  const [balance, setBalance] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (!name.trim()) {
      setError("Give the account a name.");
      return;
    }
    try {
      const cents = balance.trim() ? parseDecimalToCents(balance) : 0;
      await createAccount.mutateAsync({
        name: name.trim(),
        type,
        institution: institution.trim() || undefined,
        startingBalanceCents: cents,
      });
      toast.success(`${name} added.`);
      onOpenChange(false);
      setName("");
      setInstitution("");
      setBalance("");
      setType("CHECKING");
    } catch (err) {
      if (err instanceof MoneyError) setError("Enter a valid starting balance.");
      else setError(err instanceof ApiRequestError ? err.message : "Couldn't add that account. Please try again.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add account</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acct-name">Name</Label>
            <Input id="acct-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chase Checking" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Type</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ACCOUNT_TYPE_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-balance">Current balance</Label>
              <Input id="acct-balance" inputMode="decimal" placeholder="0.00" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="acct-institution">Institution (optional)</Label>
            <Input id="acct-institution" value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Chase" />
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={createAccount.isPending}>
            {createAccount.isPending ? "Adding…" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
