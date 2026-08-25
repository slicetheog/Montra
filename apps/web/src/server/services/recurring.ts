import "server-only";
import { prisma } from "@montra/db";
import { computeNextOccurrence, type RecurrenceFrequency } from "@montra/domain";
import { NotFoundError, ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { createTransaction } from "@/server/services/transactions";
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
}

export async function createRecurring(userId: string, budgetId: string, input: CreateRecurringInput) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(input.accountId, budgetId);
  if (input.type === "TRANSFER") throw new ValidationError("Recurring transfers aren't supported yet — create the transaction manually each time.");

  const recurring = await prisma.recurringTransaction.create({
    data: {
      budgetId,
      accountId: input.accountId,
      payeeId: input.payeeId,
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
  patch: Partial<{ amountCents: number; memo: string; isActive: boolean; autoCreate: boolean; endDate: Date | null }>,
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

export async function listRecurring(userId: string, budgetId: string) {
  await materializeDueRecurring(userId, budgetId);
  await requireBudgetOwnership(budgetId, userId);
  return prisma.recurringTransaction.findMany({
    where: { budgetId },
    orderBy: { nextOccurrenceDate: "asc" },
    include: {
      account: { select: { id: true, name: true } },
      payee: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
    },
  });
}
