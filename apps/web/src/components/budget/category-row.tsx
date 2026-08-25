"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { AssignCell } from "@/components/budget/assign-cell";
import { formatCents, cn } from "@/lib/utils";
import type { CategoryMonthView } from "@/hooks/use-budget-month";

export function CategoryRow({
  category,
  onAssign,
  onMoveMoney,
}: {
  category: CategoryMonthView;
  onAssign: (categoryId: string, cents: number) => Promise<unknown>;
  onMoveMoney: (categoryId: string) => void;
}) {
  const availableTone =
    category.availableCents < 0 ? "text-negative" : category.availableCents === 0 ? "text-foreground-muted" : "text-positive";

  return (
    <div className="grid grid-cols-[1fr_7rem_7rem_7rem_2rem] items-center gap-2 border-b border-border px-3 py-2 last:border-b-0 hover:bg-surface-muted/60">
      <div className="flex min-w-0 items-center gap-2">
        <Link
          href={`/accounts?categoryId=${category.categoryId}`}
          className="truncate text-sm font-medium text-foreground hover:underline"
          title={`View ${category.name} transactions`}
        >
          {category.name}
        </Link>
        {category.goalId && (
          <span className="rounded-full bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">Goal</span>
        )}
      </div>
      <div className="text-right text-sm tabular-nums">
        <AssignCell valueCents={category.assignedCents} onSave={(cents) => onAssign(category.categoryId, cents)} />
      </div>
      <div className="text-right text-sm tabular-nums text-foreground-muted">{formatCents(category.activityCents)}</div>
      <div className={cn("text-right text-sm font-medium tabular-nums", availableTone)}>
        {formatCents(category.availableCents)}
      </div>
      <button
        type="button"
        onClick={() => onMoveMoney(category.categoryId)}
        className="flex size-7 items-center justify-center rounded text-foreground-muted hover:bg-surface hover:text-foreground"
        aria-label={`Move money from ${category.name}`}
        title="Move money"
      >
        <ArrowLeftRight className="size-3.5" />
      </button>
    </div>
  );
}

export function CategoryRowHeader() {
  return (
    <div className="grid grid-cols-[1fr_7rem_7rem_7rem_2rem] gap-2 px-3 py-1.5 text-xs font-medium text-foreground-muted">
      <div>Category</div>
      <div className="text-right">Assigned</div>
      <div className="text-right">Activity</div>
      <div className="text-right">Available</div>
      <div />
    </div>
  );
}
