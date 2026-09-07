import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { computeSpendingPace } from "../spending-pace";

describe("computeSpendingPace", () => {
  it("projects the full month linearly from spend-so-far", () => {
    const result = computeSpendingPace({
      monthToDateSpendCents: cents(300_00),
      dayOfMonth: 10,
      daysInMonth: 30,
      lastMonthSpendCents: cents(0),
    });
    expect(result.averagePerDayCents).toBe(30_00);
    expect(result.projectedFullMonthCents).toBe(900_00);
  });

  it("compares the projection against last month as a signed fraction", () => {
    const result = computeSpendingPace({
      monthToDateSpendCents: cents(300_00),
      dayOfMonth: 10,
      daysInMonth: 30,
      lastMonthSpendCents: cents(750_00),
    });
    // Projected 900 vs last month's 750 -> +20%.
    expect(result.changeVsLastMonth).toBeCloseTo(0.2, 5);
  });

  it("reports a negative change when pacing below last month", () => {
    const result = computeSpendingPace({
      monthToDateSpendCents: cents(100_00),
      dayOfMonth: 10,
      daysInMonth: 30,
      lastMonthSpendCents: cents(600_00),
    });
    // Projected 300 vs last month's 600 -> -50%.
    expect(result.changeVsLastMonth).toBeCloseTo(-0.5, 5);
  });

  it("returns null for the comparison when there's no last-month spend to compare against", () => {
    const result = computeSpendingPace({
      monthToDateSpendCents: cents(100_00),
      dayOfMonth: 5,
      daysInMonth: 30,
      lastMonthSpendCents: cents(0),
    });
    expect(result.changeVsLastMonth).toBeNull();
  });

  it("never divides by zero even if called on day 0", () => {
    const result = computeSpendingPace({
      monthToDateSpendCents: cents(0),
      dayOfMonth: 0,
      daysInMonth: 30,
      lastMonthSpendCents: cents(0),
    });
    expect(result.averagePerDayCents).toBe(0);
    expect(result.projectedFullMonthCents).toBe(0);
  });
});
