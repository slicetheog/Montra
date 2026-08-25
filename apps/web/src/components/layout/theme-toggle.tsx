"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light" as const, icon: Sun, label: "Light theme" },
  { value: "system" as const, icon: Monitor, label: "System theme" },
  { value: "dark" as const, icon: Moon, label: "Dark theme" },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="inline-flex items-center rounded-md bg-surface-muted p-0.5" role="radiogroup" aria-label="Theme">
      {OPTIONS.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          aria-label={label}
          title={label}
          onClick={() => setTheme(value)}
          className={cn(
            "flex size-7 items-center justify-center rounded-sm transition-colors",
            theme === value ? "bg-surface text-foreground shadow-sm" : "text-foreground-muted hover:text-foreground",
          )}
          // The server can't see localStorage, so it always assumes
          // "system" for this widget's selected state while the client's
          // first render correctly reflects a saved preference — an
          // intentional, expected divergence (same tradeoff every
          // localStorage-backed theme toggle makes; the page's actual
          // dark/light rendering itself is unaffected, handled separately
          // by the blocking pre-hydration script in layout.tsx).
          suppressHydrationWarning
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}
