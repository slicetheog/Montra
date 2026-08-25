"use client";

import Link from "next/link";
import { ArrowLeftRight } from "lucide-react";
import { AssignCell } from "@/components/budget/assign-cell";
import { formatCents, cn } from "@/lib/utils";
import type { CategoryMonthView } from "@/hooks/use-budget-month";

/**
 * Two distinct layouts, not one table squeezed to fit: a compact card on
 * narrow screens (name + Available up top, Assigned/Activity as a
 * secondary line) and the full four-column table from `sm:` up. Spec:
 * "Do not simply shrink desktop tables until they become unusable."
 */
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

  const nameLink = (
    <Link
      href={`/accounts?categoryId=${category.categoryId}`}
      className="truncate text-sm font-medium text-foreground hover:underline"
      title={`View ${category.name} transactions`}
    >
      {category.name}
    </Link>
  );

  const moveButton = (
    <button
      type="button"
      onClick={() => onMoveMoney(category.categoryId)}
      data-testid={`move-${category.categoryId}`}
      className="flex size-7 shrink-0 items-center justify-center rounded text-foreground-muted hover:bg-surface hover:text-foreground"
      aria-label={`Move money from ${category.name}`}
      title="Move money"
    >
      <ArrowLeftRight className="size-3.5" />
    </button>
  );

  return (
    <div className="border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-surface-muted/60 sm:grid sm:grid-cols-[1fr_7rem_7rem_7rem_2rem] sm:items-center sm:gap-2 sm:py-2">
      {/* Mobile card layout */}
      <div className="flex items-center justify-between gap-3 sm:hidden">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {nameLink}
            {category.goalId && (
              <span className="shrink-0 rounded-full bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">Goal</span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-foreground-muted">
            <span className="flex items-center gap-1">
              Assigned
              <AssignCell
                valueCents={category.assignedCents}
                onSave={(cents) => onAssign(category.categoryId, cents)}
                testId={`assign-${category.categoryId}`}
              />
            </span>
            <span>Activity {formatCents(category.activityCents)}</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span
            data-testid={`available-${category.categoryId}`}
            className={cn("text-sm font-semibold tabular-nums", availableTone)}
          >
            {formatCents(category.availableCents)}
          </span>
          {moveButton}
        </div>
      </div>

      {/* Desktop/tablet table row */}
      <div className="hidden min-w-0 items-center gap-2 sm:flex">
        {nameLink}
        {category.goalId && (
          <span className="shrink-0 rounded-full bg-accent-tint px-1.5 py-0.5 text-[10px] font-medium text-accent">Goal</span>
        )}
      </div>
      <div className="hidden text-right text-sm tabular-nums sm:block">
        <AssignCell
          valueCents={category.assignedCents}
          onSave={(cents) => onAssign(category.categoryId, cents)}
          testId={`assign-${category.categoryId}`}
        />
      </div>
      <div className="hidden text-right text-sm tabular-nums text-foreground-muted sm:block">{formatCents(category.activityCents)}</div>
      <div
        data-testid={`available-${category.categoryId}`}
        className={cn("hidden text-right text-sm font-medium tabular-nums sm:block", availableTone)}
      >
        {formatCents(category.availableCents)}
      </div>
      <div className="hidden sm:flex sm:justify-center">{moveButton}</div>
    </div>
  );
}

export function CategoryRowHeader() {
  return (
    <div className="hidden gap-2 px-3 py-1.5 text-xs font-medium text-foreground-muted sm:grid sm:grid-cols-[1fr_7rem_7rem_7rem_2rem]">
      <div>Category</div>
      <div className="text-right">Assigned</div>
      <div className="text-right">Activity</div>
      <div className="text-right">Available</div>
      <div />
    </div>
  );
}
