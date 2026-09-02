import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { computeDebtPayoffProjection } from "../goals";
import { simulateDebtPayoffStrategy } from "../debt-strategy";
import type { DebtStrategyInput } from "../debt-strategy";

const ASOF = new Date(Date.UTC(2026, 0, 1)); // Jan 2026

describe("simulateDebtPayoffStrategy", () => {
  const debts: DebtStrategyInput[] = [
    // Small balance, low rate.
    { id: "card-a", balanceCents: cents(50000), annualRateBps: 1200, minimumPaymentCents: cents(2500) },
    // Larger balance, high rate.
    { id: "card-b", balanceCents: cents(200000), annualRateBps: 2400, minimumPaymentCents: cents(4000) },
  ];

  it("snowball attacks the smallest balance first regardless of rate", () => {
    const result = simulateDebtPayoffStrategy(debts, cents(10000), "SNOWBALL", ASOF);
    expect(result.order[0]).toBe("card-a");
  });

  it("avalanche attacks the highest rate first regardless of balance", () => {
    const result = simulateDebtPayoffStrategy(debts, cents(10000), "AVALANCHE", ASOF);
    expect(result.order[0]).toBe("card-b");
  });

  it("rolls a cleared debt's minimum payment onto the next target (payoff is faster than minimums alone)", () => {
    const withExtra = simulateDebtPayoffStrategy(debts, cents(10000), "SNOWBALL", ASOF);
    const minimumsOnly = simulateDebtPayoffStrategy(debts, cents(0), "SNOWBALL", ASOF);
    expect(withExtra.totalMonths).toBeGreaterThan(0);
    expect(minimumsOnly.totalMonths).toBeGreaterThan(0);
    expect(withExtra.totalMonths).toBeLessThan(minimumsOnly.totalMonths);
  });

  it("clears every debt (order has one entry per debt, no duplicates)", () => {
    const result = simulateDebtPayoffStrategy(debts, cents(10000), "SNOWBALL", ASOF);
    expect(result.order).toHaveLength(debts.length);
    expect(new Set(result.order).size).toBe(debts.length);
    expect(result.totalMonths).toBeGreaterThan(0);
    expect(result.payoffDate).not.toBeNull();
  });

  it("matches the single-debt projection when there's only one debt", () => {
    const single: DebtStrategyInput[] = [debts[0]];
    const strategyResult = simulateDebtPayoffStrategy(single, cents(0), "SNOWBALL", ASOF);
    const projection = computeDebtPayoffProjectionFromGoals(single[0], ASOF);
    expect(strategyResult.totalMonths).toBe(projection.months);
    expect(strategyResult.totalInterestCents).toBe(projection.totalInterestCents);
  });

  it("cascades a large extra payment onto multiple debts within the same month", () => {
    // Extra alone (before minimums) is more than enough to clear the small
    // debt outright in month 1 and immediately redirect into the next.
    const result = simulateDebtPayoffStrategy(debts, cents(1000000), "SNOWBALL", ASOF);
    expect(result.order).toContain("card-a");
    expect(result.totalMonths).toBeLessThanOrEqual(2);
  });

  it("returns immediately, cleanly, for an empty debt list", () => {
    const result = simulateDebtPayoffStrategy([], cents(10000), "SNOWBALL", ASOF);
    expect(result.order).toEqual([]);
    expect(result.totalMonths).toBe(0);
  });

  it("sums per-debt interest into the total", () => {
    const result = simulateDebtPayoffStrategy(debts, cents(10000), "AVALANCHE", ASOF);
    const summed = Object.values(result.perDebt).reduce((sum, d) => sum + d.totalInterestCents, 0);
    expect(result.totalInterestCents).toBe(summed);
  });
});

// A minimal stand-in for the goals.ts helper (avoids importing across
// domain files just for one comparison test) that mirrors its exact math.
function computeDebtPayoffProjectionFromGoals(debt: DebtStrategyInput, asOf: Date) {
  return computeDebtPayoffProjection({
    balanceCents: debt.balanceCents,
    annualRateBps: debt.annualRateBps,
    monthlyPaymentCents: debt.minimumPaymentCents,
    asOf,
  });
}
