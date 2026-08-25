import { describe, expect, it } from "vitest";
import { cents } from "../money";
import {
  assertCanMove,
  assertSplitsSumToTotal,
  computeAvailableSeries,
  computeBudgetTotals,
  computeCreditCardOffset,
  computeNetWorth,
  computeReadyToAssign,
  InsufficientFundsError,
  SplitMismatchError,
} from "../budget-engine";

describe("Ready to Assign", () => {
  it("is income minus everything ever assigned", () => {
    expect(computeReadyToAssign(cents(500000), cents(320000))).toBe(180000);
  });

  it("goes negative if you assign more than you've earned (overassigned)", () => {
    expect(computeReadyToAssign(cents(1000), cents(1500))).toBe(-500);
  });
});

describe("month-to-month rollover", () => {
  it("carries a positive Available balance forward", () => {
    // Month 1: assign $100, spend $40 -> Available $60.
    // Month 2: assign nothing, spend $10 -> Available should be $50 (rolled over).
    const series = computeAvailableSeries([
      { assignedCents: cents(10000), activityCents: cents(-4000) },
      { assignedCents: cents(0), activityCents: cents(-1000) },
    ]);
    expect(series).toEqual([6000, 5000]);
  });

  it("carries overspending (negative Available) forward as a debt against next month", () => {
    // Month 1: assign $50, spend $80 -> Available -$30 (overspent).
    // Month 2: assign $30 to cover it, no activity -> Available back to $0.
    const series = computeAvailableSeries([
      { assignedCents: cents(5000), activityCents: cents(-8000) },
      { assignedCents: cents(3000), activityCents: cents(0) },
    ]);
    expect(series).toEqual([-3000, 0]);
  });

  it("totals sum correctly across categories", () => {
    const totals = computeBudgetTotals([
      { categoryId: "a", assignedCents: cents(10000), activityCents: cents(-2000), availableCents: cents(8000) },
      { categoryId: "b", assignedCents: cents(5000), activityCents: cents(0), availableCents: cents(5000) },
    ]);
    expect(totals).toEqual({
      totalAssignedCents: 15000,
      totalActivityCents: -2000,
      totalAvailableCents: 13000,
    });
  });
});

describe("split transactions", () => {
  it("accepts splits that sum exactly to the transaction total", () => {
    expect(() =>
      assertSplitsSumToTotal(cents(-15000), [cents(-10000), cents(-3000), cents(-2000)]),
    ).not.toThrow();
  });

  it("rejects splits that don't sum to the total (the $150 Costco example, off by a cent)", () => {
    expect(() =>
      assertSplitsSumToTotal(cents(-15000), [cents(-10000), cents(-3000), cents(-1999)]),
    ).toThrow(SplitMismatchError);
  });
});

describe("credit card auto-offset", () => {
  it("moves the full purchase amount when the category has enough available", () => {
    // $500 available in Groceries, $80 spent on the card.
    expect(computeCreditCardOffset(cents(8000), cents(50000))).toBe(8000);
  });

  it("caps the move at what was actually available (no negative-available creation)", () => {
    // Only $30 available, but $80 spent -> only $30 moves; the rest is
    // plain overspending in the category, same as a cash overspend.
    expect(computeCreditCardOffset(cents(8000), cents(3000))).toBe(3000);
  });

  it("moves nothing if the category was already overspent", () => {
    expect(computeCreditCardOffset(cents(8000), cents(-2000))).toBe(0);
  });
});

describe("move money", () => {
  it("allows moving up to what's available", () => {
    expect(() => assertCanMove(cents(5000), cents(5000))).not.toThrow();
  });

  it("refuses to move more than a category has available", () => {
    expect(() => assertCanMove(cents(5000), cents(5001))).toThrow(InsufficientFundsError);
  });
});

describe("net worth", () => {
  it("sums signed account balances (assets positive, liabilities negative)", () => {
    // Checking $2,000 + Savings $10,000 + Credit card -$1,500 + Auto loan -$8,000
    const netWorth = computeNetWorth([cents(200000), cents(1000000), cents(-150000), cents(-800000)]);
    expect(netWorth).toBe(250000);
  });
});
