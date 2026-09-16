import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { computeHoldingGainLoss, holdingMarketValueCents, summarizePortfolio } from "../investments";

describe("holdingMarketValueCents", () => {
  it("multiplies quantity by price and rounds to whole cents", () => {
    expect(holdingMarketValueCents(10, cents(15234))).toBe(152340);
  });

  it("rounds a fractional-share result to the nearest cent", () => {
    // 3.333 shares at $10.00 -> $33.33
    expect(holdingMarketValueCents(3.333, cents(1000))).toBe(3333);
  });
});

describe("computeHoldingGainLoss", () => {
  it("computes market value, gain/loss, and percent when cost basis is known", () => {
    // 10 shares bought for $1,000 total, now worth $150/share = $1,500.
    const result = computeHoldingGainLoss({ quantity: 10, currentPriceCents: cents(15000), costBasisCents: cents(100000) });
    expect(result.marketValueCents).toBe(150000);
    expect(result.gainLossCents).toBe(50000);
    expect(result.gainLossPercent).toBe(50);
  });

  it("reports a loss as a negative amount and percent", () => {
    const result = computeHoldingGainLoss({ quantity: 10, currentPriceCents: cents(8000), costBasisCents: cents(100000) });
    expect(result.gainLossCents).toBe(-20000);
    expect(result.gainLossPercent).toBe(-20);
  });

  it("returns null gain/loss when no cost basis is recorded", () => {
    const result = computeHoldingGainLoss({ quantity: 10, currentPriceCents: cents(15000), costBasisCents: null });
    expect(result.marketValueCents).toBe(150000);
    expect(result.gainLossCents).toBeNull();
    expect(result.gainLossPercent).toBeNull();
  });

  it("returns a null percent (never divides by zero) when cost basis is exactly 0", () => {
    const result = computeHoldingGainLoss({ quantity: 10, currentPriceCents: cents(15000), costBasisCents: cents(0) });
    expect(result.gainLossCents).toBe(150000);
    expect(result.gainLossPercent).toBeNull();
  });

  it("rounds the percent to one decimal place", () => {
    // $1,000 cost basis, now worth $1,033.33 -> 3.333...% -> 3.3%
    const result = computeHoldingGainLoss({ quantity: 1, currentPriceCents: cents(103333), costBasisCents: cents(100000) });
    expect(result.gainLossPercent).toBe(3.3);
  });
});

describe("summarizePortfolio", () => {
  it("sums market value across holdings and computes an aggregate gain/loss when every holding has a cost basis", () => {
    const summary = summarizePortfolio([
      { quantity: 10, currentPriceCents: cents(15000), costBasisCents: cents(100000) }, // $1,500, cost $1,000
      { quantity: 5, currentPriceCents: cents(20000), costBasisCents: cents(120000) }, // $1,000, cost $1,200
    ]);
    expect(summary.totalMarketValueCents).toBe(250000); // $2,500
    expect(summary.totalCostBasisCents).toBe(220000); // $2,200
    expect(summary.totalGainLossCents).toBe(30000); // $300
    expect(summary.totalGainLossPercent).toBeCloseTo(13.6, 1);
  });

  it("omits the aggregate cost basis/gain-loss when any holding is missing one, but still totals market value", () => {
    const summary = summarizePortfolio([
      { quantity: 10, currentPriceCents: cents(15000), costBasisCents: cents(100000) },
      { quantity: 5, currentPriceCents: cents(20000), costBasisCents: null },
    ]);
    expect(summary.totalMarketValueCents).toBe(250000);
    expect(summary.totalCostBasisCents).toBeNull();
    expect(summary.totalGainLossCents).toBeNull();
    expect(summary.totalGainLossPercent).toBeNull();
  });

  it("handles an empty portfolio", () => {
    const summary = summarizePortfolio([]);
    expect(summary.totalMarketValueCents).toBe(0);
    expect(summary.totalCostBasisCents).toBeNull();
  });
});
