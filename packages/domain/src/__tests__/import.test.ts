import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { findLikelyDuplicate } from "../import";

describe("CSV import duplicate detection", () => {
  const existing = [
    { id: "t1", date: new Date("2026-08-01"), amountCents: cents(-4599), payeeText: "SHELL OIL 12345" },
    { id: "t2", date: new Date("2026-08-10"), amountCents: cents(-1200), payeeText: "Starbucks" },
  ];

  it("flags a same-amount, nearby-date row as a likely duplicate", () => {
    const dup = findLikelyDuplicate(
      { date: new Date("2026-08-02"), amountCents: cents(-4599), payeeText: "Shell" },
      existing,
    );
    expect(dup?.id).toBe("t1");
  });

  it("does not flag a different amount even on the same day", () => {
    const dup = findLikelyDuplicate(
      { date: new Date("2026-08-01"), amountCents: cents(-4600), payeeText: "SHELL OIL 12345" },
      existing,
    );
    expect(dup).toBeNull();
  });

  it("does not flag a matching amount far outside the date window", () => {
    const dup = findLikelyDuplicate(
      { date: new Date("2026-09-15"), amountCents: cents(-4599), payeeText: "Shell" },
      existing,
    );
    expect(dup).toBeNull();
  });

  it("never silently discards a row — it only flags, callers decide", () => {
    const dup = findLikelyDuplicate(
      { date: new Date("2026-08-01"), amountCents: cents(-4599), payeeText: "Totally Different Payee" },
      existing,
    );
    // Still flagged (amount+date match is enough); payee is just a tie-breaker.
    expect(dup?.id).toBe("t1");
  });
});
