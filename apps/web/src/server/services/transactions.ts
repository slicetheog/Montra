import "server-only";
import { prisma } from "@montra/db";
import type { Prisma } from "@prisma/client";
import { assertSplitsSumToTotal, cents } from "@montra/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { findOrCreatePayee } from "@/server/services/payees";
import { applyCreditCardOffset, requireCategoryInBudget, reverseCreditCardOffsetsForTransaction } from "@/server/services/budget";
import { logAudit } from "@/server/services/audit";

export interface SplitInput {
  categoryId: string | null;
  amountCents: number;
  memo?: string;
}

export interface CreateTransactionInput {
  accountId: string;
  date: Date;
  payeeId?: string;
  payeeName?: string;
  memo?: string;
  cleared?: "UNCLEARED" | "CLEARED" | "RECONCILED";
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | "CREDIT_CARD_PAYMENT";
  amountCents: number;
  splits?: SplitInput[];
  transferAccountId?: string;
}

async function resolvePayeeId(
  tx: Prisma.TransactionClient,
  budgetId: string,
  payeeId?: string,
  payeeName?: string,
): Promise<string | null> {
  if (payeeId) {
    const payee = await tx.payee.findUnique({ where: { id: payeeId } });
    if (!payee || payee.budgetId !== budgetId) throw new NotFoundError("That payee couldn't be found.");
    return payee.id;
  }
  if (payeeName && payeeName.trim()) {
    const payee = await findOrCreatePayee(tx, budgetId, payeeName);
    return payee.id;
  }
  return null;
}

/**
 * TransactionSplit.categoryId has no composite (categoryId, budgetId) FK
 * to lean on, so every caller-supplied split must be checked explicitly —
 * otherwise a transaction in this budget could inject activity into a
 * category belonging to a different budget (or a different user
 * entirely), corrupting its Available/Activity totals.
 */
async function requireSplitCategoriesInBudget(budgetId: string, splits: { categoryId: string | null }[]) {
  const categoryIds = [...new Set(splits.map((s) => s.categoryId).filter((id): id is string => Boolean(id)))];
  await Promise.all(categoryIds.map((id) => requireCategoryInBudget(id, budgetId)));
}

/** Applies the credit-card auto-offset for every real-category outflow split on a CC account transaction. */
async function applyCcOffsetsForSplits(
  tx: Prisma.TransactionClient,
  budgetId: string,
  accountId: string,
  transactionId: string,
  date: Date,
  splits: { categoryId: string | null; amountCents: number }[],
) {
  const account = await tx.account.findUnique({ where: { id: accountId } });
  if (!account || account.type !== "CREDIT_CARD") return;

  for (const split of splits) {
    if (!split.categoryId || split.amountCents >= 0) continue;
    const category = await tx.category.findUnique({ where: { id: split.categoryId } });
    if (!category || category.linkedAccountId === accountId) continue; // never offset against the card's own payment category

    const paymentCategory = await tx.category.findFirst({ where: { linkedAccountId: accountId } });
    if (!paymentCategory) continue;

    await applyCreditCardOffset(
      tx,
      budgetId,
      split.categoryId,
      paymentCategory.id,
      date,
      -split.amountCents,
      transactionId,
    );
  }
}

/** For a Transfer touching a credit card, the *non-card* leg is auto-categorized to that card's payment category. */
async function autoTransferSplitsForCreditCard(
  tx: Prisma.TransactionClient,
  accountA: { id: string; type: string },
  accountB: { id: string; type: string },
) {
  const cardAccount = [accountA, accountB].find((a) => a.type === "CREDIT_CARD");
  if (!cardAccount) return null;
  return tx.category.findFirst({ where: { linkedAccountId: cardAccount.id } });
}

export async function createTransaction(userId: string, budgetId: string, input: CreateTransactionInput) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(input.accountId, budgetId);

  if (input.type === "TRANSFER") {
    if (!input.transferAccountId) throw new ValidationError("Choose which account this transfers to.");
    if (input.transferAccountId === input.accountId) throw new ValidationError("Choose two different accounts.");
    const otherAccount = await requireAccountInBudget(input.transferAccountId, budgetId);
    const primaryAccount = await requireAccountInBudget(input.accountId, budgetId);
    const payeeId = await resolvePayeeIdOutsideTx(budgetId, input.payeeId, input.payeeName);

    const result = await prisma.$transaction(async (tx) => {
      const paymentCategory = await autoTransferSplitsForCreditCard(tx, primaryAccount, otherAccount);

      const legA = await tx.transaction.create({
        data: {
          budgetId,
          accountId: input.accountId,
          transferAccountId: input.transferAccountId,
          payeeId,
          date: input.date,
          amountCents: input.amountCents,
          memo: input.memo,
          type: "TRANSFER",
          cleared: input.cleared ?? "UNCLEARED",
        },
      });
      const legB = await tx.transaction.create({
        data: {
          budgetId,
          accountId: input.transferAccountId!,
          transferAccountId: input.accountId,
          transferPeerId: legA.id,
          payeeId,
          date: input.date,
          amountCents: -input.amountCents,
          memo: input.memo,
          type: "TRANSFER",
          cleared: input.cleared ?? "UNCLEARED",
        },
      });
      await tx.transaction.update({ where: { id: legA.id }, data: { transferPeerId: legB.id } });

      // Auto-categorize the leg on the non-card account to "Payment: <Card>".
      if (paymentCategory) {
        const cardIsAccountA = primaryAccount.type === "CREDIT_CARD";
        const nonCardLeg = cardIsAccountA ? legB : legA;
        await tx.transactionSplit.create({
          data: { transactionId: nonCardLeg.id, categoryId: paymentCategory.id, amountCents: nonCardLeg.amountCents },
        });
      }

      return legA;
    });

    await logAudit({ userId, action: "transaction.created", entityType: "Transaction", entityId: result.id, metadata: { type: "TRANSFER" } });
    return result;
  }

  const splits = input.splits ?? [];
  assertSplitsSumToTotal(cents(input.amountCents), splits.map((s) => cents(s.amountCents)));
  await requireSplitCategoriesInBudget(budgetId, splits);

  const transaction = await prisma.$transaction(async (tx) => {
    const payeeId = await resolvePayeeId(tx, budgetId, input.payeeId, input.payeeName);

    const created = await tx.transaction.create({
      data: {
        budgetId,
        accountId: input.accountId,
        payeeId,
        date: input.date,
        amountCents: input.amountCents,
        memo: input.memo,
        type: input.type,
        cleared: input.cleared ?? "UNCLEARED",
        isSplit: splits.length > 1,
        splits: { create: splits.map((s) => ({ categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo })) },
      },
    });

    await applyCcOffsetsForSplits(tx, budgetId, input.accountId, created.id, input.date, splits);

    return created;
  });

  await logAudit({ userId, action: "transaction.created", entityType: "Transaction", entityId: transaction.id, metadata: { type: input.type } });
  return transaction;
}

async function resolvePayeeIdOutsideTx(budgetId: string, payeeId?: string, payeeName?: string) {
  if (payeeId) return payeeId;
  if (payeeName && payeeName.trim()) {
    const payee = await findOrCreatePayee(prisma, budgetId, payeeName);
    return payee.id;
  }
  return null;
}

export interface UpdateTransactionInput {
  accountId?: string;
  date?: Date;
  payeeId?: string | null;
  payeeName?: string;
  memo?: string | null;
  cleared?: "UNCLEARED" | "CLEARED" | "RECONCILED";
  amountCents?: number;
  splits?: SplitInput[];
}

async function requireTransactionInBudget(transactionId: string, budgetId: string) {
  const transaction = await prisma.transaction.findUnique({ where: { id: transactionId }, include: { splits: true } });
  if (!transaction || transaction.budgetId !== budgetId) throw new NotFoundError("That transaction couldn't be found.");
  return transaction;
}

/**
 * Updating a transaction's amount/category/date is implemented as
 * "reverse the old effects, then apply new ones" rather than trying to
 * diff old vs. new — simpler to reason about and get right for a
 * financial ledger. Transfers are edited by editing either leg's shared
 * fields (date/memo/cleared/amount); category splits aren't supported on
 * transfer legs directly (edit the auto-generated CC payment split isn't
 * exposed to users).
 */
export async function updateTransaction(
  userId: string,
  budgetId: string,
  transactionId: string,
  patch: UpdateTransactionInput,
) {
  await requireBudgetOwnership(budgetId, userId);
  const existing = await requireTransactionInBudget(transactionId, budgetId);

  // Never trust a client-supplied accountId without checking it's in this
  // same budget — otherwise a transaction could be repointed onto another
  // budget's (or another user's) account and corrupt its balance.
  if (patch.accountId !== undefined) {
    await requireAccountInBudget(patch.accountId, budgetId);
  }

  if (existing.cleared === "RECONCILED" && patch.cleared !== "CLEARED" && patch.cleared !== "UNCLEARED") {
    // Allow un-reconciling (a deliberate un-lock) but block silent edits to a reconciled row's numbers.
    if (patch.amountCents !== undefined || patch.splits !== undefined || patch.accountId !== undefined) {
      throw new ConflictError(
        "This transaction is part of a reconciled statement. Mark it uncleared first if you need to change it.",
      );
    }
  }

  if (existing.type === "TRANSFER") {
    if (patch.splits) throw new ValidationError("Transfers can't have category splits.");
    const updated = await prisma.transaction.update({
      where: { id: transactionId },
      data: {
        date: patch.date,
        memo: patch.memo,
        cleared: patch.cleared,
      },
    });
    if (existing.transferPeerId) {
      await prisma.transaction.update({
        where: { id: existing.transferPeerId },
        data: { date: patch.date, memo: patch.memo, cleared: patch.cleared },
      });
    }
    await logAudit({ userId, action: "transaction.updated", entityType: "Transaction", entityId: transactionId });
    return updated;
  }

  const nextAmount = patch.amountCents ?? existing.amountCents;
  const nextSplits =
    patch.splits ?? existing.splits.map((s) => ({ categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo ?? undefined }));
  assertSplitsSumToTotal(cents(nextAmount), nextSplits.map((s) => cents(s.amountCents)));
  if (patch.splits) await requireSplitCategoriesInBudget(budgetId, patch.splits);

  const updated = await prisma.$transaction(async (tx) => {
    // Reverse this transaction's prior CC-offset effects before re-applying with new numbers.
    await reverseCreditCardOffsetsForTransaction(tx, transactionId);

    const payeeId =
      patch.payeeId !== undefined
        ? patch.payeeId
        : patch.payeeName
          ? (await findOrCreatePayee(tx, budgetId, patch.payeeName)).id
          : existing.payeeId;

    await tx.transactionSplit.deleteMany({ where: { transactionId } });
    const result = await tx.transaction.update({
      where: { id: transactionId },
      data: {
        accountId: patch.accountId ?? existing.accountId,
        date: patch.date ?? existing.date,
        payeeId,
        memo: patch.memo === undefined ? existing.memo : patch.memo,
        cleared: patch.cleared ?? existing.cleared,
        amountCents: nextAmount,
        isSplit: nextSplits.length > 1,
        splits: { create: nextSplits.map((s) => ({ categoryId: s.categoryId, amountCents: s.amountCents, memo: s.memo })) },
      },
    });

    await applyCcOffsetsForSplits(tx, budgetId, result.accountId, transactionId, result.date, nextSplits);
    return result;
  });

  await logAudit({ userId, action: "transaction.updated", entityType: "Transaction", entityId: transactionId });
  return updated;
}

export async function deleteTransaction(userId: string, budgetId: string, transactionId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const existing = await requireTransactionInBudget(transactionId, budgetId);

  if (existing.cleared === "RECONCILED") {
    throw new ConflictError("This transaction is part of a reconciled statement and can't be deleted directly.");
  }

  await prisma.$transaction(async (tx) => {
    await reverseCreditCardOffsetsForTransaction(tx, transactionId);
    if (existing.transferPeerId) {
      await reverseCreditCardOffsetsForTransaction(tx, existing.transferPeerId);
      await tx.transaction.delete({ where: { id: existing.transferPeerId } });
    }
    await tx.transaction.delete({ where: { id: transactionId } });
  });

  await logAudit({ userId, action: "transaction.deleted", entityType: "Transaction", entityId: transactionId });
}

export interface ListTransactionsFilters {
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  search?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
}

export async function listTransactions(userId: string, budgetId: string, filters: ListTransactionsFilters) {
  await requireBudgetOwnership(budgetId, userId);
  const limit = filters.limit ?? 50;

  const where: Prisma.TransactionWhereInput = {
    budgetId,
    accountId: filters.accountId,
    payeeId: filters.payeeId,
    date: filters.from || filters.to ? { gte: filters.from, lte: filters.to } : undefined,
    splits: filters.categoryId ? { some: { categoryId: filters.categoryId } } : undefined,
    OR: filters.search
      ? [
          { memo: { contains: filters.search, mode: "insensitive" } },
          { payee: { name: { contains: filters.search, mode: "insensitive" } } },
        ]
      : undefined,
  };

  const rows = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    include: {
      payee: { select: { id: true, name: true } },
      account: { select: { id: true, name: true, type: true } },
      transferAccount: { select: { id: true, name: true } },
      splits: { include: { category: { select: { id: true, name: true } } } },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}

export async function getTransaction(userId: string, budgetId: string, transactionId: string) {
  await requireBudgetOwnership(budgetId, userId);
  return prisma.transaction.findFirstOrThrow({
    where: { id: transactionId, budgetId },
    include: {
      payee: { select: { id: true, name: true } },
      splits: { include: { category: { select: { id: true, name: true } } } },
    },
  });
}
