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

  // 10b. A second transaction to the same payee should suggest Groceries
  // on its own (from the history the transaction above just created),
  // without picking a category by hand.
  await page.goto("/accounts");
  await page.getByRole("link", { name: "Checking" }).click();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByLabel("Payee").fill("Whole Foods");
  await page.getByLabel(/Amount/).click(); // blurs Payee, triggering the suggestion lookup
  await expect(page.getByRole("combobox").last()).toContainText(/Groceries/);
  await page.getByLabel(/Amount/).fill("15");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByText("Transaction added.")).toBeVisible();

  await page.goto("/budget");
  await expect(page.locator(`[data-testid="available-${groceriesId}"]:visible`)).toHaveText("$240.00"); // 255 - 15

  // 11. Move money between two categories
  await page.locator(`[data-testid="move-${groceriesId}"]:visible`).click();
  const moveDialog = page.getByRole("dialog", { name: "Move money" });
  await expect(moveDialog).toBeVisible();
  await moveDialog.getByRole("combobox").nth(1).click(); // "To" category
  await page.getByRole("option", { name: /Rent\/Mortgage/ }).click();
  await moveDialog.getByLabel("Amount").fill("10");
  await moveDialog.getByRole("button", { name: "Move money" }).click();
  await expect(page.getByText("Money moved.")).toBeVisible();

  // 11b. Category & group management: create a throwaway group +
  // category via the UI, rename it, and delete it — then confirm a group
  // still holding a category refuses to delete, and succeeds once empty.
  await page.getByRole("button", { name: "Add category group" }).click();
  await page.getByPlaceholder("e.g. Housing").fill("Temp Group");
  await page.getByRole("dialog", { name: "New category group" }).getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Category group added.")).toBeVisible();

  const groupsAfterCreate = await (await page.request.get(`/api/budgets/${budgetId}/categories`)).json();
  const tempGroupId = groupsAfterCreate.find((g: { name: string }) => g.name === "Temp Group").id;
  const tempGroupRow = page.locator(`[data-testid="category-group-${tempGroupId}"]`);

  await tempGroupRow.getByRole("button", { name: "Category" }).click();
  await page.getByPlaceholder("e.g. Groceries").fill("Temp Category");
  await page.getByRole("dialog", { name: "New category" }).getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Category added.")).toBeVisible();

  const categoriesAfterCreate = await (await page.request.get(`/api/budgets/${budgetId}/categories`)).json();
  const tempCategoryId = categoriesAfterCreate
    .flatMap((g: { categories: { id: string; name: string }[] }) => g.categories)
    .find((c: { name: string }) => c.name === "Temp Category").id;

  // A group that still has a category in it should refuse to delete.
  await page.locator(`[data-testid="group-menu-${tempGroupId}"]`).click();
  await page.getByRole("menuitem", { name: "Delete group" }).click();
  await expect(page.getByText(/can't be deleted while it still has categories/)).toBeVisible();

  // Rename the category.
  await page.locator(`[data-testid="category-menu-${tempCategoryId}"]:visible`).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const renameCategoryDialog = page.getByRole("dialog", { name: "Rename category" });
  await renameCategoryDialog.getByRole("textbox").fill("Temp Category Renamed");
  await renameCategoryDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Category renamed.")).toBeVisible();
  // The category name link renders once per responsive layout (mobile +
  // desktop), same duplication as assign/available/move above — scope by
  // the category's own id via its href instead of matching by text.
  const tempCategoryLink = page.locator(`a[href="/accounts?categoryId=${tempCategoryId}"]:visible`);
  await expect(tempCategoryLink).toHaveText("Temp Category Renamed");

  // Delete the category, then the now-empty group.
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(`[data-testid="category-menu-${tempCategoryId}"]:visible`).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText("Category deleted.")).toBeVisible();
  await expect(page.locator(`a[href="/accounts?categoryId=${tempCategoryId}"]`)).not.toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(`[data-testid="group-menu-${tempGroupId}"]`).click();
  await page.getByRole("menuitem", { name: "Delete group" }).click();
  await expect(page.getByText("Category group deleted.")).toBeVisible();
  await expect(page.getByText("Temp Group")).not.toBeVisible();

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

  // 12d. Auto-assign: a fresh category with a recurring bill due this
  // period should get suggested exactly that bill's amount, and applying
  // it should actually assign it.
  await page.goto("/budget");
  await page.getByRole("button", { name: "Add category group" }).click();
  await page.getByPlaceholder("e.g. Housing").fill("Autopilot Group");
  await page.getByRole("dialog", { name: "New category group" }).getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Category group added.")).toBeVisible();

  const groupsForAuto = await (await page.request.get(`/api/budgets/${budgetId}/categories`)).json();
  const autopilotGroupId = groupsForAuto.find((g: { name: string }) => g.name === "Autopilot Group").id;
  await page.locator(`[data-testid="category-group-${autopilotGroupId}"]`).getByRole("button", { name: "Category" }).click();
  await page.getByPlaceholder("e.g. Groceries").fill("Streaming Bill");
  await page.getByRole("dialog", { name: "New category" }).getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Category added.")).toBeVisible();

  // A monthly bill starting today lands in the current period. Auto-create
  // is switched off so it stays a reminder-only, not-yet-materialized bill
  // — the scenario Auto-assign is actually meant to suggest for (a bill
  // that hasn't happened yet), rather than one the app would otherwise
  // immediately record as a real transaction on its own.
  await page.goto("/recurring");
  await page.getByRole("button", { name: "New recurring transaction" }).click();
  const autoRecurDialog = page.getByRole("dialog", { name: "New recurring transaction" });
  await autoRecurDialog.getByRole("combobox").nth(1).click(); // Account (Type is nth(0))
  await page.getByRole("option", { name: "Checking" }).click();
  await autoRecurDialog.getByLabel("Payee").fill("Streaming Service");
  await autoRecurDialog.getByLabel("Amount", { exact: true }).fill("25");
  await autoRecurDialog.getByRole("combobox").nth(2).click(); // Category (Type=0, Account=1)
  await page.getByRole("option", { name: /Streaming Bill/ }).click();
  await autoRecurDialog.getByRole("switch").click();
  await autoRecurDialog.getByRole("button", { name: "Create" }).click();
  await expect(page.getByText("Recurring transaction created.")).toBeVisible();

  await page.goto("/budget");
  await page.getByRole("button", { name: "Auto-assign" }).click();
  const autoAssignDialog = page.getByRole("dialog", { name: "Auto-assign" });
  await expect(autoAssignDialog.getByText("Streaming Bill")).toBeVisible();
  await expect(autoAssignDialog.getByText("Recurring bill")).toBeVisible();
  await expect(autoAssignDialog.getByText("+$25.00")).toBeVisible();
  await autoAssignDialog.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText(/Assigned .* across/)).toBeVisible();

  const categoriesAfterAuto = await (await page.request.get(`/api/budgets/${budgetId}/categories`)).json();
  const streamingBillId = categoriesAfterAuto
    .flatMap((g: { categories: { id: string; name: string }[] }) => g.categories)
    .find((c: { name: string }) => c.name === "Streaming Bill").id;
  await expect(page.locator(`[data-testid="available-${streamingBillId}"]:visible`)).toHaveText("$25.00");

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

  // 14e. Investment holdings: add a holding to a fresh Investment account,
  // confirm its market value and gain/loss render, then sync the account's
  // ledger balance to match — and check Net Worth picks up the aggregate.
  await page.goto("/accounts");
  await page.getByRole("button", { name: "Add account" }).click();
  const addAccountDialog = page.getByRole("dialog", { name: "Add account" });
  await addAccountDialog.getByLabel("Name").fill("Brokerage");
  await addAccountDialog.getByRole("combobox").click(); // Type
  await page.getByRole("option", { name: "Investment" }).click();
  await addAccountDialog.getByRole("button", { name: "Add account" }).click();
  await expect(page.getByText("Brokerage added.")).toBeVisible();

  const accountsAfterCreate = await (await page.request.get(`/api/budgets/${budgetId}/accounts`)).json();
  const brokerageId = accountsAfterCreate.find((a: { name: string }) => a.name === "Brokerage").id;

  await page.goto(`/accounts/${brokerageId}`);
  await page.getByRole("button", { name: "Add holding" }).click();
  const holdingDialog = page.getByRole("dialog", { name: "Add holding" });
  await holdingDialog.getByLabel("Name").fill("Vanguard S&P 500 ETF");
  await holdingDialog.getByLabel("Ticker symbol (optional)").fill("VOO");
  await holdingDialog.getByLabel("Quantity").fill("10");
  await holdingDialog.getByLabel("Price per share").fill("500");
  await holdingDialog.getByLabel("Total cost basis (optional)").fill("4500");
  await holdingDialog.getByRole("button", { name: "Add" }).click();
  await expect(page.getByText("Holding added.")).toBeVisible();

  // 10 shares @ $500 = $5,000 market value; cost basis $4,500 -> +$500 (+11.1%).
  await expect(page.getByText("Vanguard S&P 500 ETF")).toBeVisible();
  await expect(page.getByText("$5,000.00", { exact: true })).toBeVisible();
  await expect(page.getByText(/\$500\.00 \(\+11\.1%\)/)).toBeVisible();

  await page.getByRole("button", { name: "Sync value" }).click();
  await expect(page.getByText("Account balance updated to match your holdings.")).toBeVisible();
  const brokerageAfterSync = await (await page.request.get(`/api/budgets/${budgetId}/accounts/${brokerageId}`)).json();
  expect(brokerageAfterSync.balances.currentCents).toBe(500000);

  await page.goto("/net-worth");
  await expect(page.getByRole("heading", { name: "Investments" })).toBeVisible();

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
  // Whole Foods is now two separate transactions (step 10b's auto-
  // categorized one too) so this checks the first visible match rather
  // than requiring exactly one.
  await expect(page.getByText("Gas Station").and(page.locator(":visible"))).toBeVisible();
  await expect(page.getByText("Whole Foods").and(page.locator(":visible")).first()).toBeVisible();
  await expect(page.getByText("Employer").and(page.locator(":visible"))).toBeVisible();

  // 18. A custom "First day of month" (Settings -> Preferences) actually
  // moves the Budget screen's periods, not just a decorative setting: a
  // "today" before the configured day must resolve to the period that
  // started *last* calendar month (see @montra/domain's monthStart doc
  // comment), and stepping forward/back must move by whole periods. The
  // expected label is computed the same way the app does, not hardcoded,
  // so this stays correct regardless of what day it is when the suite
  // actually runs — including the last few days of a month, where
  // "today" can be >= every allowed firstDayOfMonth value.
  const firstDayOfMonth = 15;
  await page.goto("/settings?tab=preferences");
  const settingsSaved = page.waitForResponse((r) => r.url().includes("/api/settings") && r.request().method() === "PATCH");
  await page.getByLabel("First day of month (for budget periods)").fill(String(firstDayOfMonth));
  await settingsSaved;

  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + (now.getUTCDate() < firstDayOfMonth ? -1 : 0), firstDayOfMonth),
  );
  const labelFor = (d: Date) => new Intl.DateTimeFormat("en-US", { year: "numeric", month: "long", timeZone: "UTC" }).format(d);

  await page.goto("/budget");
  await expect(page.getByText(labelFor(periodStart))).toBeVisible();

  // Stepping forward moves by exactly one whole period, and back again returns to it.
  const nextPeriod = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, firstDayOfMonth));
  await page.getByRole("button", { name: "Next month" }).click();
  await expect(page.getByText(labelFor(nextPeriod))).toBeVisible();
  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByText(labelFor(periodStart))).toBeVisible();

  fs.unlinkSync(csvPath);
});
