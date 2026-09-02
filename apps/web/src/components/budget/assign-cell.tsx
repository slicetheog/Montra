"use client";

import { useState } from "react";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { cn } from "@/lib/utils";
import { useFormatCents } from "@/hooks/use-locale-format";
import { toast } from "@/lib/toast";

export function AssignCell({
  valueCents,
  onSave,
  testId,
}: {
  valueCents: number;
  onSave: (nextCents: number) => Promise<unknown>;
  /** Stable hook for e2e tests — the responsive mobile/desktop rows render
   *  two instances of this per category (only one visible at a time), so
   *  tests must further filter to the visible one. */
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const formatCents = useFormatCents();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit() {
    setDraft((valueCents / 100).toFixed(2));
    setEditing(true);
  }

  async function commit() {
    try {
      const next = draft.trim() === "" ? 0 : parseDecimalToCents(draft);
      setSaving(true);
      await onSave(next);
      setEditing(false);
    } catch (err) {
      toast.error(err instanceof MoneyError ? "Enter a valid dollar amount." : "Couldn't save that. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEdit}
        data-testid={testId}
        className="w-full rounded px-2 py-1 text-right tabular-nums hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        aria-label={`Assigned ${formatCents(valueCents)}. Click to edit.`}
      >
        {formatCents(valueCents)}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={draft}
      disabled={saving}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
      inputMode="decimal"
      className={cn(
        "w-full rounded border border-brand bg-surface px-2 py-1 text-right tabular-nums",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
      )}
      aria-label="Edit assigned amount"
    />
  );
}
