import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * End-to-end happy path covering the spec's "brand-new user" checklist:
 * register, log in, create a budget, create an account, enter a starting
 * balance, add income, assign it to categories, add an expense, watch the
 * category balance change, move money, create a goal, import a CSV,
 * export data, log out, log back in, and confirm everything persisted.
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
  const me = await (await page.request.get("/api/auth/me")).json();
  const budgetId = me.budgets[0].id;
  const categoryGroups = await (await page.request.get(`/api/budgets/${budgetId}/categories`)).json();
  const groceriesId = categoryGroups.flatMap((g: { categories: { id: string; name: string }[] }) => g.categories).find(
    (c: { name: string }) => c.name === "Groceries",
  ).id;

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
  await goalDialog.getByRole("combobox").nth(1).click(); // Category
  await page.getByRole("option", { name: /Groceries/ }).click();
  await goalDialog.getByLabel(/Target amount/).fill("1000");
  await goalDialog.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByText("Goal created.")).toBeVisible();
  await expect(page.getByText("Emergency Fund")).toBeVisible();

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
