import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { computeNextOccurrence, expandOccurrences, monthlyEquivalentCents, occurrencesPerYear } from "../recurrence";

describe("computeNextOccurrence", () => {
  it("advances monthly and clamps end-of-month overflow (Jan 31 -> Feb 28)", () => {
    const next = computeNextOccurrence(new Date(Date.UTC(2026, 0, 31)), "MONTHLY");
    expect(next.getUTCFullYear()).toBe(2026);
    expect(next.getUTCMonth()).toBe(1); // February
    expect(next.getUTCDate()).toBe(28); // 2026 is not a leap year
  });

  it("advances biweekly by 14 days", () => {
    const next = computeNextOccurrence(new Date(Date.UTC(2026, 0, 1)), "BIWEEKLY");
    expect(next.toISOString()).toBe(new Date(Date.UTC(2026, 0, 15)).toISOString());
  });

  it("advances every N months", () => {
    const next = computeNextOccurrence(new Date(Date.UTC(2026, 0, 15)), "EVERY_N_MONTHS", 3);
    expect(next.getUTCMonth()).toBe(3); // April
  });

  it("advances yearly", () => {
    const next = computeNextOccurrence(new Date(Date.UTC(2026, 5, 1)), "YEARLY");
    expect(next.getUTCFullYear()).toBe(2027);
  });
});

describe("expandOccurrences", () => {
  it("generates all due monthly occurrences up to a horizon", () => {
    const dates = expandOccurrences({
      after: new Date(Date.UTC(2026, 0, 1)),
      until: new Date(Date.UTC(2026, 4, 1)),
      frequency: "MONTHLY",
    });
    expect(dates.length).toBe(4); // Feb, Mar, Apr, May 1
  });

  it("respects an end date", () => {
    const dates = expandOccurrences({
      after: new Date(Date.UTC(2026, 0, 1)),
      until: new Date(Date.UTC(2026, 11, 1)),
      frequency: "MONTHLY",
      endDate: new Date(Date.UTC(2026, 2, 15)),
    });
    expect(dates.length).toBe(2); // Feb 1, Mar 1
  });

  it("respects an occurrences limit", () => {
    const dates = expandOccurrences({
      after: new Date(Date.UTC(2026, 0, 1)),
      until: new Date(Date.UTC(2027, 0, 1)),
      frequency: "MONTHLY",
      occurrencesLimit: 3,
      occurrencesAlreadyCreated: 0,
    });
    expect(dates.length).toBe(3);
  });
});

describe("occurrencesPerYear", () => {
  it("matches the standard budgeting-spreadsheet frequency table", () => {
    expect(occurrencesPerYear("WEEKLY")).toBe(52);
    expect(occurrencesPerYear("BIWEEKLY")).toBe(26);
    expect(occurrencesPerYear("MONTHLY")).toBe(12);
    expect(occurrencesPerYear("EVERY_N_MONTHS", 3)).toBe(4); // quarterly
    expect(occurrencesPerYear("EVERY_N_MONTHS", 6)).toBe(2); // semi-annual
    expect(occurrencesPerYear("YEARLY")).toBe(1);
  });
});

describe("monthlyEquivalentCents", () => {
  it("normalizes a $600 annual bill to $50/month", () => {
    expect(monthlyEquivalentCents(cents(600_00), "YEARLY")).toBe(50_00);
  });

  it("normalizes a $300 quarterly bill to $100/month", () => {
    expect(monthlyEquivalentCents(cents(300_00), "EVERY_N_MONTHS", 3)).toBe(100_00);
  });

  it("leaves a monthly amount unchanged", () => {
    expect(monthlyEquivalentCents(cents(75_00), "MONTHLY")).toBe(75_00);
  });

  it("preserves sign for an expense (negative) amount", () => {
    expect(monthlyEquivalentCents(cents(-1200_00), "YEARLY")).toBe(-100_00);
  });
});
