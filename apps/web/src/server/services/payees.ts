import "server-only";
import { prisma } from "@montra/db";
import type { Prisma } from "@prisma/client";
import { ConflictError, NotFoundError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { logAudit } from "@/server/services/audit";

type Client = Prisma.TransactionClient | typeof prisma;

export async function findOrCreatePayee(db: Client, budgetId: string, name: string) {
  const trimmed = name.trim();
  const existing = await db.payee.findUnique({ where: { budgetId_name: { budgetId, name: trimmed } } });
  if (existing) return existing;
  return db.payee.create({ data: { budgetId, name: trimmed } });
}

export async function listPayees(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  return prisma.payee.findMany({
    where: { budgetId },
    orderBy: { name: "asc" },
    include: { defaultCategory: { select: { id: true, name: true } } },
  });
}

async function requirePayeeInBudget(payeeId: string, budgetId: string) {
  const payee = await prisma.payee.findUnique({ where: { id: payeeId } });
  if (!payee || payee.budgetId !== budgetId) throw new NotFoundError("That payee couldn't be found.");
  return payee;
}

export async function renamePayee(userId: string, budgetId: string, payeeId: string, name: string) {
  await requireBudgetOwnership(budgetId, userId);
  await requirePayeeInBudget(payeeId, budgetId);
  const trimmed = name.trim();

  const clashing = await prisma.payee.findUnique({ where: { budgetId_name: { budgetId, name: trimmed } } });
  if (clashing && clashing.id !== payeeId) {
    throw new ConflictError(`A payee named "${trimmed}" already exists. Merge them instead if that's what you meant.`);
  }

  const updated = await prisma.payee.update({ where: { id: payeeId }, data: { name: trimmed } });
  await logAudit({ userId, action: "payee.renamed", entityType: "Payee", entityId: payeeId });
  return updated;
}

export async function setPayeeDefaultCategory(
  userId: string,
  budgetId: string,
  payeeId: string,
  categoryId: string | null,
) {
  await requireBudgetOwnership(budgetId, userId);
  await requirePayeeInBudget(payeeId, budgetId);
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category || category.budgetId !== budgetId) throw new NotFoundError("That category couldn't be found.");
  }
  return prisma.payee.update({ where: { id: payeeId }, data: { defaultCategoryId: categoryId } });
}

/** Merges `sourcePayeeId` into `targetPayeeId`: repoints all transactions/recurring rows, then deletes the source. */
export async function mergePayees(userId: string, budgetId: string, sourcePayeeId: string, targetPayeeId: string) {
  if (sourcePayeeId === targetPayeeId) throw new ConflictError("Choose two different payees to merge.");
  await requireBudgetOwnership(budgetId, userId);
  await requirePayeeInBudget(sourcePayeeId, budgetId);
  await requirePayeeInBudget(targetPayeeId, budgetId);

  await prisma.$transaction([
    prisma.transaction.updateMany({ where: { payeeId: sourcePayeeId }, data: { payeeId: targetPayeeId } }),
    prisma.recurringTransaction.updateMany({ where: { payeeId: sourcePayeeId }, data: { payeeId: targetPayeeId } }),
    prisma.payee.delete({ where: { id: sourcePayeeId } }),
  ]);

  await logAudit({ userId, action: "payee.merged", entityType: "Payee", entityId: targetPayeeId });
}

/**
 * "Shell -> Gas": suggests a category by (1) the payee's explicit default,
 * falling back to (2) whichever category has most often accompanied this
 * payee historically. Always advisory — the caller must let the user
 * override it (spec: "The user must always be able to override the
 * suggestion").
 */
export async function suggestCategoryForPayee(budgetId: string, payeeId: string): Promise<string | null> {
  const payee = await prisma.payee.findUnique({ where: { id: payeeId } });
  if (!payee || payee.budgetId !== budgetId) return null;
  if (payee.defaultCategoryId) return payee.defaultCategoryId;

  const splits = await prisma.transactionSplit.groupBy({
    by: ["categoryId"],
    where: { categoryId: { not: null }, transaction: { payeeId, budgetId } },
    _count: { categoryId: true },
    orderBy: { _count: { categoryId: "desc" } },
    take: 1,
  });

  return splits[0]?.categoryId ?? null;
}
