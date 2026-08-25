"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * True once the client has hydrated, false during SSR and during the
 * client's very first (hydration-matching) render — never flips via a
 * `useEffect` + `setState`, which is exactly the pattern
 * eslint-plugin-react-hooks's `set-state-in-effect` rule (rightly) flags.
 * `useSyncExternalStore` is the primitive React itself recommends for
 * "render differently after hydration" without that anti-pattern: its
 * server snapshot is always `false`, so SSR and the client's first commit
 * are guaranteed to agree, and only the *next* client render (driven by
 * React itself, not a manual effect) can return `true`.
 */
export function useHasHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
