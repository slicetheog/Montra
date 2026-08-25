import { describe, expect, it } from "vitest";
import { cents } from "../money";
import {
  computeDebtPayoffProjection,
  computeEstimatedCompletionDate,
  computeGoalProgress,
  computeRecommendedMonthlyContribution,
} from "../goals";

describe("goal progress", () => {
  it("computes remaining and percent complete", () => {
    // Emergency Fund: target $10,000, currently $3,250 (from the spec example).
    const progress = computeGoalProgress(cents(1000000), cents(325000));
    expect(progress.remainingCents).toBe(675000);
    expect(progress.percentComplete).toBe(32.5);
    expect(progress.isComplete).toBe(false);
  });

  it("marks complete once current meets target", () => {
    expect(computeGoalProgress(cents(1000), cents(1000)).isComplete).toBe(true);
  });
});

describe("recommended monthly contribution", () => {
  it("divides the remainder across whole months to the target date", () => {
    const rec = computeRecommendedMonthlyContribution({
      targetCents: cents(1000000),
      currentCents: cents(325000),
      targetDate: new Date(Date.UTC(2026, 11, 1)), // Dec 2026
      asOf: new Date(Date.UTC(2026, 7, 25)), // Aug 25, 2026 -> 4 months remaining
    });
    expect(rec).toBe(Math.ceil(675000 / 4));
  });

  it("recommends $0 once the goal is already met", () => {
    expect(
      computeRecommendedMonthlyContribution({
        targetCents: cents(1000),
        currentCents: cents(1000),
        targetDate: new Date(Date.UTC(2026, 11, 1)),
        asOf: new Date(Date.UTC(2026, 7, 1)),
      }),
    ).toBe(0);
  });
});

describe("estimated completion date", () => {
  it("projects forward from a fixed monthly contribution", () => {
    const date = computeEstimatedCompletionDate({
      targetCents: cents(1200),
      currentCents: cents(0),
      monthlyContributionCents: cents(300),
      asOf: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(date?.toISOString()).toBe(new Date(Date.UTC(2026, 4, 1)).toISOString());
  });

  it("returns null when the contribution can never reach the target", () => {
    expect(
      computeEstimatedCompletionDate({
        targetCents: cents(1000),
        currentCents: cents(0),
        monthlyContributionCents: cents(0),
        asOf: new Date(),
      }),
    ).toBeNull();
  });
});

describe("debt payoff projection", () => {
  it("amortizes a fixed payment against interest to zero", () => {
    const result = computeDebtPayoffProjection({
      balanceCents: cents(500000), // $5,000
      annualRateBps: 1999, // 19.99% APR
      monthlyPaymentCents: cents(20000), // $200/mo
      asOf: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(result.months).toBeGreaterThan(0);
    expect(result.totalInterestCents).toBeGreaterThan(0);
    expect(result.payoffDate).not.toBeNull();
  });

  it("reports an unpayable debt (payment below accruing interest) rather than looping forever", () => {
    const result = computeDebtPayoffProjection({
      balanceCents: cents(1000000),
      annualRateBps: 2999,
      monthlyPaymentCents: cents(100), // $1/mo, won't even cover interest
      asOf: new Date(),
    });
    expect(result.months).toBe(-1);
    expect(result.payoffDate).toBeNull();
  });

  it("handles an already-zero balance", () => {
    const result = computeDebtPayoffProjection({
      balanceCents: cents(0),
      annualRateBps: 1000,
      monthlyPaymentCents: cents(5000),
      asOf: new Date(Date.UTC(2026, 0, 1)),
    });
    expect(result.months).toBe(0);
  });
});
