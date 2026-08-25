# Montra

Montra is a free, zero-based budgeting web app: give every dollar a job.
No bank connections, no subscription — just manual entry, CSV import, and
a real financial ledger under the hood. The app is free forever; the only
monetization is a small banner ad and an optional one-time **$4.99 Remove
Ads Forever** purchase (never a subscription).

This is a monorepo. The docs below assume you're starting from a clean
checkout with nothing running yet.

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — layering, tech stack, folder map, key design decisions
- **[DATABASE.md](./DATABASE.md)** — schema, entities, user-isolation pattern
- **[FINANCIAL_ENGINE.md](./FINANCIAL_ENGINE.md)** — how zero-based budgeting is actually computed
- **[SECURITY.md](./SECURITY.md)** — auth, sessions, authorization, rate limiting, CSRF
- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — environment variables, migrations, running in production
- **[API.md](./API.md)** — REST endpoint reference

## Quick start

Prerequisites: Node.js 20+, npm, and a PostgreSQL 15+ server.

```bash
# 1. Install dependencies (installs all workspaces)
npm install

# 2. Create two local databases (dev + a separate one for tests)
createdb montra_dev
createdb montra_test

# 3. Configure environment
cp apps/web/.env.example apps/web/.env.local
# edit apps/web/.env.local — at minimum, point DATABASE_URL at montra_dev

# 4. Run migrations
npm run db:migrate

# 5. Start the dev server
npm run dev
```

Open http://localhost:3000, register an account, and walk through
onboarding. See DEPLOYMENT.md for what to change before shipping this to
real users (payment provider, ad provider, HTTPS, migration strategy).

## Repository layout

```
apps/
  web/                  Next.js app (UI + API routes) — the only deployable
    src/app/            Routes: marketing page, auth, onboarding, and the
                         authenticated app (dashboard, budget, accounts, …)
                         plus /api/* route handlers
    src/server/         Application services, validation (Zod), auth,
                         payments/ads provider adapters — all server-only
    src/components/     React components, organized by feature
    src/hooks/          TanStack Query hooks + small client-state hooks
    e2e/                Playwright end-to-end tests
packages/
  domain/               The financial engine — pure TypeScript, zero
                         framework/DB dependencies, fully unit tested
  db/                   Prisma schema, migrations, generated client, seed
```

See ARCHITECTURE.md for why the code is split this way.

## Everyday commands

Run from the repo root unless noted.

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` for the web app |
| `npm run lint` | ESLint for the web app |
| `npm run test` | Run the domain engine's unit test suite (Vitest) |
| `npm run test:e2e` | Run the Playwright end-to-end suite (needs a running dev server + `montra_test` DB — see `apps/web/playwright.config.ts`) |
| `npm run db:migrate` | Apply Prisma migrations to your dev DB |
| `npm run db:generate` | Regenerate the Prisma client after a schema change |
| `npm run db:seed` | Seed default category groups/categories reference data |

## What's built vs. roadmap

**Built and working end-to-end:** registration/login, onboarding, the
zero-based budget engine (assign/move/rollover/overspending/credit-card
offset), accounts and a full transaction register (splits, transfers,
refunds), payees, recurring transactions, goals (4 types), debt payoff
projections, reports, net worth, dashboard, CSV import with duplicate
detection, CSV export, full JSON backup/restore, account reconciliation,
multiple budgets, settings, the ad + $4.99 remove-ads entitlement system,
and a responsive UI (desktop sidebar / tablet compact sidebar / mobile
bottom nav) that's WCAG 2A/2AA-audited.

**Explicitly not built yet (roadmap):**
- Native mobile app (React Native + Expo) — the API is designed to serve
  one, but no client exists yet.
- Offline mode / local-first sync.
- Global search across transactions/payees/categories.
- Outbound notification delivery (the data model and settings toggle
  exist; nothing sends a bill-due or overspending notification yet).

## Testing

- `packages/domain` has a full unit test suite for every financial rule
  (Ready to Assign, rollover, credit-card offset, split validation, goal
  math, recurrence, reconciliation, CSV import matching) — this is the
  layer where correctness actually matters, so it's tested independent of
  the database or UI.
- `apps/web/e2e` has a Playwright suite covering the full new-user
  lifecycle (register → onboarding → budget → transactions → goals →
  import/export → logout/login → persistence) and a security suite
  (cross-user data access, rate limiting, CSRF, login enumeration).
