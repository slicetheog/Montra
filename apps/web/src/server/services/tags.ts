import "server-only";
import { prisma } from "@montra/db";
import type { Prisma } from "@prisma/client";
import { ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";

type Client = typeof prisma | Prisma.TransactionClient;

/** Mirrors findOrCreatePayee in payees.ts — same idempotent-by-name pattern. */
export async function findOrCreateTag(db: Client, budgetId: string, name: string) {
  const trimmed = name.trim();
  const existing = await db.tag.findUnique({ where: { budgetId_name: { budgetId, name: trimmed } } });
  if (existing) return existing;
  return db.tag.create({ data: { budgetId, name: trimmed } });
}

export async function listTags(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  return prisma.tag.findMany({ where: { budgetId }, orderBy: { name: "asc" } });
}

export async function deleteTag(userId: string, budgetId: string, tagId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const tag = await prisma.tag.findFirst({ where: { id: tagId, budgetId } });
  if (!tag) throw new ValidationError("Tag not found.");
  await prisma.tag.delete({ where: { id: tagId } });
}

/**
 * Replaces a transaction's full tag set with `tagNames` — create-on-the-
 * fly (same as payees: type a new name, it becomes a real tag), applied
 * atomically so a transaction never ends up with a partial update.
 */
export async function setTransactionTags(userId: string, budgetId: string, transactionId: string, tagNames: string[]) {
  await requireBudgetOwnership(budgetId, userId);
  const transaction = await prisma.transaction.findFirst({ where: { id: transactionId, budgetId } });
  if (!transaction) throw new ValidationError("Transaction not found.");

  const uniqueNames = [...new Set(tagNames.map((n) => n.trim()).filter(Boolean))];

  await prisma.$transaction(async (tx) => {
    const tags = await Promise.all(uniqueNames.map((name) => findOrCreateTag(tx, budgetId, name)));
    await tx.transactionTag.deleteMany({ where: { transactionId } });
    if (tags.length > 0) {
      await tx.transactionTag.createMany({ data: tags.map((tag) => ({ transactionId, tagId: tag.id })) });
    }
  });
}
