"use client";

import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The one way tooltip help text gets attached to a label or control
 * throughout the app — a small "?" glyph that shows `content` on
 * hover/focus. Keeping this as a single shared component (rather than
 * every page rolling its own Tooltip/TooltipTrigger pair) is what makes
 * "every page has consistent help text" actually hold: one visual
 * treatment, one set of accessibility semantics, everywhere.
 *
 * Deliberately keyboard/touch friendly: it's a real <button> (focusable,
 * shows on focus not just hover) with an aria-label so the "?" itself
 * doesn't read as unlabeled to a screen reader — the tooltip text is
 * supplementary, not the only way to reach the explanation.
 */
export function InfoTooltip({ content, className, label = "More info" }: { content: React.ReactNode; className?: string; label?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-full text-foreground-muted",
            "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]",
            className,
          )}
          // Tooltips are hover/focus-driven; a click shouldn't submit a
          // form or trigger a parent's onClick just because the "?" sits
          // inline next to a label.
          onClick={(e) => e.preventDefault()}
        >
          <HelpCircle className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-balance">{content}</TooltipContent>
    </Tooltip>
  );
}
