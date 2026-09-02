import { Cents } from "./money";
import { addMonths, monthStart } from "./dates";

export type PayoffStrategy = "SNOWBALL" | "AVALANCHE";

export interface DebtStrategyInput {
  id: string;
  balanceCents: Cents;
  annualRateBps: number;
  minimumPaymentCents: Cents;
}

export interface DebtStrategyResult {
  strategy: PayoffStrategy;
  /** Debt ids in the order each one actually gets cleared. */
  order: string[];
  /** -1 if the whole set never clears within the 600-month cap. */
  totalMonths: number;
  payoffDate: Date | null;
  totalInterestCents: Cents;
  perDebt: Record<string, { months: number; payoffDate: Date | null; totalInterestCents: Cents }>;
}

const MAX_MONTHS = 600;

/**
 * Simulates paying off several debts at once on a fixed total monthly
 * budget (every debt's own minimum, plus one shared "extra" amount)
 * under snowball (smallest balance first) or avalanche (highest interest
 * rate first) ordering. Each month every debt gets its own minimum
 * payment; whatever's left over — the extra, plus the freed-up minimum
 * of any debt that clears this month — goes entirely at the current
 * target debt, cascading to the next target if that's enough to clear it
 * too. That rollover is the entire point of a "strategy": a cleared
 * debt's payment doesn't go back to you, it snowballs onto the next one.
 * (Interest math matches computeDebtPayoffProjection in goals.ts: simple
 * monthly rate = APR/12, rounded to the nearest cent each month.)
 */
export function simulateDebtPayoffStrategy(
  debts: DebtStrategyInput[],
  extraMonthlyCents: Cents,
  strategy: PayoffStrategy,
  asOf: Date,
): DebtStrategyResult {
  interface DebtState {
    balance: number;
    monthlyRate: number;
    minPayment: number;
    totalInterest: number;
    months: number;
    payoffDate: Date | null;
  }
  const state = new Map<string, DebtState>(
    debts.map((d) => [
      d.id,
      {
        balance: Math.abs(d.balanceCents),
        monthlyRate: d.annualRateBps / 10000 / 12,
        minPayment: d.minimumPaymentCents,
        totalInterest: 0,
        months: -1,
        payoffDate: null,
      },
    ]),
  );
  const order: string[] = [];
  const remaining = () => debts.filter((d) => state.get(d.id)!.balance > 0);
  const pickTarget = (): string | null => {
    const left = remaining();
    if (left.length === 0) return null;
    const sorted = [...left].sort((a, b) =>
      strategy === "SNOWBALL" ? state.get(a.id)!.balance - state.get(b.id)!.balance : b.annualRateBps - a.annualRateBps,
    );
    return sorted[0].id;
  };
  const markCleared = (id: string, month: number) => {
    const s = state.get(id)!;
    s.balance = 0;
    s.months = month;
    s.payoffDate = addMonths(monthStart(asOf), month);
    order.push(id);
  };

  let month = 0;
  while (remaining().length > 0 && month < MAX_MONTHS) {
    month += 1;
    // Plain number, not Cents, for the same reason DebtState's fields are:
    // this is internal simulation math, reassigned every iteration — only
    // the function's public inputs/outputs carry the branded type.
    let pool: number = extraMonthlyCents;

    // Every debt accrues interest and gets its own minimum payment.
    for (const d of debts) {
      const s = state.get(d.id)!;
      if (s.balance <= 0) continue;
      const interest = Math.round(s.balance * s.monthlyRate);
      s.totalInterest += interest;
      const payment = Math.min(s.minPayment, s.balance + interest);
      s.balance = s.balance + interest - payment;
      if (s.balance <= 0) {
        markCleared(d.id, month);
        pool += s.minPayment; // freed up for redirection this same month
      }
    }

    // Cascade the pool onto the current target, redirecting a cleared
    // target's own minimum to the next one, until the pool or the debts
    // run out — all within this one month.
    let targetId = pickTarget();
    while (targetId && pool > 0) {
      const s = state.get(targetId)!;
      const payment = Math.min(pool, s.balance);
      s.balance -= payment;
      pool -= payment;
      if (s.balance <= 0) {
        markCleared(targetId, month);
        pool += s.minPayment;
        targetId = pickTarget();
      } else {
        break;
      }
    }
  }

  const allCleared = remaining().length === 0;
  const perDebt: DebtStrategyResult["perDebt"] = {};
  let totalInterestCents = 0;
  for (const [id, s] of state) {
    perDebt[id] = { months: s.months, payoffDate: s.payoffDate, totalInterestCents: s.totalInterest as Cents };
    totalInterestCents += s.totalInterest;
  }

  return {
    strategy,
    order,
    totalMonths: allCleared ? month : -1,
    payoffDate: allCleared ? addMonths(monthStart(asOf), month) : null,
    totalInterestCents: totalInterestCents as Cents,
    perDebt,
  };
}
