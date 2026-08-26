# Database

PostgreSQL, managed with Prisma (`packages/db/prisma/schema.prisma`).
This document describes the shape of the data and the rules the schema
and the code around it both enforce. For how the numbers in these tables
turn into a budget, see FINANCIAL_ENGINE.md. For how access to this data
is restricted per user, see SECURITY.md's "Authorization" section — this
document only covers the schema-level half of that story.

## Every ID is a `cuid()`

All primary keys are collision-resistant `cuid()` strings, not
sequential integers. This is a deliberate small security property: a
sequential ID lets an attacker enumerate other users' records by
incrementing a number; a `cuid()` doesn't (though ID unguessability is
never the actual authorization boundary here — see SECURITY.md for why
every request is also checked against the session's `userId`
regardless).

## Entities

**Identity & account**
- `User` — email (unique), bcrypt password hash, name.
- `Session` — one row per active login. The cookie holds an opaque
  bearer token; only its SHA-256 hash is stored here (see SECURITY.md).
- `UserSettings` — currency, date format, first-day-of-month, theme,
  notification toggle, onboarding-completed timestamp.
- `Entitlement` — `adsRemoved: Boolean`, one row per user. The single
  source of truth for whether ads are hidden — always read server-side,
  never trusted from the client.
- `Purchase` — an audit trail of purchase attempts/completions (provider,
  amount, status), independent of `Entitlement` so a failed or refunded
  purchase doesn't silently vanish from the record.

**Budget structure**
- `Budget` — a user can have more than one (e.g. personal + a shared
  household budget entered manually); each is fully independent.
- `BudgetMonth` — one row per `(budgetId, month)`, created lazily the
  first time a month is viewed or assigned into.
- `CategoryGroup` / `Category` — the envelope structure (e.g. group
  "Food" containing categories "Groceries", "Restaurants"). Both carry a
  `sortOrder` for drag-reordering and a soft-delete flag rather than a
  hard delete, so historical transactions keep a valid category
  reference.
- `CategoryMonth` — per-category, per-month metadata that isn't a ledger
  entry (e.g. a rolled-over "available" isn't stored here — it's always
  computed; see FINANCIAL_ENGINE.md for exactly what is and isn't
  persisted).

**The ledger** — this is the part that has to be right:
- `Assignment` — every dollar moved *into or between* categories is a row
  here: a signed `amountCents` delta with a `kind`
  (`ASSIGN` / `MOVE_FROM` / `MOVE_TO` / `CC_OFFSET`), never a mutated
  running total. `pairedWithId` links the two legs of a move; a
  `CC_OFFSET` row additionally links back to the `Transaction` that
  triggered it (`sourceTransactionId`) so editing or deleting that
  transaction can precisely reverse the offset instead of leaving the
  envelope math orphaned. This append-only design means a category's
  assigned total for a month is always `sum(Assignment.amountCents)` —
  fully auditable, and trivially replayable if a bug is ever found in how
  a total was computed.
- `Transaction` — a signed `amountCents` (outflow negative, inflow
  positive), a `type` (`INCOME` / `EXPENSE` / `TRANSFER`), and a
  `cleared` status. A transfer is two linked `Transaction` rows
  (`transferPeerId`) rather than one row with two account fields, so
  every other query (an account's register, a category's activity) only
  ever has to reason about one kind of row.
- `TransactionSplit` — **every** transaction has at least one split, even
  a plain single-category expense. A non-split transaction is simply a
  transaction with exactly one split whose amount equals the total. This
  is the single-code-path principle from ARCHITECTURE.md applied to the
  schema: category "Activity" is always `sum(TransactionSplit.amountCents)`
  grouped by category, with no separate branch for "was this split or
  not."
- `Account` — checking/savings/credit card/cash/investment/loan/other,
  asset or liability by type. There is no separate "starting balance"
  field: a starting balance is an ordinary `Transaction` with payee
  "Starting Balance," so an account's balance is always just the sum of
  its transactions — one formula, no special case (see
  FINANCIAL_ENGINE.md).
- `Debt` — interest rate and minimum payment attached to a `CREDIT_CARD`
  or `LOAN` account, used for payoff projections.
- `Payee` — with usage stats for smart suggestions on next entry, plus a
  merge operation for cleaning up duplicates.
- `Reconciliation` — a snapshot of a reconciliation event (statement
  balance, date, and the adjustment transaction if one was needed).

**Automation & import**
- `RecurringTransaction` — a template plus a schedule; `nextOccurrenceDate`
  is indexed so a scheduler can efficiently find what's due.
- `Import` / `ImportTransaction` — a CSV import is staged as an `Import`
  with one `ImportTransaction` row per parsed line (with duplicate
  detection against existing transactions) before the user commits it;
  nothing touches the real ledger until commit.
- `Goal` — one of 4 types (target balance, target balance by date,
  monthly contribution, debt payoff), optionally linked to a `Category`
  or, for debt-payoff goals, an `Account`.

**Operational**
- `Notification` — data model + read state exists; nothing currently
  writes to it (see the roadmap note in README.md).
- `AuditLog` — append-only record of security/account-relevant actions
  (login, password change, purchase, data export/restore, account
  deletion), indexed by `(userId, createdAt)`.

## User isolation: the schema's role in it

Every budget-scoped table carries a direct or indirect `budgetId`, and
every `Budget` carries a `userId`. The schema enforces referential
integrity (you cannot create a `Category` pointing at a `Budget` that
doesn't exist), but it does **not** by itself stop user A from passing
user B's `categoryId` into a request — that check is application-level,
not a database constraint, because Postgres has no notion of "the
current session's user" in a connection-pooled serverless-friendly
setup. Every service function that accepts a foreign ID re-fetches that
row and checks its `budgetId` (or `userId`) against the authenticated
session before using it. See SECURITY.md for the exact pattern and why
it's applied to every cross-referenced ID, not just the top-level
`budgetId` in the URL — this is where several real bugs were found and
fixed during development.

## Cascades

`onDelete: Cascade` is used deliberately on every budget-owned table:
deleting a `Budget` cleanly removes every category, account, transaction,
assignment, etc. underneath it (used by account deletion in Settings), so
there's no risk of orphaned rows accumulating from partial deletes.
`Category` deletion is soft (an `isArchived` flag) specifically so it
does *not* cascade — historical transactions must keep referring to a
real category row.

## Migrations

Prisma migrations live in `packages/db/prisma/migrations`. In
development, `npm run db:migrate` (which runs `prisma migrate dev`)
creates and applies a new migration from any schema change. In
production, use `prisma migrate deploy` (`npm run db:migrate:deploy` in
`packages/db`) — it only applies already-generated migrations and never
tries to interactively resolve drift, which is the correct behavior for
a deploy pipeline. See DEPLOYMENT.md.

## Seeding

There's no database-level seed script — the "smart default categories"
onboarding step is just an API endpoint
(`POST /api/budgets/:id/seed-defaults`) that any budget can call, not
reference data loaded into the database ahead of time (see API.md).

For a populated demo account, use `npm run seed:demo` (see the root
README's "Demo account" section) — it drives the running app's own API
to create a regular user with sample data, rather than writing rows
directly.
