import { describe, expect, it } from "vitest";
import { cents, ZERO } from "../money";
import { buildAutoAssignPlan, sumRecurringDue, type RecurringBillSeries } from "../auto-assign";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function bill(overrides: Partial<RecurringBillSeries>): RecurringBillSeries {
  return {
    categoryId: "cat-1",
    amountCents: cents(10_00),
    frequency: "MONTHLY",
    intervalCount: 1,
    nextOccurrenceDate: d("2026-01-15"),
    ...overrides,
  };
}

describe("sumRecurringDue", () => {
  it("counts a single monthly bill landing once in the period", () => {
    const result = sumRecurringDue([bill({})], d("2026-01-01"), d("2026-02-01"));
    expect(result.get("cat-1")).toBe(10_00);
  });

  it("excludes a bill whose next occurrence falls outside the period", () => {
    const result = sumRecurringDue([bill({ nextOccurrenceDate: d("2026-02-15") })], d("2026-01-01"), d("2026-02-01"));
    expect(result.has("cat-1")).toBe(false);
  });

  it("counts a biweekly bill twice when it lands twice in the period", () => {
    const result = sumRecurringDue(
      [bill({ frequency: "BIWEEKLY", amountCents: cents(5_00), nextOccurrenceDate: d("2026-01-02") })],
      d("2026-01-01"),
      d("2026-02-01"),
    );
    // Jan 2, Jan 16, Jan 30 all land within January -> 3 occurrences.
    expect(result.get("cat-1")).toBe(15_00);
  });

  it("sums multiple series into the same category", () => {
    const result = sumRecurringDue(
      [
        bill({ categoryId: "cat-1", amountCents: cents(10_00), nextOccurrenceDate: d("2026-01-05") }),
        bill({ categoryId: "cat-1", amountCents: cents(7_00), nextOccurrenceDate: d("2026-01-20") }),
      ],
      d("2026-01-01"),
      d("2026-02-01"),
    );
    expect(result.get("cat-1")).toBe(17_00);
  });

  it("keeps separate categories separate", () => {
    const result = sumRecurringDue(
      [bill({ categoryId: "cat-1" }), bill({ categoryId: "cat-2", amountCents: cents(20_00) })],
      d("2026-01-01"),
      d("2026-02-01"),
    );
    expect(result.get("cat-1")).toBe(10_00);
    expect(result.get("cat-2")).toBe(20_00);
  });
});

describe("buildAutoAssignPlan", () => {
  it("suggests exactly the recurring bill amount when Available is zero", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(100_00),
      categories: [
        { categoryId: "rent", currentAvailableCents: ZERO, recurringDueCents: cents(50_00), historicalAverageCents: ZERO },
      ],
    });
    expect(plan.lines).toEqual([{ categoryId: "rent", amountCents: 50_00, source: "recurring" }]);
    expect(plan.totalCents).toBe(50_00);
    expect(plan.remainingCents).toBe(50_00);
    expect(plan.wasScaledDown).toBe(false);
  });

  it("falls back to the historical average for a category with no recurring bill", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(100_00),
      categories: [
        { categoryId: "groceries", currentAvailableCents: ZERO, recurringDueCents: ZERO, historicalAverageCents: cents(30_00) },
      ],
    });
    expect(plan.lines).toEqual([{ categoryId: "groceries", amountCents: 30_00, source: "average" }]);
  });

  it("prefers the recurring amount over the average when both exist, without double counting", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(100_00),
      categories: [
        { categoryId: "internet", currentAvailableCents: ZERO, recurringDueCents: cents(60_00), historicalAverageCents: cents(58_00) },
      ],
    });
    expect(plan.lines).toEqual([{ categoryId: "internet", amountCents: 60_00, source: "recurring" }]);
  });

  it("asks for nothing when Available already covers the need", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(100_00),
      categories: [
        { categoryId: "rent", currentAvailableCents: cents(50_00), recurringDueCents: cents(50_00), historicalAverageCents: ZERO },
      ],
    });
    expect(plan.lines).toEqual([]);
    expect(plan.totalCents).toBe(0);
  });

  it("asks only for the shortfall when Available partially covers the need", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(100_00),
      categories: [
        { categoryId: "rent", currentAvailableCents: cents(20_00), recurringDueCents: cents(50_00), historicalAverageCents: ZERO },
      ],
    });
    expect(plan.lines).toEqual([{ categoryId: "rent", amountCents: 30_00, source: "recurring" }]);
  });

  it("ignores a negative Available (overspent) rather than asking for even more to cover it", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(100_00),
      categories: [
        { categoryId: "dining", currentAvailableCents: cents(-20_00), recurringDueCents: ZERO, historicalAverageCents: cents(40_00) },
      ],
    });
    // Still just the plain average -- overspending isn't compounded into the ask.
    expect(plan.lines).toEqual([{ categoryId: "dining", amountCents: 40_00, source: "average" }]);
  });

  it("scales every line down proportionally when the raw asks exceed Ready to Assign", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(60_00),
      categories: [
        { categoryId: "rent", currentAvailableCents: ZERO, recurringDueCents: cents(80_00), historicalAverageCents: ZERO },
        { categoryId: "groceries", currentAvailableCents: ZERO, recurringDueCents: ZERO, historicalAverageCents: cents(40_00) },
      ],
    });
    // Raw asks: 80 + 40 = 120, budget is 60 -> scale factor 0.5.
    expect(plan.wasScaledDown).toBe(true);
    expect(plan.totalCents).toBe(60_00);
    expect(plan.lines.find((l) => l.categoryId === "rent")?.amountCents).toBe(40_00);
    expect(plan.lines.find((l) => l.categoryId === "groceries")?.amountCents).toBe(20_00);
    expect(plan.remainingCents).toBe(0);
  });

  it("produces an empty plan when there is nothing left to assign", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: ZERO,
      categories: [
        { categoryId: "rent", currentAvailableCents: ZERO, recurringDueCents: cents(50_00), historicalAverageCents: ZERO },
      ],
    });
    expect(plan.lines).toEqual([]);
    expect(plan.remainingCents).toBe(0);
  });

  it("handles a negative Ready to Assign the same as zero", () => {
    const plan = buildAutoAssignPlan({
      readyToAssignCents: cents(-10_00),
      categories: [
        { categoryId: "rent", currentAvailableCents: ZERO, recurringDueCents: cents(50_00), historicalAverageCents: ZERO },
      ],
    });
    expect(plan.lines).toEqual([]);
  });
});
