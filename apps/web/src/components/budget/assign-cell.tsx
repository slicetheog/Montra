"use client";

import { useState } from "react";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { formatCents, cn } from "@/lib/utils";
import { toast } from "@/lib/toast";

export function AssignCell({
  valueCents,
  onSave,
}: {
  valueCents: number;
  onSave: (nextCents: number) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
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
