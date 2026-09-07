import { describe, expect, it } from "vitest";
import { addMonths, isSameMonth, monthEndExclusive, monthStart } from "../dates";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

describe("monthStart (default, calendar month)", () => {
  it("normalizes to the 1st of the month", () => {
    expect(monthStart(d(2026, 8, 17)).getTime()).toBe(d(2026, 8, 1).getTime());
  });

  it("is unaffected by firstDayOfMonth when omitted or 1", () => {
    expect(monthStart(d(2026, 8, 17), 1).getTime()).toBe(d(2026, 8, 1).getTime());
  });
});

describe("monthStart (custom firstDayOfMonth)", () => {
  it("keeps a date on/after the period-start day in the same month", () => {
    // firstDayOfMonth=25: Sept 30 belongs to the period that started Sept 25.
    expect(monthStart(d(2026, 8, 30), 25).getTime()).toBe(d(2026, 8, 25).getTime());
  });

  it("rolls a date before the period-start day back into the previous month's period", () => {
    // Sept 10 belongs to the period that started Aug 25.
    expect(monthStart(d(2026, 8, 10), 25).getTime()).toBe(d(2026, 7, 25).getTime());
  });

  it("treats the period-start day itself as the start of the new period", () => {
    expect(monthStart(d(2026, 8, 25), 25).getTime()).toBe(d(2026, 8, 25).getTime());
  });

  it("clamps an out-of-range value (e.g. 31) down to 28, matching the settings validation ceiling", () => {
    expect(monthStart(d(2026, 8, 17), 31).getTime()).toBe(monthStart(d(2026, 8, 17), 28).getTime());
  });
});

describe("addMonths with a custom firstDayOfMonth", () => {
  it("advances by whole months, resetting to the configured day", () => {
    const start = monthStart(d(2026, 7, 10), 25); // Jul 25
    expect(addMonths(start, 1, 25).getTime()).toBe(d(2026, 7, 25).getTime());
  });
});

describe("monthEndExclusive with a custom firstDayOfMonth", () => {
  it("is exactly one period after the period Sept 10 actually falls in", () => {
    // Sept 10 falls in the period that started Aug 25, which ends
    // (exclusive) when the Sept 25 period begins.
    const start = monthStart(d(2026, 8, 10), 25);
    expect(start.getTime()).toBe(d(2026, 7, 25).getTime());
    expect(monthEndExclusive(d(2026, 8, 10), 25).getTime()).toBe(d(2026, 8, 25).getTime());
  });
});

describe("isSameMonth with a custom firstDayOfMonth", () => {
  it("agrees two dates are in the same period even though they're in different calendar months", () => {
    expect(isSameMonth(d(2026, 8, 30), d(2026, 9, 5), 25)).toBe(true);
  });

  it("disagrees on dates that straddle the period boundary", () => {
    expect(isSameMonth(d(2026, 8, 24), d(2026, 8, 25), 25)).toBe(false);
  });
});
