# Architecture

## Layering

```
UI (React components, apps/web/src/components + src/app)
   |  never computes a balance itself — only renders what it's given
   v
Application services (apps/web/src/server/services/*)
   |  auth, authorization, input validation (Zod), orchestration,
   |  audit logging — talks to Prisma AND to the domain engine
   v
Financial domain engine (packages/domain/src)
   |  pure functions, no framework, no database, no I/O
   |  every money rule lives here and only here
   v
Database (packages/db — Prisma schema + PostgreSQL)
```

The rule that actually matters: **the domain engine never touches Prisma,
and the UI never re-derives a financial figure the engine already
computed.** A service function fetches the facts it needs (via Prisma),
hands them to a pure function in `@montra/domain`, and returns the
result. This means every financial rule — Ready to Assign, a category's
rollover, whether a transaction's splits sum correctly, the credit-card
auto-offset, a goal's projected completion date — is unit-testable
without a database, and there is exactly one implementation of each rule
instead of one in the API and a shadow copy in the UI that can drift out
of sync.

## Why a monorepo with two packages instead of one app

- **`packages/domain`** is the part of the codebase where a bug is a
  wrong balance in someone's budget, so it has the highest bar: no
  floating-point, 100% pure functions, and a test file per module. Making
  it its own package (rather than a folder inside `apps/web`) is a forcing
  function — nothing here is allowed to `import` Next.js, Prisma, or
  React, because the package simply doesn't depend on them.
- **`packages/db`** owns the Prisma schema and migrations. Keeping it
  separate from `apps/web` means a future second client (a React Native
  app, a CLI import tool) can depend on the same generated client and
  migration history without depending on the Next.js app.
- **`apps/web`** is the only deployable today. It's a Next.js App Router
  app serving both the UI and the JSON API (`src/app/api/**/route.ts`)
  from one process — see DEPLOYMENT.md for why that's the right call at
  this stage, and what changes if it stops being enough.

## Tech stack and why

| Concern | Choice | Why |
|---|---|---|
| Framework | Next.js 16 (App Router, Turbopack) | One process serves both server-rendered pages and the JSON API; React Server Components keep the marketing/auth pages fast without hand-rolling a separate static site. |
| Language | TypeScript, strict mode | The financial engine's whole safety case rests on the type checker catching a `number` where a `Cents` was required — see FINANCIAL_ENGINE.md. |
| Database | PostgreSQL + Prisma | Relational integrity (foreign keys, unique constraints) is exactly what a ledger needs; Prisma's generated client keeps query shapes type-safe end to end. |
| Styling | Tailwind CSS v4 | Utility classes plus small local UI primitives (`src/components/ui`) — no external component library, since the spec requires an original visual identity, not a reskinned one. |
| Server state | TanStack Query | Caching, request de-duplication, and optimistic updates for a UI that has to stay fast at 10,000+ transactions. |
| Client UI state | Zustand (+ `persist`) | Small, local-only UI state (current budget selection, theme) that doesn't belong in a server cache. |
| Validation | Zod | Every API route validates its input against a schema before it reaches a service function — see SECURITY.md. |
| Charts | Recharts | Reports, net worth trend, category trend. |
| CSV | Papaparse | Import parsing; export is generated server-side as plain text. |
| Auth | Hand-rolled cookie sessions (bcryptjs + opaque bearer tokens) | See SECURITY.md for the full reasoning — a session table gives us server-side revocation ("log out everywhere," password-change invalidation) that a stateless JWT doesn't. |
| Testing | Vitest (domain unit tests), Playwright (E2E) | The domain engine is tested in complete isolation from the database; Playwright exercises the real app end to end, including two real user accounts for the authorization tests. |

## Money handling

Every monetary amount is an **integer number of cents** (`type Cents =
number & { __brand: "Cents" }` — a branded type, so a plain `number` can't
be passed where a `Cents` is expected without going through the
conversion functions). There is no floating-point arithmetic anywhere in
the money path. See FINANCIAL_ENGINE.md for the full design.

## Provider abstractions (ads, payments)

Two things in this app are explicitly designed to be swapped later
without touching the rest of the codebase:

- **Ads** (`src/lib/ads`, `src/components/ads/ad-banner.tsx`): a provider
  interface with a `placeholder` implementation (a clearly-labeled house
  ad, no network calls, no data collection) and an `adsense`
  implementation. Selected via `NEXT_PUBLIC_AD_PROVIDER`. The financial
  engine and the ad layer never share code or data — no budget, account,
  transaction, or category information is ever passed to an ad provider.
- **Payments** (`src/server/payments`, `src/lib/payments`): a provider
  interface with a `placeholder` implementation (simulates a successful
  purchase instantly, for local development only) and a `stripe`
  implementation for the real $4.99 one-time "Remove Ads Forever"
  purchase. Selected via `PAYMENT_PROVIDER`. Entitlement
  (`Entitlement.adsRemoved`) is stored server-side against the user, not
  the device, so it correctly persists across every device the user logs
  into — never a client-side flag, never a subscription.

## Transaction sources

`Transaction` rows carry a `source` field (`MANUAL`, `IMPORT`, `RECURRING`)
rather than assuming manual entry is the only path money can enter the
ledger. Today only manual entry and CSV import are implemented, but this
is the seam a future bank-sync integration would plug into: a new source
adds transactions through the same `createTransaction`/ledger path
everything else uses, instead of requiring a parallel write path or a
rewrite of the budget engine.

## Responsive design

A desktop table must not simply shrink until it's unusable on mobile.
Rather than one fluid layout, the budget category grid and the
transaction list each render **two** layouts — a compact mobile card and
the full desktop table — both present in the DOM at all times, with
Tailwind's `sm:` breakpoint controlling which one is visible
(`sm:hidden` / `hidden sm:flex`). This is simpler and more robust than
conditionally mounting based on a JS-measured viewport, which would
introduce exactly the kind of hydration mismatch described below. The
dual-render pattern does mean tests need to select the currently
*visible* instance (`:visible` in Playwright) rather than matching by
text alone, since both instances share the same accessible name.

## Hydration safety: a real bug class, not just a console warning

Next.js server-renders the initial HTML for every page, including
client components; the browser then "hydrates" that HTML by running the
same component tree again and attaching event handlers. React expects
the very first client render to produce identical output to what the
server sent. Anything a component derives from data that only exists in
the browser — `localStorage`, a Zustand `persist` store, a TanStack Query
cache that happens to resolve unusually fast — can violate that
assumption, because the server never had access to it.

This is not merely cosmetic. When React detects a mismatch, it logs a
warning and **leaves the mismatched DOM node exactly as the server
rendered it**, rather than correcting it — and because React's
reconciler now believes that node's props already equal what the client
computed, a *later* render that computes that same value again is (from
React's point of view) a no-op, so the DOM is never touched again either.
A concrete case hit during development: a button's `disabled` attribute
was gated on a budget ID that was already resolved in the browser (from
a persisted store) before React's post-hydration recheck completed, so
the button rendered `disabled` on the server, matched that same
`disabled` value on the client's first render too, and then stayed
disabled forever — a real, permanently broken button, not a warning.

The fix, used consistently across the app (`src/hooks/use-hydrated.ts`),
is a `useHasHydrated()` hook built on `useSyncExternalStore`: it returns
`false` for the server render and the client's very first render (so the
two are guaranteed to match), and only returns `true` starting with the
next render — which is an ordinary post-hydration update, not a
hydration diff, so React updates the DOM correctly. Any hook or
component that derives UI state from client-only data (persisted
stores, `window`, `localStorage`) gates that derivation behind this flag
rather than trying to make the server and client agree by other means.
