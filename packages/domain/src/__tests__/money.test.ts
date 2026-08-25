import { describe, expect, it } from "vitest";
import {
  add,
  cents,
  isNegative,
  MoneyError,
  parseDecimalToCents,
  splitEvenly,
  sub,
  toDecimalString,
} from "../money";

describe("money", () => {
  it("never accepts non-integer cents", () => {
    expect(() => cents(1.5)).toThrow(MoneyError);
  });

  it("adds and subtracts exactly (no float drift)", () => {
    // The classic float trap: 0.1 + 0.2 !== 0.3 in JS floats. In cents it's exact.
    expect(add(cents(10), cents(20))).toBe(30);
    expect(sub(cents(100), cents(1))).toBe(99);
  });

  it("parses typed decimal amounts to exact cents", () => {
    expect(parseDecimalToCents("12.34")).toBe(1234);
    expect(parseDecimalToCents("$1,200.50")).toBe(120050);
    expect(parseDecimalToCents("-5")).toBe(-500);
    expect(parseDecimalToCents(".99")).toBe(99);
  });

  it("rejects unparsable amounts loudly rather than guessing", () => {
    expect(() => parseDecimalToCents("abc")).toThrow(MoneyError);
    expect(() => parseDecimalToCents("1.234")).toThrow(MoneyError);
  });

  it("splits evenly and the parts always sum back to the total", () => {
    const parts = splitEvenly(cents(1000), 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(parts).toEqual([334, 333, 333]);
  });

  it("splits evenly for negative totals too", () => {
    const parts = splitEvenly(cents(-1000), 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(-1000);
  });

  it("formats currency for display without affecting stored value", () => {
    expect(toDecimalString(cents(150000))).toBe("$1,500.00");
    expect(toDecimalString(cents(-500), { showSign: true })).toBe("-$5.00");
  });

  it("isNegative works for outflows", () => {
    expect(isNegative(cents(-1))).toBe(true);
    expect(isNegative(cents(0))).toBe(false);
  });
});
