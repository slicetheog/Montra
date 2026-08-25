"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { api, ApiRequestError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import { useMe } from "@/hooks/use-me";

/**
 * The one place in the app that asks for money. No repeated prompts, no
 * dark patterns — the offer sits quietly in Settings, is fully explained
 * up front, and can be dismissed with zero pressure (spec section 4).
 */
export function RemoveAdsCard() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function purchase() {
    setPurchasing(true);
    try {
      const result = await api.post<{ status: string; redirectUrl?: string }>("/api/purchases");
      if (result.status === "pending_redirect" && result.redirectUrl) {
        window.location.href = result.redirectUrl;
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("Ads removed. Thank you for supporting Montra!");
      setDialogOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiRequestError ? err.message : "That didn't go through. Please try again.");
    } finally {
      setPurchasing(false);
    }
  }

  async function restore() {
    setRestoring(true);
    try {
      const result = await api.post<{ adsRemoved: boolean }>("/api/purchases/restore");
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.message(result.adsRemoved ? "Purchase restored — ads are removed." : "No previous purchase found on this account.");
    } catch {
      toast.error("Couldn't check for a previous purchase. Please try again.");
    } finally {
      setRestoring(false);
    }
  }

  if (me?.adsRemoved) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-positive">
          <BadgeCheck className="size-5" />
          <p className="font-medium">Ads removed</p>
        </div>
        <p className="mt-1 text-sm text-foreground-muted">
          Thank you for supporting Montra. This applies to your account everywhere you log in.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" />
              <p className="font-medium">Remove Ads Forever</p>
            </div>
            <p className="mt-1 text-sm text-foreground-muted">
              $4.99 one-time purchase. No subscription, no recurring charge. Montra stays completely free
              either way — this just removes the small banner ads.
            </p>
          </div>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="shrink-0">
            Remove Ads — $4.99
          </Button>
        </div>
        <button onClick={restore} disabled={restoring} className="mt-3 text-xs text-foreground-muted hover:text-foreground hover:underline">
          {restoring ? "Checking…" : "Already purchased on another device? Restore purchase"}
        </button>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Ads Forever</DialogTitle>
            <DialogDescription>$4.99 · One-time purchase · No subscription</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-2 text-sm text-foreground-muted">
            <li>• One payment, charged once</li>
            <li>• No recurring charges, ever</li>
            <li>• Ads are permanently removed from your account, on every device</li>
            <li>• Every core feature stays free whether or not you buy this</li>
          </ul>
          {process.env.NEXT_PUBLIC_AD_PROVIDER !== "stripe" && (
            <p className="rounded-md bg-caution-tint p-2.5 text-xs text-caution">
              Demo checkout — no payment provider is configured in this environment, so nothing will be
              charged. In production this completes a real $4.99 charge via Stripe.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Not now
            </Button>
            <Button onClick={purchase} disabled={purchasing}>
              {purchasing ? "Processing…" : "Confirm $4.99 purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
