import { describe, expect, it } from "vitest";
import { add, cents } from "../money";
import { computeReconciliationAdjustment } from "../reconciliation";

describe("computeReconciliationAdjustment", () => {
  it("reports balanced with a zero adjustment when the statement matches", () => {
    const result = computeReconciliationAdjustment(cents(150000), cents(150000));
    expect(result.isBalanced).toBe(true);
    expect(result.adjustmentCents).toBe(0);
  });

  it("returns a positive adjustment when the statement shows more than we recorded", () => {
    // e.g. a bank fee refund landed but was never entered — statement is ahead.
    const result = computeReconciliationAdjustment(cents(10500), cents(10000));
    expect(result.isBalanced).toBe(false);
    expect(result.adjustmentCents).toBe(500);
  });

  it("returns a negative adjustment when we've recorded more than the statement shows", () => {
    // e.g. a pending charge was entered but hasn't cleared yet.
    const result = computeReconciliationAdjustment(cents(10000), cents(10500));
    expect(result.isBalanced).toBe(false);
    expect(result.adjustmentCents).toBe(-500);
  });

  it("handles negative balances (an overdrawn or credit-card account) the same way", () => {
    const result = computeReconciliationAdjustment(cents(-2000), cents(-2500));
    expect(result.isBalanced).toBe(false);
    expect(result.adjustmentCents).toBe(500);
  });

  it("treats zero vs. zero as balanced", () => {
    const result = computeReconciliationAdjustment(cents(0), cents(0));
    expect(result.isBalanced).toBe(true);
    expect(result.adjustmentCents).toBe(0);
  });

  it("never drifts on float-trap amounts (0.1 + 0.2 territory)", () => {
    // 30 cents vs. 10 + 20 cents recorded separately — exact in integer cents.
    const result = computeReconciliationAdjustment(cents(30), add(cents(10), cents(20)));
    expect(result.isBalanced).toBe(true);
    expect(result.adjustmentCents).toBe(0);
  });
});
