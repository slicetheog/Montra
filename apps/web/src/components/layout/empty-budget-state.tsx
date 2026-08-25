import Link from "next/link";
import { PiggyBank } from "lucide-react";
import { Button } from "@/components/ui/button";

export function EmptyBudgetState() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <PiggyBank className="size-10 text-foreground-muted" />
      <h2 className="text-lg font-semibold">No budget yet</h2>
      <p className="max-w-sm text-sm text-foreground-muted">
        Create a budget to start assigning your money a job.
      </p>
      <Button asChild>
        <Link href="/settings?tab=budgets">Create a budget</Link>
      </Button>
    </div>
  );
}
