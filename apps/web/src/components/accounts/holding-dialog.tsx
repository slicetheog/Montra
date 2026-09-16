"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export interface HoldingFormState {
  name: string;
  symbol: string;
  quantity: string;
  price: string;
  costBasis: string;
}

/**
 * Purely a controlled form — form state and the add-vs-edit target both
 * live in the parent (HoldingsPanel), the same way budget-screen.tsx's
 * rename dialog owns its `newName` state, rather than resetting local
 * state here from a `holding` prop via an effect.
 */
export function HoldingDialog({
  open,
  onOpenChange,
  isEditing,
  form,
  onChange,
  error,
  isPending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isEditing: boolean;
  form: HoldingFormState;
  onChange: (patch: Partial<HoldingFormState>) => void;
  error: string | null;
  isPending: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit holding" : "Add holding"}</DialogTitle>
          <DialogDescription>
            Track what you hold and keep its price up to date yourself — Montra has no live market-data feed, so
            performance here reflects the prices you enter.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holding-name">Name</Label>
            <Input
              id="holding-name"
              placeholder="e.g. Vanguard Total Stock Market ETF"
              value={form.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holding-symbol">Ticker symbol (optional)</Label>
            <Input id="holding-symbol" placeholder="e.g. VTI" value={form.symbol} onChange={(e) => onChange({ symbol: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="holding-quantity">Quantity</Label>
              <Input
                id="holding-quantity"
                inputMode="decimal"
                placeholder="e.g. 10.5"
                value={form.quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="holding-price">Price per share</Label>
              <Input id="holding-price" inputMode="decimal" placeholder="0.00" value={form.price} onChange={(e) => onChange({ price: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="holding-cost-basis">Total cost basis (optional)</Label>
            <Input
              id="holding-cost-basis"
              inputMode="decimal"
              placeholder="What you originally paid, in total"
              value={form.costBasis}
              onChange={(e) => onChange({ costBasis: e.target.value })}
            />
            <p className="text-xs text-foreground-muted">Lets Montra show your gain or loss. Leave blank if you&apos;d rather not track it.</p>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isPending}>
            {isPending ? "Saving…" : isEditing ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
