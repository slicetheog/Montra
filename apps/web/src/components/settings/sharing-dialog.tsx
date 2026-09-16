"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useBudgetMembers, useInviteMember, useRemoveMember } from "@/hooks/use-budget-members";
import { useMe } from "@/hooks/use-me";
import { toast } from "@/lib/toast";
import { ApiRequestError } from "@/lib/api-client";

export function SharingDialog({
  open,
  onOpenChange,
  budgetId,
  budgetName,
  isOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetId: string;
  budgetName: string;
  isOwner: boolean;
}) {
  const { data: me } = useMe();
  const members = useBudgetMembers(budgetId);
  const inviteMember = useInviteMember(budgetId);
  const removeMember = useRemoveMember(budgetId);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);

  async function invite() {
    setError(null);
    setLastInviteUrl(null);
    try {
      const result = await inviteMember.mutateAsync(email);
      setEmail("");
      setLastInviteUrl(result.inviteUrl);
      toast.success("Invite created.", "Copy the link below and send it to them yourself — Montra has no email delivery of its own.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't create that invite. Please try again.");
    }
  }

  async function remove(memberId: string, isSelf: boolean) {
    if (!confirm(isSelf ? "Leave this budget?" : "Remove this collaborator? They'll lose access immediately.")) return;
    await removeMember.mutateAsync(memberId);
    toast.success(isSelf ? "You left the budget." : "Collaborator removed.");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share &quot;{budgetName}&quot;</DialogTitle>
          <DialogDescription>
            Collaborators get the same read/write access you do — assigning money, adding transactions, everything
            except deleting the budget or managing who&apos;s on it.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {isOwner && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="invite-email">Invite by email</Label>
              <div className="flex gap-2">
                <Input id="invite-email" type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Button onClick={invite} disabled={inviteMember.isPending || !email.trim()}>
                  {inviteMember.isPending ? "Inviting…" : "Invite"}
                </Button>
              </div>
              {error && <p className="text-sm text-negative">{error}</p>}
              {lastInviteUrl && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-foreground-muted">
                    Share this link with them (works only for {email || "that address"} once they log in with it):
                  </p>
                  <Input readOnly value={lastInviteUrl} onFocus={(e) => e.target.select()} className="font-mono text-xs" />
                </div>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label>Collaborators</Label>
            {members.isLoading ? (
              <div className="h-12 animate-pulse rounded-lg bg-surface-muted" />
            ) : (
              <ul className="flex flex-col gap-1.5">
                {members.data?.owner && (
                  <li className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                    <span>
                      {members.data.owner.name} <span className="text-foreground-muted">· {members.data.owner.email}</span>
                    </span>
                    <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted">Owner</span>
                  </li>
                )}
                {members.data?.members.map((m) => (
                  <li key={m.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
                    <span>
                      {m.email}{" "}
                      <span className="text-foreground-muted">
                        · {m.status === "PENDING" ? "Invite pending" : "Collaborator"}
                      </span>
                    </span>
                    {(isOwner || m.email.toLowerCase() === me?.user?.email.toLowerCase()) && (
                      <Button variant="ghost" size="sm" onClick={() => remove(m.id, m.email.toLowerCase() === me?.user?.email.toLowerCase())}>
                        {m.status === "PENDING" ? "Revoke" : m.email.toLowerCase() === me?.user?.email.toLowerCase() ? "Leave" : "Remove"}
                      </Button>
                    )}
                  </li>
                ))}
                {members.data?.members.length === 0 && (
                  <p className="text-sm text-foreground-muted">No collaborators yet — this budget is just yours.</p>
                )}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
