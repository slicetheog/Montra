/**
 * The Help Center's knowledge base — every article shown on /help, plus
 * everything InfoTooltip snippets elsewhere in the app pull from. Kept as
 * plain data (not JSX) so it's easy to scan, search, and extend without
 * touching page code, and so the search box on /help can filter it with
 * a single case-insensitive substring match over title+body.
 *
 * One rule for every answer here: describe what THIS app actually does
 * (real field names, real button labels), never generic budgeting advice
 * a reader could get anywhere.
 */

export interface HelpArticle {
  id: string;
  question: string;
  answer: string;
}

export interface HelpCategory {
  id: string;
  title: string;
  description: string;
  articles: HelpArticle[];
}

export const HELP_CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    description: "The big picture: what Montra does and the handful of ideas everything else builds on.",
    articles: [
      {
        id: "what-is-zbb",
        question: "What is zero-based budgeting, and how does Montra do it?",
        answer:
          "Every dollar gets a job before you spend it. Instead of tracking spending after the fact, you assign each dollar of income to a category (Groceries, Rent, Emergency Fund…) the moment it arrives, until nothing is left unassigned. Montra's whole Budget screen is built around one number: Available to Budget. It's the pool of income you haven't given a job yet. It grows when income lands in an on-budget account and shrinks every time you assign money to a category — across all time, not just this month.",
      },
      {
        id: "first-budget",
        question: "Setting up your first budget",
        answer:
          "Onboarding walks you through it: name your budget, add your accounts with their real current balances (a 'Starting Balance' transaction is created for each one — that's the one source of truth for every account balance in Montra, there's no separate stored number), and optionally set up your paycheck schedule so the Dashboard can give you a heads-up before payday. You can create more than one budget later from the budget switcher in the top bar (e.g. a personal budget and a shared one) and switch between them anytime.",
      },
      {
        id: "categories-vs-tags",
        question: "Categories vs. Tags — what's the difference?",
        answer:
          "A category is where the money is budgeted — every transaction belongs to exactly one category (or is split across a few), and categories are what Available to Budget math runs on. A tag is a free-form label for cross-category grouping that has nothing to do with budgeting math — use tags for something like 'vacation' or 'deductible' that might span groceries, gas, and lodging all at once. A transaction can carry several tags but only ever adds up in one category.",
      },
      {
        id: "on-budget-vs-tracking",
        question: "On-budget vs. off-budget (tracking) accounts",
        answer:
          "On-budget accounts (checking, savings, cash, credit cards) feed Available to Budget — income landing there is money you need to assign. Off-budget / tracking accounts (investment accounts, a mortgage you're not actively budgeting payments into, etc.) are included in Net Worth but never touch the budgeting math. Set this per account when you create it.",
      },
    ],
  },
  {
    id: "budget",
    title: "Budget",
    description: "Assigning money to categories, moving it around, and reading the numbers on each row.",
    articles: [
      {
        id: "assigned-activity-available",
        question: "What do Assigned, Activity, and Available mean on a category row?",
        answer:
          "Assigned is how much you've put into that category this month. Activity is the net of every transaction posted to it this month (spending shows as negative). Available is the money actually sitting in that category right now: last month's leftover Available, plus this month's Assigned, plus this month's Activity. A negative Available means you've spent more than you assigned — the row shows it in red so it's easy to spot before it becomes a problem.",
      },
      {
        id: "how-to-assign",
        question: "How do I assign money to a category?",
        answer:
          "Click the Assigned amount on any category row and type the new total for the month. It's a direct edit, not an add — typing 20.00 sets that category's assignment to exactly $20 for the month, however much was there before.",
      },
      {
        id: "move-money",
        question: "What does \"Move money\" do?",
        answer:
          "Moves already-assigned dollars from one category to another within the same month — useful when you over-assigned somewhere and need to cover a shortfall elsewhere without touching Available to Budget. It's logged as a paired entry (money out of one category, into the other) so the history stays auditable.",
      },
      {
        id: "negative-available-rollover",
        question: "What happens to a category's leftover (or overspent) money next month?",
        answer:
          "It rolls forward automatically. A category with $40 left over on Jan 31 starts February with $40 of Available before you assign anything new. The same is true in reverse — an overspent category carries its negative Available into the next month too, so it's still visible until you cover it.",
      },
      {
        id: "credit-card-payment-category",
        question: "Why does my credit card have its own \"Payment: <Card>\" category?",
        answer:
          "Montra auto-creates this system category for every credit card account. When you charge a purchase to the card, the purchase's own category (Groceries, say) is unaffected — but the money is automatically shifted into the card's Payment category, so by the time the statement is due, that category already holds exactly what you owe. This is what makes a credit card work like cash in a zero-based budget: the spending is budgeted for once, at purchase time, not twice.",
      },
    ],
  },
  {
    id: "accounts-transactions",
    title: "Accounts & Transactions",
    description: "Adding money in and out, splitting, transferring between accounts, and keeping the ledger accurate.",
    articles: [
      {
        id: "account-types",
        question: "What are the account types for?",
        answer:
          "Checking, Savings, and Cash are on-budget by default and count toward Available to Budget. Credit Card and Loan accounts track debt (see the Debt help section). Investment, Other Asset, and Other Liability are typically off-budget/tracking accounts, included in Net Worth only. You can flip the on-budget switch on any account if the default doesn't fit how you use it.",
      },
      {
        id: "splits",
        question: "How do split transactions work?",
        answer:
          "Every transaction has at least one split (a category + amount); most have exactly one, matching the transaction's own total. A split transaction just has more than one — say a $120 Target run split $80 to Groceries and $40 to Household. The split amounts always have to add up to the transaction total.",
      },
      {
        id: "transfers",
        question: "How do transfers between accounts work?",
        answer:
          "A transfer creates two linked transactions — one leg leaving the source account, one leg arriving in the destination account — so both account balances update correctly without counting as income or spending. Moving money from checking to a credit card to pay it off is a transfer that also automatically settles that card's Payment category (see the credit-card question above).",
      },
      {
        id: "cleared-status",
        question: "What does Cleared / Reconciled mean on a transaction?",
        answer:
          "Uncleared is the default for anything you've entered but haven't confirmed against your bank yet. Cleared means it's shown up on your bank's side too. Reconciled is set automatically on every Cleared transaction up through the statement date once you reconcile the account (see the Reconciliation help section) — reconciled transactions are the locked-in, trusted baseline for your next reconciliation.",
      },
      {
        id: "search-and-filter",
        question: "What can I search or filter transactions by?",
        answer:
          "The search box on a transaction list matches payee/memo text and dollar amounts (typing 42.50 finds a $42.50 transaction even if nothing in its text mentions that number). You can also filter by category, tag, and date range at the same time.",
      },
    ],
  },
  {
    id: "recurring",
    title: "Recurring Transactions",
    description: "Paychecks, bills, subscriptions — anything that repeats, plus one-time and installment bills.",
    articles: [
      {
        id: "recurring-basics",
        question: "What's the difference between Auto-create on and off?",
        answer:
          "With Auto-create on, Montra posts the actual transaction for you the moment a scheduled occurrence is due — you'll see it appear in the account's ledger automatically. With it off, nothing gets created for you; it's a reminder only; you still log the real transaction by hand when it happens. Toggle it per recurring series at any time from the Recurring page.",
      },
      {
        id: "one-time-bill",
        question: "How do I add a bill that only happens once?",
        answer:
          "Pick \"One-time (won't repeat)\" from the Frequency dropdown when creating a recurring transaction. It behaves like any other bill (shows up on the Recurring page, can auto-create or just remind you, counts in the Cash Flow forecast) but stops after its single due date instead of repeating.",
      },
      {
        id: "flagged-to-cancel",
        question: "What does the \"flag to cancel\" button do?",
        answer:
          "Click the Ban icon on any expense bill to mark it as a candidate to cancel — a lightweight way to flag subscriptions or bills you're reviewing (\"would I still pay for this?\"). Flagged bills get a rollup card at the top of the Recurring page showing exactly how much you'd save per month and per year if you cancelled all of them, normalized to a monthly figure even for yearly or quarterly bills.",
      },
      {
        id: "total-amount-log-payment",
        question: "What is \"Total amount to pay off\" and \"Log a payment\"?",
        answer:
          "Set a total amount on a bill when it's really an installment plan or a one-time debt you're paying off over several real payments that don't line up with a fixed schedule — a payment plan, a partial tax bill. Montra then shows a progress bar (amount paid so far vs. the total), computed from the real transactions logged against it, and a \"Log a payment\" button that records exactly one of those payments whenever you make one — regardless of whether Auto-create is on.",
      },
      {
        id: "recurring-suggestions",
        question: "Where do the \"make it recurring?\" suggestions on the Recurring page come from?",
        answer:
          "Montra scans the last 12 months of your transaction history for a fixed-price charge from the same payee and account landing on a regular cadence (weekly, biweekly, monthly, or yearly) at least 3 times, and suggests turning it into a real recurring series. Dismissing a suggestion only hides it on this device — it'll resurface if you clear your browser data, but it also stops appearing on its own once the pattern becomes (or is covered by) a real recurring series.",
      },
    ],
  },
  {
    id: "cash-flow",
    title: "Cash Flow",
    description: "The forward-looking balance forecast and pay-period breakdown.",
    articles: [
      {
        id: "what-cash-flow-shows",
        question: "What does the Cash Flow page actually show?",
        answer:
          "It projects your combined checking/savings/cash balance forward (30, 60, or 90 days, your choice) by expanding every active recurring paycheck and bill on those accounts from today's real balance. The chart shows the projected balance day by day; the callout at top flags the lowest point it expects to hit and the first date it would go negative, if any.",
      },
      {
        id: "pay-periods-explained",
        question: "What is a \"pay period\" here, and what does OK / Short mean?",
        answer:
          "Each pay period is the stretch from one projected paycheck to the next. For each one you'll see the income landing, the outflow scheduled before the next paycheck, and the ending balance. A period is marked Short if the running balance is actually projected to dip below zero at any point during it — not just if that period's own bills happen to exceed that period's own income, since a cushion carried over from an earlier period can cover a tight later one.",
      },
      {
        id: "cash-flow-is-a-forecast",
        question: "Does the Cash Flow forecast affect my real balances or Available to Budget?",
        answer:
          "No — it's a forecast only, exactly like the Dashboard's \"next paycheck\" banner. Nothing on this page changes Available to Budget or any account balance; those only ever change once a real transaction is entered. It also only knows about scheduled recurring series — a bill you always pay by hand with no recurring series behind it won't show up in the projection.",
      },
    ],
  },
  {
    id: "goals",
    title: "Goals",
    description: "Saving toward something specific, and checking that your goals actually fit your budget.",
    articles: [
      {
        id: "goal-types",
        question: "What are the four goal types?",
        answer:
          "Target Balance: save up to a fixed amount in a category, no deadline. Target Date: save a fixed amount by a specific date — Montra tells you the recommended monthly contribution to hit it. Monthly Contribution: commit to a fixed dollar amount every month, tracked against what you've actually assigned this month. Debt Payoff: tracks a linked debt account down to zero using its real balance and payment.",
      },
      {
        id: "goal-priority",
        question: "What does a goal's priority (High/Medium/Low) do?",
        answer:
          "It's a sort order plus an input to the feasibility check below — it never changes how that goal's own progress is calculated. Change it anytime from the dropdown on the goal's card.",
      },
      {
        id: "goal-feasibility",
        question: "What is the feasibility banner on the Goals page?",
        answer:
          "It only appears when your goals are asking for more than you actually have: it adds up what your Monthly Contribution and Target Date goals want per month, queues them in priority order against your real Available to Budget, and tells you exactly which goal (in priority order) is the first one that doesn't fit. Target Balance goals have no fixed monthly pace and Debt Payoff minimums are already counted as a bill elsewhere, so neither is double-counted here.",
      },
    ],
  },
  {
    id: "debt",
    title: "Debt",
    description: "Tracking what you owe, and deciding what to pay off first.",
    articles: [
      {
        id: "debt-setup",
        question: "How do I start tracking a debt?",
        answer:
          "Add (or open) a Credit Card, Loan, or Other Liability account, then click \"Set up debt tracking\" on the Debt page and enter the original balance, APR, and minimum payment. The current balance itself is never typed in separately — it's always the real sum of that account's transactions, the same source-of-truth rule every account balance follows.",
      },
      {
        id: "snowball-vs-avalanche",
        question: "Snowball vs. Avalanche — which should I use?",
        answer:
          "Both pay every debt's minimum every month, plus one shared \"extra\" amount you set, aimed at one target debt at a time — whenever a debt clears, its payment rolls onto the next target instead of coming back to you. Snowball targets the smallest balance first (faster wins, more motivating). Avalanche targets the highest interest rate first (always the same or less total interest). The Debt page runs both side by side on your real balances and rates and marks whichever one actually costs less interest for you.",
      },
    ],
  },
  {
    id: "reports-net-worth",
    title: "Reports & Net Worth",
    description: "Where your money actually went, and how your overall financial position is trending.",
    articles: [
      {
        id: "reports-breakdowns",
        question: "What do the Reports breakdowns show?",
        answer:
          "Spending by Category and Spending by Payee total up actual expense transactions over whatever date range you pick (a preset period, or a custom range). Income vs. Expense charts both side by side by month so you can see your real net cash flow over time, not just a single-month snapshot.",
      },
      {
        id: "net-worth-calc",
        question: "How is Net Worth calculated?",
        answer:
          "Net worth = total assets − total liabilities, using every account's real balance (asset accounts like checking/savings/investments minus liability accounts like credit cards/loans), on- and off-budget accounts alike. The trend chart reconstructs this at the end of each of the last 12 months directly from your transaction history, so it reflects what your accounts actually looked like at each point in time.",
      },
    ],
  },
  {
    id: "reconciliation",
    title: "Reconciliation",
    description: "Matching Montra's balance to your real bank statement.",
    articles: [
      {
        id: "why-reconcile",
        question: "Why and when should I reconcile an account?",
        answer:
          "Reconciling confirms Montra's balance for an account matches your actual bank/card statement, catching typos, missed transactions, or bank fees you forgot to enter. Do it whenever a new statement arrives, or anytime the numbers feel off. Open it from the account's page.",
      },
      {
        id: "how-reconciling-works",
        question: "What happens when I reconcile?",
        answer:
          "You enter your statement's ending balance and date. If it matches what Montra already shows, you're done. If it doesn't, Montra creates one adjustment transaction for the difference so the account balance matches exactly — so you always know there's a real, visible entry behind any correction, never a silently edited number.",
      },
    ],
  },
  {
    id: "import-backup",
    title: "Import, Export & Backup",
    description: "Bringing data in from your bank, and keeping your own copy of everything.",
    articles: [
      {
        id: "csv-import",
        question: "How does CSV import work?",
        answer:
          "From Settings → Data, choose an account and upload a CSV. Montra parses each row, tries to match an existing payee and flags likely duplicates against transactions you already have, and shows you the full preview before anything is committed — you can uncheck any row you don't want imported. Nothing touches your ledger until you click commit.",
      },
      {
        id: "backup-restore",
        question: "What's included in a backup, and how do I restore one?",
        answer:
          "A backup exports your full budget: accounts, categories, transactions, splits, tags, goals, debts, recurring series, and payees. It intentionally excludes things that are either regenerable or account-specific noise (login sessions, the audit log, purchase records, past import batches, reconciliation history, notifications). Restore it from Settings → Data by uploading the export file.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings & Account",
    description: "Currency, date format, notifications, multiple budgets, and your account.",
    articles: [
      {
        id: "currency-date-format",
        question: "Where do I change currency and date format?",
        answer:
          "Settings → General. Currency can also be set per budget when you create it (so a shared household budget and a personal one can use different currencies) — the budget's own currency takes priority over your account-level default when the two differ.",
      },
      {
        id: "notifications",
        question: "What triggers a notification?",
        answer:
          "Montra generates notifications for upcoming bills, overspending in a category, goal milestones, a recurring transaction that just posted, and reconciliation reminders. Turn them off entirely from Settings if you'd rather check the app on your own schedule — the bell icon in the header shows your unread count either way.",
      },
    ],
  },
  {
    id: "faq",
    title: "FAQ & Troubleshooting",
    description: "Quick answers to the questions that come up most.",
    articles: [
      {
        id: "why-negative-available-to-budget",
        question: "Why is Available to Budget negative?",
        answer:
          "You've assigned more, cumulatively, than the on-budget income you've actually recorded — often from assigning money in a future month ahead of when the income lands. Add the missing income transaction, or reduce an assignment, to bring it back to zero or positive.",
      },
      {
        id: "why-no-recurring-transaction-created",
        question: "Why didn't my recurring bill create a transaction on its due date?",
        answer:
          "Check that Auto-create is switched on for that series (off means reminder-only, by design) and that it's still marked Active. Bills are also only materialized when you actually load a page that reads them (there's no background job in this deployment) — opening the Recurring page or Dashboard catches up anything that's come due since your last visit.",
      },
      {
        id: "why-cash-flow-empty",
        question: "Why is my Cash Flow page empty or missing a bill?",
        answer:
          "Cash Flow only projects checking/savings/cash accounts and only from active recurring series — a bill entered as a one-off transaction with no recurring series behind it, or a bill on a credit card/loan account, won't appear there. Set it up as a recurring transaction on one of your cash accounts to include it.",
      },
      {
        id: "difference-category-vs-account",
        question: "What's the difference between a category and an account?",
        answer:
          "An account is a real place money lives (a checking account, a credit card). A category is a budget line inside your on-budget accounts collectively (Groceries, Rent). One account's balance can be spread across many categories; one category's Available reflects money from all your on-budget accounts combined.",
      },
    ],
  },
];
