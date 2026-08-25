import { Cents } from "./money";

export interface ExistingTransactionForDedup {
  id: string;
  date: Date;
  amountCents: Cents;
  payeeText: string;
}

export interface CandidateImportRow {
  date: Date;
  amountCents: Cents;
  payeeText: string;
}

const DUPLICATE_WINDOW_DAYS = 4;

export function normalizePayeeText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "");
}

/**
 * A CSV row is flagged as a likely duplicate when an existing transaction
 * on the same account has the exact same amount within a small date window
 * (banks often post a day or two off from the transaction date) — payee
 * text is compared only as a tie-breaking signal, never required to match
 * exactly, since bank CSV payee strings are inconsistently formatted.
 * We NEVER auto-skip a row on the caller's behalf; this only flags it so
 * the import preview can show the user and let them decide (spec 24: never
 * silently import obvious duplicates).
 */
export function findLikelyDuplicate(
  candidate: CandidateImportRow,
  existing: ExistingTransactionForDedup[],
): ExistingTransactionForDedup | null {
  const windowMs = DUPLICATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  let best: ExistingTransactionForDedup | null = null;
  let bestScore = -1;

  for (const tx of existing) {
    if (tx.amountCents !== candidate.amountCents) continue;
    const dayDelta = Math.abs(tx.date.getTime() - candidate.date.getTime());
    if (dayDelta > windowMs) continue;

    let score = 1; // amount + date-window match already
    if (normalizePayeeText(tx.payeeText) === normalizePayeeText(candidate.payeeText)) {
      score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = tx;
    }
  }
  return best;
}
