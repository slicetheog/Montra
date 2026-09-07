import type { Cents } from "./money";

export type DetectedFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";

export interface RecurringDetectionInput {
  payeeId: string;
  payeeName: string;
  accountId: string;
  amountCents: Cents;
  date: Date;
}

export interface RecurringCandidate {
  payeeId: string;
  payeeName: string;
  accountId: string;
  amountCents: Cents;
  frequency: DetectedFrequency;
  occurrences: number;
  lastDate: Date;
}

const FREQUENCY_BANDS: { frequency: DetectedFrequency; minDays: number; maxDays: number }[] = [
  { frequency: "WEEKLY", minDays: 5, maxDays: 9 },
  { frequency: "BIWEEKLY", minDays: 11, maxDays: 17 },
  { frequency: "MONTHLY", minDays: 26, maxDays: 35 },
  { frequency: "YEARLY", minDays: 355, maxDays: 375 },
];

/**
 * Groups transaction history by (payee, account, exact amount) and flags
 * any group whose consecutive gaps all fall in the same real-world
 * cadence band as a likely recurring pattern — e.g. "this $15.49 Netflix
 * charge has landed on this account every ~30 days, 4 times running."
 *
 * Exact amount match only, no tolerance band: a genuinely fixed-price
 * subscription is the safe, low-false-positive case to detect. A bill
 * that varies month to month simply won't group here at all — that's
 * the right call, since guessing at a "close enough" amount risks
 * confidently suggesting a recurring rule for something that isn't
 * actually fixed.
 */
export function detectRecurringCandidates(transactions: RecurringDetectionInput[], minOccurrences = 3): RecurringCandidate[] {
  const groups = new Map<string, RecurringDetectionInput[]>();
  for (const t of transactions) {
    const key = `${t.payeeId}:${t.accountId}:${t.amountCents}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const candidates: RecurringCandidate[] = [];
  for (const list of groups.values()) {
    if (list.length < minOccurrences) continue;
    const sorted = [...list].sort((a, b) => a.date.getTime() - b.date.getTime());
    const gapsDays: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gapsDays.push((sorted[i].date.getTime() - sorted[i - 1].date.getTime()) / 86_400_000);
    }
    const band = FREQUENCY_BANDS.find((b) => gapsDays.every((g) => g >= b.minDays && g <= b.maxDays));
    if (!band) continue;
    const last = sorted[sorted.length - 1];
    candidates.push({
      payeeId: last.payeeId,
      payeeName: last.payeeName,
      accountId: last.accountId,
      amountCents: last.amountCents,
      frequency: band.frequency,
      occurrences: sorted.length,
      lastDate: last.date,
    });
  }

  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}
