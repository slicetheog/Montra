# @montra/web

The Montra web app — a Next.js 16 (App Router, Turbopack) app that serves
both the UI and the JSON API from one process.

This package is part of a monorepo. For setup, environment variables,
architecture, and everything else, start at the **[repo root
README](../../README.md)** — this file only covers commands specific to
this package.

## Development

Run from the repo root (`npm run dev`) or from here:

```bash
npm run dev            # Turbopack dev server on :3000
npm run build           # production build (includes a full type check)
npm run start            # serve a production build
npm run typecheck        # tsc --noEmit
npm run lint              # eslint
npm run test:e2e           # Playwright — see apps/web/playwright.config.ts
```

## End-to-end tests

`e2e/` holds the Playwright suite:

- `happy-path.spec.ts` — the full new-user lifecycle: register →
  onboarding → create an account with a starting balance → add income →
  assign it → spend → watch a category's Available change → move money →
  create a goal → import a CSV → export data → log out → log back in →
  confirm everything persisted.
- `security.spec.ts` — cross-user authorization (IDOR) checks with two
  real registered accounts, rate limiting, CSRF, and login-enumeration
  resistance.

By default the suite starts its own dev server against a dedicated
`montra_test` database (see `playwright.config.ts`) so it never touches
your `montra_dev` data. Create that database once
(`createdb montra_test`, then `db:migrate` against it) before running
`npm run test:e2e`.

To run against an already-running server instead (e.g. a production
build, for a final smoke test — see the root DEPLOYMENT.md), set
`PLAYWRIGHT_BASE_URL`:

```bash
PLAYWRIGHT_BASE_URL=http://localhost:3000 npx playwright test
```
