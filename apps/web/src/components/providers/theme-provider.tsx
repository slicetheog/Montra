"use client";

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "montra-theme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isDarkTheme(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", isDarkTheme(theme));
}

/**
 * The actual "no flash of wrong theme" work happens in the inline script
 * rendered in <head> (see app/layout.tsx) which runs before first paint.
 * This provider just keeps React state in sync with that after hydration
 * and exposes setTheme() to the rest of the app (Settings page).
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer (not an effect) so this never fires a post-mount
  // setState render — the inline <script> in <head> already painted the
  // right theme before React hydrates; this just matches that state.
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window === "undefined") return "system";
    return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as Theme | null ?? "system") === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setThemeState(next);
    applyTheme(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

function subscribeToSystemScheme(onChange: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/**
 * The theme as actually rendered ("light" | "dark"), not the raw
 * preference ("system" included) — for anything that needs to pick a
 * concrete value itself, like a chart color that isn't a CSS variable
 * (an inline SVG `stroke`/`fill` can't resolve `var(--brand)` the way a
 * DOM element's className can). `useSyncExternalStore`, not an effect +
 * setState, for the same reason as useHasHydrated() — see its own
 * comment: that's the anti-pattern eslint-plugin-react-hooks's
 * `set-state-in-effect` rule flags, and the primitive React itself
 * recommends for "read live state from a browser API" instead.
 */
export function useResolvedTheme(): "light" | "dark" {
  const { theme } = useTheme();
  const systemIsDark = useSyncExternalStore(
    subscribeToSystemScheme,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false, // SSR snapshot — matches the light default from THEME_INIT_SCRIPT below
  );
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return systemIsDark ? "dark" : "light";
}

/** Source string for the blocking inline <script> — kept here so the logic lives in one place. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var theme = localStorage.getItem('${STORAGE_KEY}') || 'system';
    var isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
`;
