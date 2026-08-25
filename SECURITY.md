# Security

This document covers authentication, session management, authorization
(the "can this user touch this row" question — the one the spec
emphasizes most: *"A user must never be able to access another user's
data by manipulating IDs"*), input validation, rate limiting, CSRF/CORS,
and the audit log.

## Passwords

Hashed with **bcrypt (via bcryptjs), cost factor 12**
(`src/server/auth/password.ts`) — pure-JS bcrypt is used instead of
native bindings so the app doesn't need a native build step on any
deploy target, including serverless. A plaintext password never reaches
the database, a log line, or the audit log.

Registration enforces a minimum bar (`validatePasswordStrength`): at
least 10 characters, upper- and lowercase letters, and a number. This
runs server-side, not just as client-side form validation — see the E2E
security suite's "register enforces password strength" test.

## Sessions

Montra uses hand-rolled cookie sessions rather than JWTs
(`src/server/auth/session.ts`), specifically so sessions can be revoked
server-side — a stateless JWT can't be un-issued before it expires,
which matters for "log out everywhere" and invalidating every session on
a password change (`destroyAllSessions`).

- On login, a 32-byte random token (`randomBytes(32).toString("base64url")`)
  is generated. **Only its SHA-256 hash is stored** as the `Session`
  row's primary key — the same principle as never storing a plaintext
  password, so a compromised database backup alone can't be used to
  forge a session; you'd also need the token, which only ever lived in
  the user's cookie jar.
- The cookie is `httpOnly` (inaccessible to JavaScript, so it can't be
  read by an XSS payload), `sameSite: "lax"` (not sent on cross-site
  requests that aren't a top-level GET navigation), and `secure` in
  production (HTTPS only).
- Sessions last 30 days with sliding renewal: once fewer than 15 days
  remain, the next request silently renews it another 30 days, so an
  active user is never logged out mid-session, while an abandoned
  session still expires.
- `getSessionUser()` always re-validates the token against the database
  (checking expiry, and that the session row still exists) — the cookie
  is never trusted on its own. Every Server Component and API route that
  needs the current user calls this (or its throwing variant,
  `requireSessionUser()`).

Client IP is stored only as a truncated salted hash
(`hashIp`) attached to the session, never in the clear — enough to spot
abuse patterns without retaining an actual IP longer than necessary.

## Authorization: the part the spec calls out explicitly

There is no admin account, admin role, or privileged access path of any
kind — the `User` model has no `role`/`isAdmin` field, and no route
grants broader access based on who's asking. Every account, including
the one created by `npm run seed:demo` (see the root README), is an
ordinary user whose data is exactly as isolated as everyone else's.
That isolation is the actual security property this section is about:

Every budget-scoped resource is checked against the authenticated
session's `userId` on every request — not just for the top-level
resource named in the URL, but for **every other ID referenced in the
request body too**. This is the pattern:

```ts
// 1. The top-level resource named in the URL:
const budget = await requireBudgetOwnership(budgetId, session.userId);

// 2. Every OTHER id the request body references must independently be
//    verified to belong to that SAME budget — never assumed just
//    because the caller is authenticated and owns *a* budget:
await requireCategoryInBudget(input.categoryId, budgetId);
await requireAccountInBudget(input.accountId, budgetId);
```

This two-level check is the actual fix for IDOR (insecure direct object
reference): it's not enough to confirm the user owns the budget in the
URL — a transaction body could reference a `categoryId` that belongs to
a *different* budget (the attacker's own budget, or one they've somehow
learned the ID of), and without re-checking that specific ID's
`budgetId`, the app would silently let a user's transaction get
categorized against, or a split written into, data they don't own.

**Several real instances of exactly this gap were found and fixed during
development** — not hypothetical, actually reproduced with two live user
accounts and then closed:

- `updateTransaction` didn't re-validate a patched `accountId` against
  the transaction's budget, so a user could repoint their own
  transaction onto another user's account.
- Transaction and CSV-import-row category assignment didn't validate
  split `categoryId`s against the budget, so a user could inject a split
  referencing another user's category.
- Category-group and category drag-reorder endpoints didn't validate
  every ID in the reordered batch, and scoped their writes with a bare
  `updateMany` that wasn't itself filtered to the caller's budget.
- Goal and recurring-transaction creation didn't validate
  `categoryId`/`payeeId` ownership before attaching them.

The E2E security suite (`apps/web/e2e/security.spec.ts`) encodes these
as regression tests with two real registered users: cross-user budget
access (403), cross-user category injection into a transaction split
(404 — the referenced category simply doesn't exist *in that user's
budget*, so it's treated as not found rather than forbidden, which also
avoids confirming to an attacker that the ID is valid but belongs to
someone else), and cross-user account repointing (404).

`requireBudgetOwnership` and the per-entity `require*InBudget` helpers
live in `src/server/services/*` and are the one place this check is
implemented — every route handler calls into a service function that
performs it, rather than routes re-implementing the check ad hoc.

## Input validation

Every API route validates its request body against a **Zod schema**
(`src/server/validation/*`) before any of it reaches a service function.
A schema failure returns a 400 with per-field errors
(`error.flatten().fieldErrors`), never a raw exception. Where a field is
genuinely optional but a naive empty string would otherwise trip a
`.min(1)` check with a confusing generic message, the schema transforms
the empty string to `undefined` so the *service layer's* specific
business-rule error (e.g. "Choose which category this goal tracks.")
surfaces instead of Zod's generic one.

## Rate limiting

In-process, in-memory token buckets (`src/server/auth/rate-limit.ts`),
keyed by IP (`x-forwarded-for` and falling back to `x-real-ip`):

| Action | Limit |
|---|---|
| Login | 10 / 15 minutes |
| Registration | 5 / hour |
| General authenticated mutations | 120 / minute |

The `RateLimiter` interface is deliberately small and swappable — the
in-memory implementation is correct for a single Node.js instance (see
DEPLOYMENT.md), and the same interface can be backed by a shared store
(e.g. Upstash Redis) if the app is ever deployed across multiple
instances, without changing any calling code.

## CSRF and cross-origin protection

Two independent layers (`src/proxy.ts`, `src/server/auth/origin.ts`):

1. **`SameSite=Lax`** on the session cookie already stops the browser
   from attaching it to a cross-site POST/PUT/PATCH/DELETE.
2. **Origin verification**, as defense in depth: every mutating `/api/*`
   request is checked against `isSameOriginRequest`, which compares the
   `Origin` header to the app's own configured origin/host and rejects a
   mismatch with 403 — checked in edge middleware before the request
   even reaches a route handler, so a forged cross-origin request never
   gets as far as touching the database.

Edge middleware also does an *optimistic*, non-authoritative auth
redirect for page routes (bouncing a visibly logged-out visitor away
from `/dashboard` before it renders, and a logged-in visitor away from
`/login`) purely for UX — it only checks whether the session cookie is
*present*, since the Edge runtime can't reach Postgres to actually
validate it. The real authorization gate is always the
`requireSessionUser()` call inside the Server Component or API route
itself.

## SQL injection and XSS

Prisma's generated client parameterizes every query — there is no
hand-built SQL string concatenation anywhere in the app, so SQL
injection isn't a code pattern that exists to get wrong. React escapes
all rendered text by default; the app does not use `dangerouslySetInnerHTML`.

## Error handling: never leak internals

`apiError()` (`src/server/api-helpers.ts`) is the single place every API
route's catch block routes through. Known, expected error types
(unauthorized, forbidden, not found, conflict, rate-limited, validation,
and the financial engine's own invariant errors like
`SplitMismatchError`/`InsufficientFundsError`) map to their correct HTTP
status with a clear, specific, plain-English message. Anything else —
an unexpected exception, a database error — is logged in full server-side
(`console.error`) but returns only: *"Something went wrong on our end.
Your existing data is safe. Please try again."* A raw stack trace,
Prisma error code, or SQL fragment is never sent to the client.

## Privacy: ads never see financial data

The ad layer (`src/lib/ads`, `src/components/ads/ad-banner.tsx`) has no
code path that receives budget, account, transaction, or category data —
it renders independent of the financial data layer entirely. See
ARCHITECTURE.md's "Provider abstractions" section.

## Audit log

`AuditLog` (see DATABASE.md) records security- and account-relevant
actions — login, password change, data export, backup restore, account
deletion, purchases — append-only, indexed by `(userId, createdAt)` so a
user's own history can be reviewed without a table scan.

## What's out of scope today

- **HTTPS termination** is assumed to happen in front of the app (a
  platform load balancer/reverse proxy) — see DEPLOYMENT.md. The `secure`
  cookie flag is gated on `NODE_ENV === "production"`, so production
  deploys must actually be served over HTTPS or sessions won't work.
- **Multi-factor authentication** is not implemented.
- **Distributed rate limiting** — see the note above; today's in-memory
  limiter is correct for a single instance only.
