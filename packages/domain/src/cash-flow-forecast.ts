import { add, cents, isNegative, ZERO, type Cents } from "./money";
import { expandOccurrences, type RecurrenceFrequency } from "./recurrence";

/** Same shape as TransactionType, minus TRANSFER — recurring transfers
 *  aren't supported yet (see services/recurring.ts), so a series here is
 *  always a single-account inflow or outflow. */
export type ForecastEventType = "INCOME" | "EXPENSE" | "REFUND" | "CREDIT_CARD_PAYMENT";

export interface ForecastSeriesInput {
  id: string;
  label: string;
  type: ForecastEventType;
  /** Signed, same convention as Transaction.amountCents: outflow negative, inflow positive. */
  amountCents: Cents;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  /** The series' next not-yet-materialized occurrence — same field RecurringTransaction stores. */
  nextOccurrenceDate: Date;
  endDate?: Date | null;
  occurrencesLimit?: number | null;
  occurrencesAlreadyCreated?: number;
}

export interface ForecastEvent {
  date: Date;
  seriesId: string;
  label: string;
  type: ForecastEventType;
  amountCents: Cents;
}

export interface ForecastDay {
  date: Date;
  events: ForecastEvent[];
  /** Running balance at the end of this date, after its events apply. */
  balanceCents: Cents;
}

/** One stretch of the horizon bounded by paychecks: from one paycheck's
 *  date (inclusive) up to the day before the next one (or the horizon's
 *  end, for the last period). Answers "does this paycheck cover what's
 *  due before the next one lands." */
export interface PayPeriod {
  startDate: Date;
  endDate: Date;
  incomeCents: Cents;
  /** Signed sum of every non-income event in the period (so a net-outflow period reads negative). */
  outflowCents: Cents;
  startingBalanceCents: Cents;
  endingBalanceCents: Cents;
  lowestBalanceCents: Cents;
  isShort: boolean;
}

export interface CashFlowForecast {
  startingBalanceCents: Cents;
  asOf: Date;
  horizonDays: number;
  days: ForecastDay[];
  lowestBalanceCents: Cents;
  lowestBalanceDate: Date;
  /** First date the projected balance goes negative, or null if it never does within the horizon. */
  firstNegativeDate: Date | null;
  payPeriods: PayPeriod[];
}

const DAY_MS = 86_400_000;

function atMidnightUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

function expandSeriesEvents(series: ForecastSeriesInput, until: Date): ForecastEvent[] {
  const dates: Date[] = [];
  if (series.nextOccurrenceDate.getTime() <= until.getTime()) {
    dates.push(series.nextOccurrenceDate);
  }
  const rest = expandOccurrences({
    after: series.nextOccurrenceDate,
    until,
    frequency: series.frequency,
    intervalCount: series.intervalCount,
    endDate: series.endDate ?? undefined,
    occurrencesLimit: series.occurrencesLimit ?? undefined,
    // `nextOccurrenceDate` itself hasn't been materialized yet, but by the
    // time we're expanding occurrences *after* it, it will have been — so
    // it counts toward occurrencesLimit same as occurrencesAlreadyCreated.
    occurrencesAlreadyCreated: (series.occurrencesAlreadyCreated ?? 0) + dates.length,
  });
  return [...dates, ...rest].map((date) => ({
    date,
    seriesId: series.id,
    label: series.label,
    type: series.type,
    amountCents: series.amountCents,
  }));
}

/**
 * Projects a running balance forward from `startingBalanceCents` by
 * expanding every recurring series (paychecks and bills alike) out to
 * `horizonDays` and walking day by day. Two different questions read off
 * the same walk so they can never disagree with each other: a day-by-day
 * balance line with a low-point warning ("will I ever dip negative"), and
 * a pay-period breakdown bounded by each paycheck ("does *this* paycheck
 * cover what's due before the next one").
 *
 * Pay periods intentionally do NOT reset to zero at each paycheck the way
 * a naive "paycheck minus its assigned bills" spreadsheet column would —
 * they carry the real running balance forward, so a cushion built up in
 * an earlier period correctly covers a tight one later, and a period only
 * gets flagged short if the actual projected balance would go negative.
 *
 * A forecast only, exactly like the dashboard's existing "next paycheck"
 * banner — nothing here changes Ready to Assign or any other figure
 * computed from the real transaction ledger (see FINANCIAL_ENGINE.md).
 * Only *scheduled* recurring series are projected; a bill with no
 * recurring series behind it won't show up here.
 */
export function projectCashFlow(params: {
  startingBalanceCents: Cents;
  series: ForecastSeriesInput[];
  asOf: Date;
  horizonDays?: number;
}): CashFlowForecast {
  const { startingBalanceCents, series, horizonDays = 60 } = params;
  const asOf = atMidnightUTC(params.asOf);
  const horizonEnd = addDaysUTC(asOf, horizonDays);

  const events = series
    .flatMap((s) => expandSeriesEvents(s, horizonEnd))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const eventsByDay = new Map<number, ForecastEvent[]>();
  for (const e of events) {
    const key = atMidnightUTC(e.date).getTime();
    const list = eventsByDay.get(key);
    if (list) list.push(e);
    else eventsByDay.set(key, [e]);
  }

  const days: ForecastDay[] = [];
  let running = startingBalanceCents;
  let lowest = startingBalanceCents;
  let lowestDate = asOf;
  let firstNegativeDate: Date | null = isNegative(startingBalanceCents) ? asOf : null;

  for (let i = 0; i <= horizonDays; i++) {
    const date = addDaysUTC(asOf, i);
    const dayEvents = eventsByDay.get(date.getTime()) ?? [];
    for (const e of dayEvents) running = add(running, e.amountCents);
    if (running < lowest) {
      lowest = running;
      lowestDate = date;
    }
    if (firstNegativeDate === null && running < ZERO) firstNegativeDate = date;
    days.push({ date, events: dayEvents, balanceCents: running });
  }

  const balanceByDay = new Map(days.map((d) => [d.date.getTime(), d.balanceCents]));
  const balanceBefore = (dateMs: number): Cents =>
    dateMs === asOf.getTime() ? startingBalanceCents : (balanceByDay.get(dateMs - DAY_MS) ?? startingBalanceCents);

  const paycheckDates = new Set<number>();
  for (const e of events) {
    if (e.type === "INCOME") paycheckDates.add(atMidnightUTC(e.date).getTime());
  }
  const boundaries = [asOf.getTime(), ...[...paycheckDates].filter((t) => t > asOf.getTime())].sort((a, b) => a - b);

  const payPeriods: PayPeriod[] = boundaries.map((startMs, i) => {
    const endMs = i + 1 < boundaries.length ? boundaries[i + 1] - DAY_MS : horizonEnd.getTime();
    const periodDays = days.filter((d) => d.date.getTime() >= startMs && d.date.getTime() <= endMs);
    let incomeCents = ZERO;
    let outflowCents = ZERO;
    for (const d of periodDays) {
      for (const e of d.events) {
        if (e.type === "INCOME") incomeCents = add(incomeCents, e.amountCents);
        else outflowCents = add(outflowCents, e.amountCents);
      }
    }
    const startingBalanceCents = balanceBefore(startMs);
    const endingBalanceCents = periodDays.length > 0 ? periodDays[periodDays.length - 1].balanceCents : startingBalanceCents;
    // Seeded with this period's own first day, not `startingBalanceCents`
    // (the balance immediately *before* the period begins) — otherwise a
    // period whose opening paycheck the very same day fixes a prior dip
    // would incorrectly inherit that prior period's low point.
    const lowestBalanceCents = periodDays.reduce(
      (min, d) => (d.balanceCents < min ? d.balanceCents : min),
      periodDays[0]?.balanceCents ?? startingBalanceCents,
    );
    return {
      startDate: new Date(startMs),
      endDate: new Date(endMs),
      incomeCents,
      outflowCents,
      startingBalanceCents,
      endingBalanceCents,
      lowestBalanceCents: cents(lowestBalanceCents),
      isShort: isNegative(cents(lowestBalanceCents)),
    };
  });

  return {
    startingBalanceCents,
    asOf,
    horizonDays,
    days,
    lowestBalanceCents: lowest,
    lowestBalanceDate: lowestDate,
    firstNegativeDate,
    payPeriods,
  };
}
