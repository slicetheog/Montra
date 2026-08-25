import { Cents, isZero, sub } from "./money";

export interface ReconciliationResult {
  /** Positive = statement shows more than we have recorded (add an income adjustment). */
  adjustmentCents: Cents;
  isBalanced: boolean;
}

/**
 * Comparing what the bank statement says against what we've recorded as
 * cleared. Any gap becomes a single "Reconciliation Adjustment" transaction
 * so the ledger — not a manually-edited balance — stays the source of truth.
 */
export function computeReconciliationAdjustment(
  statementBalanceCents: Cents,
  currentClearedBalanceCents: Cents,
): ReconciliationResult {
  const adjustment = sub(statementBalanceCents, currentClearedBalanceCents);
  return { adjustmentCents: adjustment, isBalanced: isZero(adjustment) };
}
