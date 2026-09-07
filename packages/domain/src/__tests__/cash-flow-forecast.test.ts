import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { projectCashFlow, type ForecastSeriesInput } from "../cash-flow-forecast";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function series(overrides: Partial<ForecastSeriesInput>): ForecastSeriesInput {
  return {
    id: "series-1",
    label: "Test series",
    type: "EXPENSE",
    amountCents: cents(-1000),
    frequency: "MONTHLY",
    intervalCount: 1,
    nextOccurrenceDate: d("2026-01-15"),
    ...overrides,
  };
}

describe("projectCashFlow", () => {
  it("walks a running balance day by day across the horizon", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(50_00),
      asOf: d("2026-01-01"),
      horizonDays: 30,
      series: [series({ nextOccurrenceDate: d("2026-01-10"), amountCents: cents(-20_00) })],
    });

    expect(result.days).toHaveLength(31); // day 0 through day 30 inclusive
    const day10 = result.days.find((day) => day.date.getTime() === d("2026-01-10").getTime())!;
    expect(day10.balanceCents).toBe(30_00);
    const dayBefore = result.days.find((day) => day.date.getTime() === d("2026-01-09").getTime())!;
    expect(dayBefore.balanceCents).toBe(50_00);
  });

  it("flags the first date the balance goes negative", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(10_00),
      asOf: d("2026-01-01"),
      horizonDays: 30,
      series: [series({ nextOccurrenceDate: d("2026-01-05"), amountCents: cents(-25_00) })],
    });

    expect(result.firstNegativeDate?.getTime()).toBe(d("2026-01-05").getTime());
    expect(result.lowestBalanceCents).toBe(-15_00);
    expect(result.lowestBalanceDate.getTime()).toBe(d("2026-01-05").getTime());
  });

  it("starts negative immediately if the starting balance already is", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(-5_00),
      asOf: d("2026-01-01"),
      horizonDays: 10,
      series: [],
    });
    expect(result.firstNegativeDate?.getTime()).toBe(d("2026-01-01").getTime());
  });

  it("expands a recurring series past its first occurrence using its own frequency", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(0),
      asOf: d("2026-01-01"),
      horizonDays: 40,
      series: [series({ frequency: "BIWEEKLY", nextOccurrenceDate: d("2026-01-05"), amountCents: cents(-10_00) })],
    });
    const hits = result.days.filter((day) => day.events.length > 0).map((day) => day.date.getTime());
    expect(hits).toEqual([d("2026-01-05").getTime(), d("2026-01-19").getTime(), d("2026-02-02").getTime()]);
  });

  it("respects occurrencesLimit for a one-time bill (no repeat beyond the single occurrence)", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(0),
      asOf: d("2026-01-01"),
      horizonDays: 90,
      series: [
        series({
          frequency: "MONTHLY",
          nextOccurrenceDate: d("2026-01-15"),
          occurrencesLimit: 1,
          occurrencesAlreadyCreated: 0,
          amountCents: cents(-50_00),
        }),
      ],
    });
    const hits = result.days.filter((day) => day.events.length > 0);
    expect(hits).toHaveLength(1);
    expect(hits[0].date.getTime()).toBe(d("2026-01-15").getTime());
  });

  it("splits the horizon into pay periods bounded by paychecks, carrying the real balance forward", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(100_00),
      asOf: d("2026-01-01"),
      horizonDays: 30,
      series: [
        series({ id: "paycheck-1", type: "INCOME", frequency: "BIWEEKLY", nextOccurrenceDate: d("2026-01-15"), amountCents: cents(200_00) }),
        series({ id: "bill-1", type: "EXPENSE", frequency: "MONTHLY", nextOccurrenceDate: d("2026-01-05"), amountCents: cents(-50_00) }),
      ],
    });

    // Period 0: Jan 1 -> Jan 14 (day before the first paycheck).
    expect(result.payPeriods[0].startDate.getTime()).toBe(d("2026-01-01").getTime());
    expect(result.payPeriods[0].endDate.getTime()).toBe(d("2026-01-14").getTime());
    expect(result.payPeriods[0].startingBalanceCents).toBe(100_00);
    expect(result.payPeriods[0].outflowCents).toBe(-50_00);
    expect(result.payPeriods[0].endingBalanceCents).toBe(50_00);
    expect(result.payPeriods[0].isShort).toBe(false);

    // Period 1 starts the day the paycheck lands.
    expect(result.payPeriods[1].startDate.getTime()).toBe(d("2026-01-15").getTime());
    expect(result.payPeriods[1].startingBalanceCents).toBe(50_00);
    expect(result.payPeriods[1].incomeCents).toBe(200_00);
  });

  it("flags a pay period short only when the real running balance actually dips negative in it", () => {
    const result = projectCashFlow({
      startingBalanceCents: cents(10_00),
      asOf: d("2026-01-01"),
      horizonDays: 20,
      series: [
        series({ id: "paycheck-1", type: "INCOME", frequency: "MONTHLY", nextOccurrenceDate: d("2026-01-10"), amountCents: cents(500_00) }),
        series({ id: "bill-1", type: "EXPENSE", frequency: "MONTHLY", nextOccurrenceDate: d("2026-01-03"), amountCents: cents(-30_00) }),
      ],
    });
    expect(result.payPeriods[0].isShort).toBe(true);
    expect(result.payPeriods[0].lowestBalanceCents).toBe(-20_00);
    // The second period never dips below its (much larger) opening balance.
    expect(result.payPeriods[1].isShort).toBe(false);
  });
});
