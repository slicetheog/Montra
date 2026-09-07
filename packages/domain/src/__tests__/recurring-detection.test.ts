import { describe, expect, it } from "vitest";
import { cents } from "../money";
import { detectRecurringCandidates, type RecurringDetectionInput } from "../recurring-detection";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function txn(overrides: Partial<RecurringDetectionInput>): RecurringDetectionInput {
  return {
    payeeId: "payee-netflix",
    payeeName: "Netflix",
    accountId: "account-1",
    amountCents: cents(1549),
    date: d("2026-01-01"),
    ...overrides,
  };
}

describe("detectRecurringCandidates", () => {
  it("flags a monthly-cadence, exact-amount pattern with enough occurrences", () => {
    const result = detectRecurringCandidates([
      txn({ date: d("2026-01-01") }),
      txn({ date: d("2026-02-01") }),
      txn({ date: d("2026-03-02") }), // 29 days later — still within the monthly band
      txn({ date: d("2026-04-01") }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ payeeId: "payee-netflix", frequency: "MONTHLY", occurrences: 4 });
  });

  it("flags a weekly-cadence pattern", () => {
    const result = detectRecurringCandidates([
      txn({ payeeId: "payee-coffee", payeeName: "Coffee Shop", amountCents: cents(500), date: d("2026-01-05") }),
      txn({ payeeId: "payee-coffee", payeeName: "Coffee Shop", amountCents: cents(500), date: d("2026-01-12") }),
      txn({ payeeId: "payee-coffee", payeeName: "Coffee Shop", amountCents: cents(500), date: d("2026-01-19") }),
    ]);
    expect(result[0]?.frequency).toBe("WEEKLY");
  });

  it("does not flag fewer than the minimum occurrences", () => {
    const result = detectRecurringCandidates([txn({ date: d("2026-01-01") }), txn({ date: d("2026-02-01") })]);
    expect(result).toHaveLength(0);
  });

  it("does not flag irregular gaps, even with enough occurrences", () => {
    const result = detectRecurringCandidates([
      txn({ date: d("2026-01-01") }),
      txn({ date: d("2026-01-15") }), // 14 days
      txn({ date: d("2026-03-01") }), // 45 days — neither gap matches the same band
    ]);
    expect(result).toHaveLength(0);
  });

  it("does not group different amounts together, even for the same payee", () => {
    const result = detectRecurringCandidates([
      txn({ date: d("2026-01-01"), amountCents: cents(1549) }),
      txn({ date: d("2026-02-01"), amountCents: cents(1599) }), // price changed — a real variable bill
      txn({ date: d("2026-03-01"), amountCents: cents(1549) }),
    ]);
    expect(result).toHaveLength(0);
  });

  it("keeps separate accounts as separate candidates", () => {
    const result = detectRecurringCandidates([
      txn({ date: d("2026-01-01"), accountId: "account-1" }),
      txn({ date: d("2026-02-01"), accountId: "account-1" }),
      txn({ date: d("2026-03-01"), accountId: "account-1" }),
      txn({ date: d("2026-01-01"), accountId: "account-2" }),
      txn({ date: d("2026-02-01"), accountId: "account-2" }),
      txn({ date: d("2026-03-01"), accountId: "account-2" }),
    ]);
    expect(result).toHaveLength(2);
  });

  it("sorts candidates by occurrence count, most first", () => {
    const result = detectRecurringCandidates([
      txn({ payeeId: "a", date: d("2026-01-01") }),
      txn({ payeeId: "a", date: d("2026-02-01") }),
      txn({ payeeId: "a", date: d("2026-03-01") }),
      txn({ payeeId: "b", date: d("2026-01-01") }),
      txn({ payeeId: "b", date: d("2026-02-01") }),
      txn({ payeeId: "b", date: d("2026-03-01") }),
      txn({ payeeId: "b", date: d("2026-04-01") }),
    ]);
    expect(result[0].payeeId).toBe("b");
    expect(result[0].occurrences).toBe(4);
  });
});
