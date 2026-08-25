/**
 * Money — the ONLY place in Montra that is allowed to do arithmetic on
 * currency amounts.
 *
 * Rule: every dollar amount that touches the database, an API boundary, or
 * a financial calculation is an integer number of cents (a `Cents` — a
 * branded `number`). We never use JavaScript floats for money. Floats
 * (0.1 + 0.2 !== 0.3) are not safe for anything users trust with their
 * finances, so this module exists to make float contamination structurally
 * hard: everything routes through `add`/`sub`/`mul`/`sum`, which assert
 * their inputs are safe integers.
 *
 * Cents fit comfortably in JS's safe integer range (2^53-1 ≈ 9 * 10^13
 * cents ≈ $90 trillion), so plain `number` is fine here — no BigInt
 * ceremony needed for a personal budgeting app.
 *
 * Display / parsing (the only place decimals are allowed to exist) is
 * isolated to `toDecimalString` and `parseDecimalToCents`.
 */

export type Cents = number & { readonly __brand: "Cents" };

export class MoneyError extends Error {}

function assertSafeInt(n: number, label: string): asserts n is Cents {
  if (!Number.isInteger(n) || !Number.isSafeInteger(n)) {
    throw new MoneyError(`${label} must be a safe integer number of cents, got: ${n}`);
  }
}

/** Construct a Cents value from a known-integer number of cents. */
export function cents(n: number): Cents {
  assertSafeInt(n, "cents()");
  return n as Cents;
}

export const ZERO: Cents = cents(0);

export function add(...values: Cents[]): Cents {
  return cents(values.reduce((total, v) => total + assertCents(v), 0));
}

export function sub(a: Cents, b: Cents): Cents {
  return cents(assertCents(a) - assertCents(b));
}

export function negate(a: Cents): Cents {
  return cents(-assertCents(a));
}

export function sum(values: Cents[]): Cents {
  return add(...values);
}

/** Multiply cents by an integer scalar (e.g. quantity). Never a float scalar. */
export function mulInt(a: Cents, scalar: number): Cents {
  if (!Number.isInteger(scalar)) {
    throw new MoneyError(`mulInt scalar must be an integer, got: ${scalar}`);
  }
  return cents(assertCents(a) * scalar);
}

/**
 * Split `total` into `parts` whole-cent shares that sum exactly back to
 * `total`, distributing the remainder cent-by-cent from the front. Used for
 * "split this evenly across N categories" UI actions.
 */
export function splitEvenly(total: Cents, parts: number): Cents[] {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new MoneyError(`splitEvenly parts must be a positive integer, got: ${parts}`);
  }
  const base = Math.trunc(assertCents(total) / parts);
  const remainder = assertCents(total) - base * parts;
  const result: Cents[] = [];
  for (let i = 0; i < parts; i++) {
    result.push(cents(base + (i < Math.abs(remainder) ? Math.sign(remainder) : 0)));
  }
  return result;
}

export function isZero(a: Cents): boolean {
  return assertCents(a) === 0;
}

export function isNegative(a: Cents): boolean {
  return assertCents(a) < 0;
}

export function isPositive(a: Cents): boolean {
  return assertCents(a) > 0;
}

export function max(a: Cents, b: Cents): Cents {
  return assertCents(a) >= assertCents(b) ? a : b;
}

export function min(a: Cents, b: Cents): Cents {
  return assertCents(a) <= assertCents(b) ? a : b;
}

/** Clamp to >= 0, used where negative doesn't make sense (e.g. "available to move"). */
export function clampNonNegative(a: Cents): Cents {
  return max(a, ZERO);
}

function assertCents(v: Cents): number {
  if (typeof v !== "number" || !Number.isInteger(v)) {
    throw new MoneyError(`Expected a Cents value (integer), got: ${String(v)}`);
  }
  return v;
}

/**
 * Format cents as a locale-aware currency string for display.
 * This is presentation-only; never parse this string back for calculation.
 */
export function toDecimalString(
  a: Cents,
  opts: { currency?: string; locale?: string; showSign?: boolean } = {},
): string {
  const { currency = "USD", locale = "en-US", showSign = false } = opts;
  const value = assertCents(a) / 100;
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    signDisplay: showSign ? "exceptZero" : "auto",
  }).format(value);
  return formatted;
}

/**
 * Parse a user-typed decimal amount ("12.34", "-5", "$1,200.50") into
 * integer cents. Throws MoneyError on anything ambiguous rather than
 * silently rounding — financial input errors must be loud.
 */
export function parseDecimalToCents(input: string): Cents {
  const cleaned = input.trim().replace(/[$,\s]/g, "");
  if (cleaned === "" || !/^-?\d*(\.\d{1,2})?$/.test(cleaned) || cleaned === "-" || cleaned === ".") {
    throw new MoneyError(`Cannot parse "${input}" as a currency amount`);
  }
  const negative = cleaned.startsWith("-");
  const [wholePart, fractionPart = ""] = cleaned.replace("-", "").split(".");
  if (wholePart === "" && fractionPart === "") {
    throw new MoneyError(`Cannot parse "${input}" as a currency amount`);
  }
  const fraction = (fractionPart + "00").slice(0, 2);
  const magnitude = Number(wholePart) * 100 + Number(fraction);
  return cents(negative ? -magnitude : magnitude);
}
