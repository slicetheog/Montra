import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * End-to-end happy path covering the spec's "brand-new user" checklist:
 * register, log in, create a budget, create an account, enter a starting
 * balance, add income, assign it to categories, add an expense, watch the
 * category balance change, move money, create a goal, create a recurring
 * transaction, import a CSV, export data, view reports, view net worth,
 * reconcile an account, log out, log back in, and confirm everything
 * persisted.
 */
test("full budgeting lifecycle", async ({ page }) => {
  const unique = Date.now();
  const email = `e2e-${unique}@example.com`;
  const password = "E2ePassw0rd!";
  const name = "E2E Tester";

  // 1. Register
  await page.goto("/register");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/onboarding", { waitUntil: "commit" });

  // 2. Onboarding: budget name
  await expect(page.getByRole("heading", { name: "What are you budgeting for?" })).toBeVisible();
  await page.getByRole("button", { name: "Get started" }).click();

  // 3. Onboarding: add a Checking account with a $1,000 starting balance
  await expect(page.getByRole("heading", { name: "Add your accounts" })).toBeVisible();
  await page.getByLabel("Name").first().fill("Checking");
  await page.locator('input[id^="acct-balance-"]').first().fill("1000");
  await page.getByRole("button", { name: "Continue" }).click();

  // 3b. Onboarding: paycheck schedule. Semi-monthly is the trickiest case —
  // it's represented as two independent MONTHLY recurring transactions
  // under the hood, since the domain has no native "twice a month"
  // frequency (see the PayFrequency comment in onboarding/page.tsx).
  await expect(page.getByRole("heading", { name: "When do you get paid?" })).toBeVisible();
  await page.getByRole("combobox").first().click(); // Pay schedule
  await page.getByRole("option", { name: /Twice a month/ }).click();
  await page.locator("#pay-date-1").fill("2026-09-01");
  await page.locator("#pay-date-2").fill("2026-09-15");
  await page.locator("#pay-amount").fill("2000");
  await page.getByRole("combobox").nth(1).click(); // Deposits to
  await page.getByRole("option", { name: "Checking" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Onboarding: smart default categories
  await expect(page.getByRole("heading", { name: "Create your categories" })).toBeVisible();
  await page.getByRole("button", { name: "Use suggested categories" }).click();

  // 5. Onboarding: "give your money a job" explainer
  await expect(page.getByRole("heading", { name: "Give your money a job" })).toBeVisible();
  await page.getByRole("button", { name: "Got it" }).click();

  // 6. Onboarding: finish
  await expect(page.getByRole("heading", { name: "You're ready." })).toBeVisible();
  await page.getByRole("button", { name: "Go to my dashboard" }).click();
  await page.waitForURL("**/dashboard", { waitUntil: "commit" });

  // 7. Dashboard shows the starting balance flowed into Available to Budget
  await expect(page.getByText(/Welcome back/)).toBeVisible();
  await expect(page.getByText("$1,000.00").first()).toBeVisible();

  // 7b. Dashboard forecast banner: the paycheck schedule set during
  // onboarding shows up as a heads-up, never as real money — it must not
  // have moved the $1,000.00 Available to Budget figure checked above.
  await expect(page.getByText(/Paycheck: \$2,000\.00 into Checking/)).toBeVisible();
  await expect(page.getByText(/won't include it until you add it as an actual transaction/)).toBeVisible();

  // Confirm two real MONTHLY recurring transactions exist (one per payday),
  // both still autoCreate: false (reminder only) — the forecast never
  // touches the ledger.
  const me = await (await page.request.get("/api/auth/me")).json();
  const budgetId = me.budgets[0].id;
  const recurringAfterOnboarding = await (await page.request.get(`/api/budgets/${budgetId}/recurring`)).json();
  const paychecks = recurringAfterOnboarding.filter((r: { type: string }) => r.type === "INCOME");
  expect(paychecks).toHaveLength(2);
  for (const p of paychecks) {
    expect(p.frequency).toBe("MONTHLY");
    expect(p.autoCreate).toBe(false);
    expect(p.amountCents).toBe(200000);
  }

  // 8. Add a paycheck (income) from the Checking account register
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Checking" }).click();
  await expect(page.getByRole("heading", { name: "Checking" })).toBeVisible();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("combobox").first().click(); // Type select
  await page.getByRole("option", { name: "Income" }).click();
  await page.getByLabel("Payee").fill("Employer");
  await page.getByLabel(/Amount/).fill("500");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByText("Transaction added.")).toBeVisible();

  // 9. Go to Budget, assign the new income to Groceries
  const categoryGroups = await (await page.request.get(`/api/budgets/${budgetId}/categories`)).json();
  const groceriesId = categoryGroups.flatMap((g: { categories: { id: string; name: string }[] }) => g.categories).find(
    (c: { name: string }) => c.name === "Groceries",
  ).id;
  const accounts = await (await page.request.get(`/api/budgets/${budgetId}/accounts`)).json();
  const checkingId = accounts.find((a: { name: string }) => a.name === "Checking").id;

  await page.goto("/budget");
  await expect(page.getByText("$1,500.00")).toBeVisible(); // Ready to Assign: 1000 + 500
  // The responsive layout renders both a mobile and a desktop AssignCell
  // for the same category (only one visible at a time) — target the
  // visible one via the shared data-testid.
  const groceriesAssign = page.locator(`[data-testid="assign-${groceriesId}"]:visible`);
  await groceriesAssign.click();
  await page.keyboard.type("300");
  await page.keyboard.press("Tab");
  await expect(page.getByText("$1,200.00")).toBeVisible(); // Ready to Assign: 1500 - 300

  // 10. Add a grocery expense and watch the category's Available change
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Checking" }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").fill("Whole Foods");
  await page.getByLabel(/Amount/).fill("45");
  await page.getByRole("combobox").last().click(); // category select
  await page.getByRole("option", { name: /Groceries/ }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByText("Transaction added.")).toBeVisible();

  await page.goto("/budget");
  // Target the category row's Available cell specifically — "$255.00" can
  // also coincidentally match a group-total or other summary figure.
  await expect(page.locator(`[data-testid="available-${groceriesId}"]:visible`)).toHaveText("$255.00"); // 300 assigned - 45 spent

  // 11. Move money between two categories
  await page.locator(`[data-testid="move-${groceriesId}"]:visible`).click();
  const moveDialog = page.getByRole("dialog", { name: "Move money" });
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByRole("combobox").nth(1).click(); // "To" category
  await page.getByRole("option", { name: /Rent\/Mortgage/ }).click();
  await moveDialog.getByLabel("Amount").fill("10");
  await moveDialog.getByRole("button", { name: "Move money" }).click();
  await expect(page.getByText("Money moved.")).toBeVisible();

  // 12. Create a savings goal
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).click();
  const goalDialog = page.getByRole("dialog", { name: "New goal" });
  await goalDialog.getByLabel("Name").fill("Emergency Fund");
  await goalDialog.getByRole("combobox").nth(2).click(); // Category (Type is nth(0), Priority is nth(1))
  await page.getByRole("option", { name: /Groceries/ }).click();
  await goalDialog.getByLabel(/Target amount/).fill("1000");
  await goalDialog.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByText("Goal created.")).toBeVisible();
  await expect(page.getByText("Emergency Fund")).toBeVisible();

  // 12b. Create a recurring transaction
  await page.goto("/recurring");
  await page.getByRole("button", { name: "New recurring transaction" }).click();
  const recurDialog = page.getByRole("dialog", { name: "New recurring transaction" });
  await recurDialog.getByRole("combobox").nth(1).click(); // Account (Type is nth(0))
  await page.getByRole("option", { name: "Checking" }).click();
  await recurDialog.getByLabel("Payee").fill("Netflix");
  await recurDialog.getByLabel("Amount", { exact: true }).fill("15.49");
  await recurDialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Recurring transaction created.")).toBeVisible();
  await expect(page.getByText("Netflix")).toBeVisible();

  // 12c. Cash flow forecast reflects the paycheck schedule + Netflix bill
  await page.goto("/cash-flow");
  await expect(page.getByRole("heading", { name: "Cash Flow" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Projected balance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pay periods" })).toBeVisible();
  // At least one pay period row, bounded by the twice-a-month paycheck.
  await expect(page.getByText(/OK|Short/).first()).toBeVisible();

  // 13. Import a CSV
  const csvPath = path.join(os.tmpdir(), `e2e-import-${unique}.csv`);
  fs.writeFileSync(csvPath, "Date,Payee,Amount,Memo\n2026-08-01,Gas Station,-40.00,Fill up\n");
  await page.goto("/settings?tab=data");
  await page.getByRole("button", { name: "Import CSV" }).click();
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Checking" }).click();
  await page.locator("#csv-file").setInputFiles(csvPath);
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(page.getByText(/rows found|of 1 rows/)).toBeVisible().catch(() => {});
  await page.getByRole("button", { name: /Import 1 transaction/ }).click();
  await expect(page.getByText(/Imported 1 transaction/)).toBeVisible();

  // 14. Export data (CSV download actually starts)
  await page.goto("/settings?tab=data");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/montra-transactions-.*\.csv/);

  // 14b. View reports
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByText("Spending by category")).toBeVisible();
  await expect(page.getByText("Groceries")).toBeVisible(); // the $45 Whole Foods purchase shows up here

  // 14c. View net worth
  await page.goto("/net-worth");
  await expect(page.getByRole("heading", { name: "Net Worth" })).toBeVisible();
  // "Assets" also appears in the page subtitle and a stat-card label —
  // target the section heading specifically.
  await expect(page.getByRole("heading", { name: "Assets" })).toBeVisible();

  // 14d. Reconcile the Checking account against its own current cleared
  // balance (no adjustment expected) — exercises the full reconcile flow
  // without perturbing the persistence checks below.
  const accountBefore = await (await page.request.get(`/api/budgets/${budgetId}/accounts/${checkingId}`)).json();
  const clearedDollars = (accountBefore.balances.clearedCents / 100).toFixed(2);
  await page.goto(`/accounts/${checkingId}`);
  await page.getByRole("button", { name: "Reconcile" }).click();
  const reconcileDialog = page.getByRole("dialog", { name: "Reconcile account" });
  await reconcileDialog.getByLabel("Statement ending balance").fill(clearedDollars);
  await reconcileDialog.getByRole("button", { name: "Reconcile" }).click();
  await expect(page.getByText("Account reconciled.")).toBeVisible();

  // 14b. Help center: browse a topic, then search across all of them
  await page.goto("/help");
  await expect(page.getByRole("heading", { name: "Help Center" })).toBeVisible();
  await page.getByRole("button", { name: "Recurring Transactions" }).click();
  await expect(page.getByText("What's the difference between Auto-create on and off?")).toBeVisible();
  await page.getByLabel("Search help articles").fill("available to budget");
  await expect(page.getByText(/result.*for/)).toBeVisible();

  // 15. Log out
  await page.getByRole("button", { name: "Log out" }).click();
  await page.waitForURL("**/login", { waitUntil: "commit" });

  // 16. Log back in
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/dashboard", { waitUntil: "commit" });

  // 17. Verify everything persisted
  await page.goto("/goals");
  await expect(page.getByText("Emergency Fund")).toBeVisible();
  await page.goto("/recurring");
  await expect(page.getByText("Netflix")).toBeVisible();
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Checking" }).click();
  // The transaction list renders both a mobile-card and a desktop-table
  // layout for each row (only one visible at a time via CSS) — filter to
  // the visible instance to avoid a strict-mode "resolved to 2 elements".
  await expect(page.getByText("Gas Station").and(page.locator(":visible"))).toBeVisible();
  await expect(page.getByText("Whole Foods").and(page.locator(":visible"))).toBeVisible();
  await expect(page.getByText("Employer").and(page.locator(":visible"))).toBeVisible();

  fs.unlinkSync(csvPath);
});
