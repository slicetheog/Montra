# API reference

All routes live under `apps/web/src/app/api/**/route.ts` (Next.js Route
Handlers). Every route below except `/api/auth/register` and
`/api/auth/login` requires an authenticated session (the
`montra_session` cookie — see SECURITY.md). Every route under
`/api/budgets/[budgetId]/*` additionally requires that the authenticated
user own `budgetId`, and independently validates any other resource ID
in the request body against that same budget — see SECURITY.md's
Authorization section.

**Conventions:**
- All request/response bodies are JSON.
- All monetary fields are integer cents (`amountCents`, never a decimal)
  — see FINANCIAL_ENGINE.md.
- Errors are `{ "error": "plain-English message" }` with an appropriate
  status code; validation errors additionally include
  `{ "fields": { "fieldName": ["message"] } }`. See SECURITY.md's Error
  handling section for the full mapping.
- Mutating requests (`POST`/`PATCH`/`PUT`/`DELETE`) are rejected with 403
  if their `Origin` header doesn't match the app's own origin (CSRF
  defense — see SECURITY.md).

## Auth

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/auth/register` | Create an account. Rate-limited 5/hour/IP. Enforces password strength server-side. |
| `POST` | `/api/auth/login` | Rate-limited 10/15min/IP. Returns the same error for "no such email" and "wrong password" (no user enumeration). |
| `POST` | `/api/auth/logout` | Destroys the current session. |
| `GET` | `/api/auth/me` | The current user, their settings, entitlement (`adsRemoved`), and their budgets. The primary "who am I / what do I have" call the UI hydrates from. |
| `POST` | `/api/auth/change-password` | Requires the current password. Invalidates every other session. |

## Account & profile

| Method | Path | Notes |
|---|---|---|
| `PATCH` | `/api/profile` | Update name/email. |
| `PATCH` | `/api/settings` | Currency, date format, first-day-of-month, theme, notification toggle. |
| `DELETE` | `/api/account` | Deletes the user and everything under them (cascades — see DATABASE.md). Requires password confirmation. |

## Budgets

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/budgets` | List the user's budgets / create one. |
| `GET` / `PATCH` / `DELETE` | `/api/budgets/[budgetId]` | Rename, archive, or delete a budget. |
| `POST` | `/api/budgets/[budgetId]/seed-defaults` | Populates the onboarding "smart default categories" set. |
| `GET` | `/api/budgets/[budgetId]/dashboard` | Aggregated figures for the dashboard (Ready to Assign, this month's totals, upcoming recurring, goal progress) in one call. |

## Categories

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` / `PATCH` | `/api/budgets/[budgetId]/categories` | List (grouped), create, or **reorder** (`PATCH` with a full ordered list) categories. |
| `PATCH` | `/api/budgets/[budgetId]/categories/[categoryId]` | Rename, move to a different group, or archive. |
| `POST` / `PATCH` | `/api/budgets/[budgetId]/category-groups` | Create or reorder groups. |
| `PATCH` | `/api/budgets/[budgetId]/category-groups/[groupId]` | Rename or archive a group. |

## The budget month (assign / move money)

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/budgets/[budgetId]/months/[month]` | `month` is `YYYY-MM`. Returns Ready to Assign and every category's Assigned/Activity/Available for that month — see FINANCIAL_ENGINE.md for how these are computed. |
| `POST` | `/api/budgets/[budgetId]/months/[month]/assign` | Assign an amount to a category (writes an `Assignment` row). |
| `POST` | `/api/budgets/[budgetId]/months/[month]/move` | Move money between two categories. Rejected with 400 if the source doesn't have enough available (`InsufficientFundsError`). |

## Accounts

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/budgets/[budgetId]/accounts` | List or create. Creating with a nonzero starting balance also creates the "Starting Balance" transaction (see FINANCIAL_ENGINE.md). |
| `GET` / `PATCH` / `DELETE` | `/api/budgets/[budgetId]/accounts/[accountId]` | Fetch (with balance), rename/edit, or close. |
| `PUT` | `/api/budgets/[budgetId]/accounts/[accountId]/debt` | Set/update interest rate and minimum payment for a credit card or loan account. |
| `GET` / `POST` | `/api/budgets/[budgetId]/accounts/[accountId]/reconcile` | Get the current cleared balance to reconcile against, or submit a statement balance and commit the adjustment. |

## Transactions

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/budgets/[budgetId]/transactions` | List (paginated, filterable by account/category/date range) or create — supports splits and transfers. |
| `GET` / `PATCH` / `DELETE` | `/api/budgets/[budgetId]/transactions/[transactionId]` | Editing a credit-card purchase's category correctly re-runs the offset calculation (see FINANCIAL_ENGINE.md). |
| `GET` | `/api/budgets/[budgetId]/export/transactions` | Streams a CSV of the budget's transactions. |

## Payees

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/budgets/[budgetId]/payees` | List, with usage stats used for entry-time suggestions. |
| `GET` / `PATCH` | `/api/budgets/[budgetId]/payees/[payeeId]` | |
| `POST` | `/api/budgets/[budgetId]/payees/merge` | Merge a duplicate payee's transactions into another and delete it. |

## Recurring transactions

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/budgets/[budgetId]/recurring` | List or create a recurring template + schedule. |
| `PATCH` / `DELETE` | `/api/budgets/[budgetId]/recurring/[recurringId]` | |

## Goals & debt

| Method | Path | Notes |
|---|---|---|
| `GET` / `POST` | `/api/budgets/[budgetId]/goals` | One of 4 types (target balance, target balance by date, monthly contribution, debt payoff) — see FINANCIAL_ENGINE.md. |
| `PATCH` / `DELETE` | `/api/budgets/[budgetId]/goals/[goalId]` | |
| `GET` | `/api/budgets/[budgetId]/debts` | Every debt account with its payoff projection. |

## Reports & net worth

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/budgets/[budgetId]/reports/spending-by-category` | Excludes credit-card payment "transfer" legs so a card purchase isn't double-counted as spending — see FINANCIAL_ENGINE.md. |
| `GET` | `/api/budgets/[budgetId]/reports/spending-by-payee` | |
| `GET` | `/api/budgets/[budgetId]/reports/income-vs-expense` | |
| `GET` | `/api/budgets/[budgetId]/reports/category-trend` | |
| `GET` | `/api/budgets/[budgetId]/net-worth` | Current net worth (sum of account balances). |
| `GET` | `/api/budgets/[budgetId]/net-worth/history` | Time series for the net worth chart. |

## Import

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/budgets/[budgetId]/import` | Upload a parsed CSV; stages rows with duplicate detection. Nothing touches the real ledger yet. |
| `GET` | `/api/budgets/[budgetId]/import/[importId]` | Preview staged rows. |
| `PATCH` | `/api/budgets/[budgetId]/import/[importId]/rows/[rowId]` | Edit a staged row (e.g. assign a category) before committing. |
| `POST` | `/api/budgets/[budgetId]/import/[importId]/commit` | Commits accepted rows as real transactions. |
| `POST` | `/api/budgets/[budgetId]/import/[importId]/cancel` | Discards the staged import. |

## Backup

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/backup` | Full JSON export of every budget the user owns. |
| `POST` | `/api/backup/restore` | Restores from a previously exported JSON backup. |

## Purchases (Remove Ads Forever)

| Method | Path | Notes |
|---|---|---|
| `POST` | `/api/purchases` | Initiates the $4.99 one-time purchase through the configured payment provider (`placeholder` or `stripe` — see DEPLOYMENT.md). |
| `POST` | `/api/purchases/restore` | Restores the `adsRemoved` entitlement on a new device for a user who already purchased — entitlement is looked up server-side by user, never trusted from the client. |
| `POST` | `/api/webhooks/stripe` | Stripe webhook receiver; verifies `STRIPE_WEBHOOK_SECRET` before trusting the event. |
