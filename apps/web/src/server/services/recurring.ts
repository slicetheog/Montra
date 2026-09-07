import "server-only";
import { prisma } from "@montra/db";
import { cents, computeNextOccurrence, detectRecurringCandidates, type RecurrenceFrequency } from "@montra/domain";
import { NotFoundError, ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { requireCategoryInBudget } from "@/server/services/budget";
import { createTransaction } from "@/server/services/transactions";
import { findOrCreatePayee } from "@/server/services/payees";
import { logAudit } from "@/server/services/audit";

export interface CreateRecurringInput {
  accountId: string;
  payeeId?: string;
  payeeName?: string;
  categoryId?: string;
  amountCents: number;
  memo?: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | "CREDIT_CARD_PAYMENT";
  frequency: RecurrenceFrequency;
  intervalCount?: number;
  startDate: Date;
  endDate?: Date;
  occurrencesLimit?: number;
  reminderDaysBefore?: number;
  autoCreate?: boolean;
  /** Target total for a bounded series (a one-time bill paid in installments). See schema.prisma's doc comment. */
  totalAmountCents?: number;
}

export async function createRecurring(userId: string, budgetId: string, input: CreateRecurringInput) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(input.accountId, budgetId);
  if (input.type === "TRANSFER") throw new ValidationError("Recurring transfers aren't supported yet — create the transaction manually each time.");
  if (input.categoryId) await requireCategoryInBudget(input.categoryId, budgetId);
  let payeeId = input.payeeId;
  if (payeeId) {
    const payee = await prisma.payee.findUnique({ where: { id: payeeId } });
    if (!payee || payee.budgetId !== budgetId) throw new NotFoundError("That payee couldn't be found.");
  } else if (input.payeeName && input.payeeName.trim()) {
    // The form only offers free-text payee entry (no existing-payee
    // picker), same as the transaction form — find-or-create by name
    // rather than silently dropping it (see the same pattern in
    // services/transactions.ts).
    payeeId = (await findOrCreatePayee(prisma, budgetId, input.payeeName)).id;
  }

  const recurring = await prisma.recurringTransaction.create({
    data: {
      budgetId,
      accountId: input.accountId,
      payeeId,
      categoryId: input.categoryId,
      amountCents: input.amountCents,
      memo: input.memo,
      type: input.type,
      frequency: input.frequency,
      intervalCount: input.intervalCount ?? 1,
      startDate: input.startDate,
      endDate: input.endDate,
      occurrencesLimit: input.occurrencesLimit,
      reminderDaysBefore: input.reminderDaysBefore,
      autoCreate: input.autoCreate ?? false,
      totalAmountCents: input.totalAmountCents,
      nextOccurrenceDate: input.startDate,
    },
  });
  await logAudit({ userId, action: "recurring.created", entityType: "RecurringTransaction", entityId: recurring.id });
  return recurring;
}

export async function updateRecurring(
  userId: string,
  budgetId: string,
  id: string,
  patch: Partial<{
    amountCents: number;
    memo: string;
    isActive: boolean;
    autoCreate: boolean;
    endDate: Date | null;
    flaggedToCancel: boolean;
    totalAmountCents: number | null;
  }>,
) {
  await requireBudgetOwnership(budgetId, userId);
  const existing = await prisma.recurringTransaction.findUnique({ where: { id } });
  if (!existing || existing.budgetId !== budgetId) throw new NotFoundError("That recurring transaction couldn't be found.");
  const updated = await prisma.recurringTransaction.update({ where: { id }, data: patch });
  await logAudit({ userId, action: "recurring.updated", entityType: "RecurringTransaction", entityId: id });
  return updated;
}

export async function deleteRecurring(userId: string, budgetId: string, id: string) {
  await requireBudgetOwnership(budgetId, userId);
  const existing = await prisma.recurringTransaction.findUnique({ where: { id } });
  if (!existing || existing.budgetId !== budgetId) throw new NotFoundError("That recurring transaction couldn't be found.");
  await prisma.recurringTransaction.delete({ where: { id } });
  await logAudit({ userId, action: "recurring.deleted", entityType: "RecurringTransaction", entityId: id });
}

/**
 * There's no background job runner in this deployment (see DEPLOYMENT.md),
 * so due occurrences are materialized lazily: every time the recurring
 * list (or dashboard) loads, we catch up any series whose next occurrence
 * is on/before today and has autoCreate on, advancing the schedule as we
 * go. This keeps the feature fully functional without extra
 * infrastructure; a real cron/queue is a natural production upgrade.
 */
export async function materializeDueRecurring(userId: string, budgetId: string, asOf = new Date()) {
  await requireBudgetOwnership(budgetId, userId);

  const due = await prisma.recurringTransaction.findMany({
    where: { budgetId, isActive: true, autoCreate: true, nextOccurrenceDate: { lte: asOf } },
  });

  for (const series of due) {
    let cursor = series.nextOccurrenceDate;
    let created = series.occurrencesCreated;
    let guard = 0;

    while (cursor.getTime() <= asOf.getTime() && guard < 60) {
      if (series.endDate && cursor.getTime() > series.endDate.getTime()) break;
      if (series.occurrencesLimit != null && created >= series.occurrencesLimit) break;

      await createTransaction(userId, budgetId, {
        accountId: series.accountId,
        date: cursor,
        payeeId: series.payeeId ?? undefined,
        memo: series.memo ?? undefined,
        type: series.type,
        amountCents: series.amountCents,
        splits: [{ categoryId: series.categoryId, amountCents: series.amountCents }],
        sourceRecurringId: series.id,
      });

      created += 1;
      cursor = computeNextOccurrence(cursor, series.frequency, series.intervalCount);
      guard += 1;
    }

    await prisma.recurringTransaction.update({
      where: { id: series.id },
      data: { nextOccurrenceDate: cursor, occurrencesCreated: created },
    });
  }
}

/**
 * "Amount paid so far" for a bounded series (totalAmountCents set) is
 * derived from its actual materialized transactions, never assumed from
 * the schedule — the same "balances are derived, not stored" rule the
 * rest of the ledger follows (see schema.prisma's header comment).
 */
export async function listRecurring(userId: string, budgetId: string) {
  await materializeDueRecurring(userId, budgetId);
  await requireBudgetOwnership(budgetId, userId);
  const recurring = await prisma.recurringTransaction.findMany({
    where: { budgetId },
    orderBy: { nextOccurrenceDate: "asc" },
    include: {
      account: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  });

  const boundedIds = recurring.filter((r) => r.totalAmountCents != null).map((r) => r.id);
  const paidSums = boundedIds.length
    ? await prisma.transaction.groupBy({
        by: ["sourceRecurringId"],
        where: { sourceRecurringId: { in: boundedIds } },
        _sum: { amountCents: true },
      })
    : [];
  const paidById = new Map(paidSums.map((p) => [p.sourceRecurringId!, Math.abs(p._sum.amountCents ?? 0)]));

  return recurring.map((r) => ({
    ...r,
    amountPaidCents: r.totalAmountCents != null ? (paidById.get(r.id) ?? 0) : null,
  }));
}

/**
 * Manually records one real payment toward a bounded series
 * (totalAmountCents set) — a one-time bill or installment plan paid down
 * over several actual payments, which won't line up with the series'
 * own schedule the way a plain recurring bill does (see the "2025 tax
 * payment, $750 down, $727 to go" scenario a due-day/frequency-based
 * schedule alone can't represent). The resulting transaction is linked
 * via sourceRecurringId exactly like an auto-materialized occurrence, so
 * listRecurring's amountPaidCents rollup counts it the same way either
 * path got there.
 */
export async function logRecurringPayment(
  userId: string,
  budgetId: string,
  recurringId: string,
  input: { amountCents: number; date: Date; memo?: string },
) {
  await requireBudgetOwnership(budgetId, userId);
  const series = await prisma.recurringTransaction.findUnique({ where: { id: recurringId } });
  if (!series || series.budgetId !== budgetId) throw new NotFoundError("That recurring transaction couldn't be found.");
  if (series.totalAmountCents == null) throw new ValidationError("This recurring transaction doesn't track a total amount.");
  if (input.amountCents <= 0) throw new ValidationError("Enter a positive payment amount.");

  const signedAmountCents = series.type === "EXPENSE" || series.type === "CREDIT_CARD_PAYMENT" ? -input.amountCents : input.amountCents;

  return createTransaction(userId, budgetId, {
    accountId: series.accountId,
    date: input.date,
    payeeId: series.payeeId ?? undefined,
    memo: input.memo ?? series.memo ?? undefined,
    type: series.type,
    amountCents: signedAmountCents,
    splits: [{ categoryId: series.categoryId, amountCents: signedAmountCents }],
    sourceRecurringId: series.id,
  });
}

/**
 * "This $15.49 Netflix charge shows up every month — want to make it
 * recurring?" Scans the last 12 months of history for a fixed-price,
 * regular-cadence pattern (see detectRecurringCandidates in the domain
 * package for the exact heuristic) and drops anything already covered
 * by an existing active recurring series for that same payee/account.
 */
export async function suggestRecurringTransactions(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const since = new Date();
  since.setUTCMonth(since.getUTCMonth() - 12);

  const transactions = await prisma.transaction.findMany({
    where: { budgetId, date: { gte: since }, payeeId: { not: null }, type: { in: ["EXPENSE", "INCOME"] } },
    select: { payeeId: true, payee: { select: { name: true } }, accountId: true, amountCents: true, date: true },
  });

  const candidates = detectRecurringCandidates(
    transactions.map((t) => ({
      payeeId: t.payeeId!,
      payeeName: t.payee!.name,
      accountId: t.accountId,
      amountCents: cents(t.amountCents),
      date: t.date,
    })),
  );

  const existing = await prisma.recurringTransaction.findMany({
    where: { budgetId, isActive: true },
    select: { payeeId: true, accountId: true, amountCents: true },
  });
  const alreadyCovered = new Set(existing.map((r) => `${r.payeeId}:${r.accountId}:${r.amountCents}`));

  return candidates.filter((c) => !alreadyCovered.has(`${c.payeeId}:${c.accountId}:${c.amountCents}`));
}
