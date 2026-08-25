import { describe, expect, it } from "vitest";
import { computeNextOccurrence, expandOccurrences } from "../recurrence";

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
