# The financial engine

This is the part of Montra where "close enough" isn't good enough. This
document explains the two things that make the engine trustworthy: how
money is represented, and how zero-based budgeting is actually computed.
Everything here lives in `packages/domain` — pure TypeScript, no
database, no framework, fully unit tested (`packages/domain/src/__tests__`).

## Money is never a float

Every monetary amount in Montra is an integer number of cents. Never a
JavaScript `number` treated as dollars, never a decimal. `0.1 + 0.2 !==
0.3` in IEEE-754 floating point, and nothing in a budgeting app should
ever be exposed to that.

`packages/domain/src/money.ts` makes this structural, not just a
convention:

- `Cents` is a **branded type** (`number & { __brand: "Cents" }`). A
  plain `number` can't be passed where a `Cents` is expected — TypeScript
  rejects it — so a value has to go through `cents()` (which asserts it's
  a safe integer) before it can be used in any calculation.
- All arithmetic goes through `add`/`sub`/`negate`/`sum`/`mulInt`/`min`/
  `max`, each of which re-validates its inputs are integers. There is no
  path to a fractional cent silently appearing.
- **Display and parsing are the only place decimals exist**, and they're
  isolated to two functions: `toDecimalString` (formats cents as a
  locale-aware currency string — presentation only, never parsed back)
  and `parseDecimalToCents` (parses user-typed input like `"12.34"` or
  `"$1,200.50"`, throwing a loud `MoneyError` on anything ambiguous
  rather than silently rounding — a financial input error should be
  loud, not swallowed).
- `splitEvenly(total, parts)` distributes a whole-cent remainder
  one-cent-at-a-time from the front rather than letting rounding lose or
  invent a cent, so `splitEvenly(cents(100), 3)` returns `[34, 33, 33]`
  — sums exactly back to 100, always.

Cents comfortably fit in JavaScript's safe integer range (up to roughly
$90 trillion), so plain integers are the right tool here — no `BigInt`
ceremony needed for a personal finance app.

## The core identity

Two formulas are the entire zero-based budgeting model
(`packages/domain/src/budget-engine.ts`):

```
Ready to Assign   = cumulative on-budget income  −  cumulative assigned

Category Available(month) = Available(month − 1) + Assigned(month) + Activity(month)
```

**Ready to Assign** ("Available to Budget" in the UI) is the pool of
money that hasn't been given a job yet. It grows whenever income lands in
an on-budget account and shrinks whenever the user assigns money to a
category — cumulatively, across all history through the month being
viewed. Assigning in a future month still draws from today's pool, the
same behavior YNAB users would recognize as "give every dollar a job."

**Category Available** is a recurrence: each month's ending balance
equals last month's ending balance plus whatever was assigned and spent
this month. This is why overspending — and, just as importantly,
*overspending in a previous month* — correctly carries forward as a
negative balance the user has to cover, rather than silently resetting
to zero at the start of a new month. `computeAvailableSeries` walks a
category's full month-by-month history to produce this series; nothing
about "current available" is a value that gets separately stored and
risks drifting from what the ledger actually says — it's recomputed from
the ledger every time.

Both "Assigned" and "Activity" in these formulas are **ledger sums**, not
counters:

- Assigned = `sum(Assignment.amountCents)` for that category and month.
- Activity = `sum(TransactionSplit.amountCents)` for that category and
  month.

This matters because it means there is no code path where a UI action
"sets" a category's total directly — every action (assigning income,
moving money, spending, a credit-card offset) is a new signed ledger row,
and the total is always the sum of history. See DATABASE.md for the
`Assignment` and `TransactionSplit` schemas this rests on.

## Starting balances aren't special

An account's starting balance is not a stored field — it's an ordinary
`Transaction` with payee "Starting Balance," entered once when the
account is created. An account's balance is therefore always just
`sum(Transaction.amountCents)` for that account, with no separate
formula for "starting balance + everything since." One formula, no
special case, and no way for a stored starting-balance field to drift
from the transaction that represents it.

## Splits must sum to the total

A transaction with more than one category (a grocery run that's part
food, part household supplies) is split into `TransactionSplit` rows.
`assertSplitsSumToTotal` enforces that the splits sum *exactly* to the
transaction's total, throwing `SplitMismatchError` if not — checked at
the service layer on every create and update, not just in the UI, so a
malformed request can never leave the ledger in a state where a
transaction's total and its categorized breakdown disagree.

## The credit card auto-offset (the trickiest rule in the engine)

When a purchase is made on a credit card and categorized (say, $45 of
Groceries), two things need to be true at once:
1. Groceries' Available should still drop by $45 — you spent $45 of
   groceries money.
2. But that $45 didn't leave a cash account — it's now debt. The money
   that *was* in Groceries, up to $45 of it, should move into a
   "Payment: Visa" category, so it's earmarked to pay the card bill
   rather than double-counted as still spendable.

The naive implementation moves $45 out of Groceries into "Payment: Visa"
*in addition to* the ordinary $45 activity reduction from the purchase
itself — which double-subtracts and produces phantom overspending that
doesn't exist. **The fix, and the reasoning locked in as a regression
test, is that the offset is single-sided:** the purchase's own
`TransactionSplit` already reduces Groceries' Activity by $45 (ordinary
spending, same as a cash purchase); `computeCreditCardOffset` then
computes a *separate* single-sided credit that moves up to that same $45
from Groceries into "Payment: Visa" — capped at whatever Groceries
actually had available, not the full purchase amount:

```ts
computeCreditCardOffset(spendOutflowCents, categoryAvailableBeforeCents)
  = min(spendOutflowCents, max(categoryAvailableBeforeCents, 0))
```

If Groceries only had $30 available when the $45 purchase happened, only
$30 moves to the payment category — the other $15 is ordinary
overspending in Groceries (exactly like a cash overspend), not
manufactured money moved to cover a purchase that wasn't fully funded.
See the two regression tests in `budget-engine.test.ts` under "credit
card offset composes correctly with Activity" — spending exactly what
was available leaves the category at exactly $0 (not negative), and
overspending caps the earmarked amount rather than moving more than the
category had.

The move itself is recorded as an `Assignment` row with
`kind: CC_OFFSET`, linked back to the triggering `Transaction` via
`sourceTransactionId` (see DATABASE.md), so editing or deleting that
purchase can precisely reverse the offset instead of leaving orphaned
envelope math behind.

## Moving money and overspending

"Move money" between two categories is a constrained pair of
`Assignment` rows (`MOVE_FROM` / `MOVE_TO`), sharing a `pairedWithId`.
The constraint — you can't move more out of a category than it has
available — is enforced once, in `assertCanMove`, and shared by every
caller (the API today; any future client tomorrow) rather than
duplicated per call site. `InsufficientFundsError` carries the actual
numbers so the API layer can turn it into a plain-English message
("Only $220.00 available to move") instead of a raw error.

## Net worth

`computeNetWorth` is deliberately trivial: it sums account balances,
because every account's balance already carries the correct sign (assets
positive from their own transaction history, liabilities negative by the
same mechanism) — there's no asset/liability branching logic to get
wrong here, which is exactly the point of pushing sign correctness down
into how transactions are entered rather than handling it ad hoc at
reporting time.

## Goals, recurrence, reconciliation, and import matching

The same "pure function, fully unit tested, no I/O" discipline applies
to the rest of `packages/domain`:

- `goals.ts` — progress percentage, recommended monthly contribution to
  hit a target date, and debt payoff projections (given a balance, APR,
  and payment, how many months to zero and total interest paid).
- `recurrence.ts` — given a schedule (weekly/monthly/etc.) and a last
  occurrence, computes the next occurrence date; used both to surface
  "due soon" recurring transactions and to generate them.
- `reconciliation.ts` — given a statement balance and the account's
  cleared balance, computes the adjustment needed (if any) to reconcile.
- `import.ts` — CSV row parsing and duplicate-transaction detection
  (matching on date/amount/payee similarity) used by the import flow
  before anything is committed to the real ledger.

## Why this split makes the engine testable

None of the functions above take a Prisma client, a request object, or
anything from React. Every rule is `(plain data in) -> (plain data out)`,
which is why `packages/domain`'s test suite (43 tests as of this
writing) can assert exact-cent correctness for every rule without a
database — including the two credit-card regression tests that caught
the double-subtraction bug during development. The application services
in `apps/web/src/server/services` are responsible for fetching the facts
these functions need and persisting what they return; they do not
re-derive any number the engine already computed.
