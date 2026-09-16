import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { buildBudgetSnapshotText, type BudgetSnapshotInput } from "../ai-assistant";

const base: BudgetSnapshotInput = {
  budgetName: "My Budget",
  currency: "USD",
  periodLabel: "September 2026",
  readyToAssignCents: cents(50000),
  categories: [{ name: "Groceries", assignedCents: cents(40000), activityCents: cents(-15000), availableCents: cents(25000) }],
  upcomingBills: [{ name: "Netflix", amountCents: cents(1549), dueDate: "09/20/2026" }],
  goals: [{ name: "Emergency Fund", percentComplete: 32.5 }],
  netWorthCents: cents(1000000),
};

describe("buildBudgetSnapshotText", () => {
  it("includes the budget name, period, and top-level totals", () => {
    const text = buildBudgetSnapshotText(base);
    expect(text).toContain("My Budget");
    expect(text).toContain("September 2026");
    expect(text).toContain("Ready to Assign: $500.00");
    expect(text).toContain("Net worth: $10,000.00");
  });

  it("lists each category's assigned/spent/available", () => {
    const text = buildBudgetSnapshotText(base);
    expect(text).toContain("Groceries: $400.00 / -$150.00 / $250.00");
  });

  it("lists upcoming bills with their due date", () => {
    const text = buildBudgetSnapshotText(base);
    expect(text).toContain("Netflix: $15.49 due 09/20/2026");
  });

  it("lists goals with percent complete", () => {
    const text = buildBudgetSnapshotText(base);
    expect(text).toContain("Emergency Fund: 32.5% complete");
  });

  it("says so explicitly when there are no categories, bills, or goals", () => {
    const text = buildBudgetSnapshotText({ ...base, categories: [], upcomingBills: [], goals: [] });
    expect(text).toContain("(no categories yet)");
    expect(text).toContain("(none scheduled)");
    expect(text).toContain("(no goals set)");
  });

  it("respects a non-USD currency", () => {
    const text = buildBudgetSnapshotText({ ...base, currency: "EUR" });
    expect(text).toContain("€500.00");
  });
});
