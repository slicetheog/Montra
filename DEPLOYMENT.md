# Deployment

## What Montra is, operationally

`apps/web` is a single Next.js app that serves both the UI and the JSON
API from one process. There is no separate backend to deploy. This is
the right shape for the app's current scale — see "When this stops being
enough" below for what changes if that assumption breaks.

## Environment variables

Copy `apps/web/.env.example` to `apps/web/.env.local` for local
development, or set these directly in your hosting platform for
staging/production.

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string, read by Prisma. |
| `NEXT_PUBLIC_APP_URL` | Yes | The app's own canonical origin. Used for CORS/CSRF origin checks (`isSameOriginRequest`) and absolute links. Must be the real HTTPS origin in production. |
| `NEXT_PUBLIC_AD_PROVIDER` | Yes | `placeholder` (a labeled house ad, no network calls — safe for dev) or `adsense`. |
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | Only if `adsense` | Your AdSense publisher ID. |
| `PAYMENT_PROVIDER` | Yes | `placeholder` (simulates a successful $4.99 purchase instantly — **local development only, never production**) or `stripe`. |
| `STRIPE_SECRET_KEY` | Only if `stripe` | Server-side Stripe API key. |
| `STRIPE_WEBHOOK_SECRET` | Only if `stripe` | Verifies `POST /api/webhooks/stripe` came from Stripe. |
| `STRIPE_REMOVE_ADS_PRICE_ID` | Only if `stripe` | The Stripe Price ID for the one-time $4.99 Remove Ads purchase. |

`NODE_ENV=production` (set automatically by `next build`/`next start`)
additionally controls whether the session cookie is marked `secure` —
see SECURITY.md. Don't run a production deployment with
`PAYMENT_PROVIDER=placeholder`; it exists purely so local development
and CI don't need real Stripe credentials.

## Database setup

`apps/web`'s own `build` script (`npm run build`, whatever platform runs
it) applies pending migrations before it builds:

```json
"build": "npm run db:migrate:deploy --prefix ../../packages/db && next build"
```

This is `prisma migrate deploy` — non-interactive and safe for a deploy
pipeline; unlike `prisma migrate dev`, it never tries to resolve schema
drift by prompting, and re-running it when there's nothing new to apply
is a no-op. It runs during the *build* step, before the new version ever
starts serving traffic — on Vercel specifically this is safe because
builds are isolated, one per deployment, never running concurrently
against the same deploy the way multiple already-running app instances
could race each other applying a migration on boot.

The only thing this doesn't do for you is create the database itself:

```bash
createdb montra_prod   # or your host's equivalent — see below for Vercel
```

and `DATABASE_URL` has to actually be set (see Environment variables,
above) before the first build/deploy — the build-time migration step
needs it exactly like everything else does.

**On Vercel specifically:** environment variables set in the dashboard
are injected as real process variables for both the build and runtime —
Prisma picks them up automatically, no `.env` file needed there.
Provisioning a Postgres database from Vercel's own Storage tab (Neon)
and connecting it to the project will write the necessary variables for
you, but **check the exact name it creates** — the integration lets you
set a "custom prefix," and unless you set that prefix to exactly
`DATABASE` (making the resulting variable `DATABASE_URL`), it'll create
something like `STORAGE_URL` instead, which `schema.prisma` won't find
(`env("DATABASE_URL")` is the only name it reads). Also leave "create a
database branch for deployment" unchecked for Production/Preview unless
you deliberately want each environment on its own separate, empty
database branch that would each need migrating independently.

## Build and run

```bash
npm install             # also generates the Prisma client (postinstall)
npm run build            # apps/web — applies pending migrations (see
                          # Database setup above), then a production
                          # build with a full TypeScript check (next
                          # build fails the build on a type error, not
                          # just at `npm run typecheck`)
npm run start -w apps/web  # next start, serves the build
```

The production build was verified against the full Playwright suite
(both the happy-path and security suites pass identically against `next
start` as against the dev server, and notably faster) — see README.md's
Testing section.

## Where to run it

Any platform that can run a long-lived Node.js process works
(a single `next start` process, not a static export — the app has
server-rendered pages and API routes). A platform-managed Postgres
instance (or any reachable Postgres 15+) is the only other required
piece of infrastructure. There is no queue, cache, or separate worker
process to provision for the feature set that exists today.

## HTTPS

Terminate TLS in front of the app (a platform load balancer, a reverse
proxy). The session cookie is only marked `secure` when
`NODE_ENV=production`, so a production deployment not served over HTTPS
would silently break login persistence in most browsers — always deploy
production behind HTTPS.

## Backups

Montra's own in-app JSON backup/restore (Settings → Data) is a
user-level convenience, not a substitute for real database backups. Use
your PostgreSQL host's own backup mechanism (continuous WAL archiving or
scheduled `pg_dump`) for actual disaster recovery.

## Observability

Unexpected errors are logged server-side in full via `console.error`
before `apiError()` returns the client a generic, safe message (see
SECURITY.md) — pipe the process's stdout/stderr into whatever your
platform uses for log aggregation. There's no APM/tracing integration
wired in yet; adding one is a matter of instrumenting
`src/server/api-helpers.ts`'s `apiError` and the top-level route
wrapper, since every API route already funnels through both.

## When this stops being enough

The architecture is intentionally simple for where the app is today.
Two things are the first to hit a real ceiling, and both are explicitly
designed to be swappable without a rewrite (see ARCHITECTURE.md):

- **Rate limiting is in-process memory** (`src/server/auth/rate-limit.ts`).
  Correct for exactly one running instance. The moment you run more than
  one instance of the app behind a load balancer, swap the
  `InMemoryRateLimiter` for an implementation backed by a shared store
  (e.g. Upstash Redis) behind the same `RateLimiter` interface — nothing
  else in the app needs to change.
- **Sessions are a single Postgres table**, which is fine at this scale
  and gives us server-side revocation a JWT can't (see SECURITY.md). If
  session-table read volume ever becomes a bottleneck, the usual next
  step is a read-through cache in front of `getSessionUser()`, not a
  redesign of the session model itself.

Everything else (the domain engine, the Prisma schema, the API route
structure) was built to scale by adding indexes and pagination, not by
changing shape — see DATABASE.md for the indexes already in place for
the query patterns the app relies on (an account's register, a
category's month-by-month history, a user's due recurring transactions).
