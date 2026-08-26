#!/usr/bin/env node
/**
 * Creates (or resets) a demo account with a realistic, populated budget —
 * for anyone who wants to explore Montra without doing the onboarding
 * flow by hand. There is no admin account or role in Montra (every user's
 * data is fully isolated from every other user's — see SECURITY.md); this
 * is just a regular user account with sample data already in it.
 *
 * Deliberately drives the app's own HTTP API end to end (the same way a
 * real user, or the Playwright E2E suite, would) rather than writing
 * ledger rows straight into Postgres. The budget engine's bookkeeping
 * (Assigned/Activity/Available, the credit-card offset, account balances)
 * has enough moving parts that hand-computing "correct" rows for a seed
 * script is exactly how a demo ends up quietly wrong — going through the
 * real create/assign endpoints means every number on screen is provably
 * consistent, because it was produced by the same code a real user's
 * actions would run.
 *
 * Requires a running server (`npm run dev`, against a real Postgres).
 *
 * Usage:
 *   npm run seed:demo                # http://localhost:3000
 *   npm run seed:demo -- --reset     # delete the demo account first
 *   BASE_URL=https://staging.example.com npm run seed:demo
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const EMAIL = "demo@montra.app";
const PASSWORD = "MontraDemo2026!";
const NAME = "Demo User";
const RESET = process.argv.includes("--reset");

let cookie = "";

async function api(method, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${data?.error ?? res.statusText}`);
  }
  return data;
}

/**
 * Date for the Nth of a given calendar month, `monthsAgo` months back from
 * today — anchored to the 1st of that month and offset from there, rather
 * than a pure "N days ago" subtraction, so a run of dates for one "month"
 * of demo data can never accidentally spill across a month boundary
 * (which would show as spending in a category with no assignment in that
 * month, or an assignment with no matching activity). Clamped so nothing
 * lands in the future if `monthsAgo` is 0.
 */
function dateInMonth(monthsAgo, dayOfMonth) {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, dayOfMonth);
  if (monthsAgo === 0 && d > today) d.setDate(today.getDate());
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Seeding demo account at ${BASE_URL} ...`);

  // --- Account: register, or log in if it already exists -----------------
  try {
    await api("POST", "/api/auth/register", { name: NAME, email: EMAIL, password: PASSWORD });
    console.log(`Created ${EMAIL}`);
  } catch (err) {
    if (!String(err.message).includes("409")) throw err;
    console.log(`${EMAIL} already exists, logging in...`);
    await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });

    if (RESET) {
      console.log("Deleting existing demo account (--reset)...");
      await api("DELETE", "/api/account", { password: PASSWORD });
      await api("POST", "/api/auth/register", { name: NAME, email: EMAIL, password: PASSWORD });
      console.log(`Re-created ${EMAIL}`);
    } else {
      const me = await api("GET", "/api/auth/me");
      if (me.budgets.length > 0) {
        console.log("Demo account already has a budget — leaving it as is. Pass --reset to start over.");
        console.log(`\nLog in at ${BASE_URL}/login with:\n  email:    ${EMAIL}\n  password: ${PASSWORD}`);
        return;
      }
    }
  }

  // --- Budget + smart default categories ----------------------------------
  const budget = await api("POST", "/api/budgets", { name: "Demo Budget" });
  await api("POST", `/api/budgets/${budget.id}/seed-defaults`, {});
  const groups = await api("GET", `/api/budgets/${budget.id}/categories`);
  const categoryId = (name) => groups.flatMap((g) => g.categories).find((c) => c.name === name).id;

  // --- Accounts ------------------------------------------------------------
  const checking = await api("POST", `/api/budgets/${budget.id}/accounts`, {
    name: "Checking",
    type: "CHECKING",
    institution: "First National",
    startingBalanceCents: 320000, // $3,200.00
    startingDate: dateInMonth(3, 1),
  });
  // Just a second asset account for a realistic net worth/assets picture —
  // nothing else in this script needs to refer back to it.
  await api("POST", `/api/budgets/${budget.id}/accounts`, {
    name: "Savings",
    type: "SAVINGS",
    institution: "First National",
    startingBalanceCents: 850000, // $8,500.00
    startingDate: dateInMonth(3, 1),
  });
  const creditCard = await api("POST", `/api/budgets/${budget.id}/accounts`, {
    name: "Visa",
    type: "CREDIT_CARD",
    institution: "Chase",
    startingBalanceCents: -45000, // owe $450.00
    startingDate: dateInMonth(3, 1),
  });
  await api("PUT", `/api/budgets/${budget.id}/accounts/${creditCard.id}/debt`, {
    originalBalanceCents: 45000,
    interestRateBps: 1899, // 18.99%
    minimumPaymentCents: 2500,
    dueDayOfMonth: 15,
  });

  // --- Two months of transactions + assignments (last month first, so
  // rollover carries into the current month the way it would for a real
  // user who's been budgeting for a while). Everything is anchored to a
  // day-of-month (1-12) within each of the two months, never to a "days
  // ago" count that could drift across a month boundary depending on when
  // this script happens to run — that drift is exactly what would leave a
  // category's spending attributed to a different month than its
  // assignment, showing as bogus over/under-spending.
  const expensePlan = () => [
    { day: 2, account: checking.id, payee: "Rent Co.", amount: -140000, category: "Rent/Mortgage", cleared: "CLEARED" },
    { day: 3, account: checking.id, payee: "Utilities Co.", amount: -9500, category: "Utilities", cleared: "CLEARED" },
    { day: 3, account: checking.id, payee: "Comcast", amount: -7000, category: "Internet", cleared: "CLEARED" },
    { day: 4, account: checking.id, payee: "Whole Foods", amount: -12000, category: "Groceries", cleared: "CLEARED" },
    { day: 6, account: checking.id, payee: "Shell", amount: -4500, category: "Gas", cleared: "CLEARED" },
    { day: 8, account: checking.id, payee: "Trader Joe's", amount: -6500, category: "Groceries", cleared: "CLEARED" },
    { day: 10, account: creditCard.id, payee: "Chipotle", amount: -1850, category: "Restaurants", cleared: "UNCLEARED" },
  ];

  const assignmentPlan = () => [
    ["Rent/Mortgage", 140000],
    ["Groceries", 40000],
    ["Restaurants", 10000],
    ["Gas", 15000],
    ["Utilities", 10000],
    ["Internet", 7000],
    ["Entertainment", 5000],
    ["Emergency Fund", 30000],
  ];

  for (const monthsAgo of [1, 0]) {
    const paycheckDate = dateInMonth(monthsAgo, 1);
    await api("POST", `/api/budgets/${budget.id}/transactions`, {
      accountId: checking.id,
      date: paycheckDate,
      payeeName: "Employer Inc.",
      type: "INCOME",
      amountCents: 350000,
      cleared: "CLEARED",
      splits: [{ categoryId: null, amountCents: 350000 }],
    });

    for (const t of expensePlan()) {
      await api("POST", `/api/budgets/${budget.id}/transactions`, {
        accountId: t.account,
        date: dateInMonth(monthsAgo, t.day),
        payeeName: t.payee,
        type: "EXPENSE",
        amountCents: t.amount,
        cleared: t.cleared,
        splits: [{ categoryId: categoryId(t.category), amountCents: t.amount }],
      });
    }

    const monthKey = paycheckDate.slice(0, 7); // YYYY-MM
    for (const [name, cents] of assignmentPlan()) {
      await api("POST", `/api/budgets/${budget.id}/months/${monthKey}/assign`, {
        categoryId: categoryId(name),
        amountCents: cents,
      });
    }
  }

  // --- A goal, tied to the Emergency Fund category ------------------------
  await api("POST", `/api/budgets/${budget.id}/goals`, {
    name: "Emergency Fund",
    type: "TARGET_BALANCE",
    categoryId: categoryId("Emergency Fund"),
    targetAmountCents: 1000000, // $10,000.00
  });

  // --- A recurring subscription -------------------------------------------
  await api("POST", `/api/budgets/${budget.id}/recurring`, {
    accountId: checking.id,
    payeeName: "Netflix",
    categoryId: categoryId("Entertainment"),
    amountCents: -1549,
    type: "EXPENSE",
    frequency: "MONTHLY",
    startDate: new Date().toISOString().slice(0, 10),
    autoCreate: false, // reminder only, so it doesn't add an extra transaction on top of the numbers above
  });

  // --- Skip onboarding on next login ---------------------------------------
  await api("PATCH", "/api/settings", { completeOnboarding: true });

  console.log(`\nDone. Log in at ${BASE_URL}/login with:\n  email:    ${EMAIL}\n  password: ${PASSWORD}`);
}

main().catch((err) => {
  console.error("\nSeeding failed:", err.message);
  console.error(`Is the server running at ${BASE_URL}? Start it with \`npm run dev\` first.`);
  process.exit(1);
});
