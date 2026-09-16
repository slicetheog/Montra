"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useMe } from "@/hooks/use-me";
import { useAcceptInvite, useInvitePreview } from "@/hooks/use-budget-members";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { ApiRequestError } from "@/lib/api-client";

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: me, isLoading: meLoading } = useMe();
  const preview = useInvitePreview(token);
  const acceptInvite = useAcceptInvite();
  const { setBudgetId } = useCurrentBudget();

  useEffect(() => {
    if (!meLoading && !me?.user) {
      router.replace(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
    }
  }, [meLoading, me, router, token]);

  if (meLoading || !me?.user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="h-40 w-full max-w-sm animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  const emailMatches = preview.data && preview.data.invitedEmail.toLowerCase() === me.user.email.toLowerCase();

  async function accept() {
    try {
      const result = await acceptInvite.mutateAsync(token);
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      setBudgetId(result.budgetId);
      router.push("/budget");
    } catch {
      // Error is rendered below from acceptInvite.error.
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-2" />
          <Users className="mb-2 size-8 text-foreground-muted" />
          <CardTitle>You&apos;ve been invited</CardTitle>
          {preview.data && (
            <CardDescription>
              {preview.data.invitedByName} invited you to collaborate on &quot;{preview.data.budgetName}&quot;.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {preview.isLoading && <div className="h-10 animate-pulse rounded-lg bg-surface-muted" />}
          {preview.isError && (
            <p className="text-center text-sm text-negative">
              {preview.error instanceof ApiRequestError ? preview.error.message : "That invite link is no longer valid."}
            </p>
          )}
          {preview.data && !emailMatches && (
            <p className="text-center text-sm text-negative">
              This invite is for {preview.data.invitedEmail}. Log in with that account to accept it.
            </p>
          )}
          {preview.data && emailMatches && (
            <Button onClick={accept} disabled={acceptInvite.isPending}>
              {acceptInvite.isPending ? "Joining…" : "Accept invite"}
            </Button>
          )}
          {acceptInvite.isError && (
            <p className="text-center text-sm text-negative">
              {acceptInvite.error instanceof ApiRequestError ? acceptInvite.error.message : "Couldn't accept that invite. Please try again."}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
