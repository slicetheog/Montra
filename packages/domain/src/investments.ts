import { add, cents, isZero, sub, type Cents } from "./money";

/**
 * Manual investment-holding tracking: the user records what they hold
 * (name/symbol, quantity, and a price they keep updated) rather than
 * pulling from a live market-data feed — this app has no such feed and no
 * bank-sync integration (see ARCHITECTURE.md). "Performance" here means
 * performance since the user last updated the price, computed from the
 * price/quantity history the app itself records (see HoldingSnapshot),
 * not a real-time quote.
 */

export interface HoldingValueInput {
  /** A share/unit count, not money — see the schema comment on Holding.quantity. */
  quantity: number;
  currentPriceCents: Cents;
  /** Total amount originally paid for this position, if known. */
  costBasisCents: Cents | null;
}

/**
 * quantity is an ordinary float (a physical count, not a currency amount),
 * so only the final result is rounded to an exact integer number of cents.
 */
export function holdingMarketValueCents(quantity: number, currentPriceCents: Cents): Cents {
  return cents(Math.round(quantity * currentPriceCents));
}

export interface HoldingGainLoss {
  marketValueCents: Cents;
  /** Null when there's no cost basis to compare against. */
  gainLossCents: Cents | null;
  /** Rounded to one decimal place, same convention as goals.ts's percentComplete. Null alongside gainLossCents, and also when the cost basis is 0 (nothing to divide by). */
  gainLossPercent: number | null;
}

export function computeHoldingGainLoss(input: HoldingValueInput): HoldingGainLoss {
  const marketValueCents = holdingMarketValueCents(input.quantity, input.currentPriceCents);
  if (input.costBasisCents == null) {
    return { marketValueCents, gainLossCents: null, gainLossPercent: null };
  }
  const gainLossCents = sub(marketValueCents, input.costBasisCents);
  const gainLossPercent = isZero(input.costBasisCents) ? null : Math.round((gainLossCents / input.costBasisCents) * 1000) / 10;
  return { marketValueCents, gainLossCents, gainLossPercent };
}

export interface PortfolioSummary {
  totalMarketValueCents: Cents;
  /** Only set when every holding provides a cost basis — a partial total would understate cost and overstate gain. */
  totalCostBasisCents: Cents | null;
  totalGainLossCents: Cents | null;
  totalGainLossPercent: number | null;
}

export function summarizePortfolio(holdings: HoldingValueInput[]): PortfolioSummary {
  const totalMarketValueCents = add(...holdings.map((h) => holdingMarketValueCents(h.quantity, h.currentPriceCents)));
  if (holdings.length === 0 || holdings.some((h) => h.costBasisCents == null)) {
    return { totalMarketValueCents, totalCostBasisCents: null, totalGainLossCents: null, totalGainLossPercent: null };
  }
  const totalCostBasisCents = add(...holdings.map((h) => h.costBasisCents as Cents));
  const totalGainLossCents = sub(totalMarketValueCents, totalCostBasisCents);
  const totalGainLossPercent = isZero(totalCostBasisCents)
    ? null
    : Math.round((totalGainLossCents / totalCostBasisCents) * 1000) / 10;
  return { totalMarketValueCents, totalCostBasisCents, totalGainLossCents, totalGainLossPercent };
}
