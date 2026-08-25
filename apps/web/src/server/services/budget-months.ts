import "server-only";
import { prisma } from "@montra/db";
import type { Prisma } from "@prisma/client";
import { monthStart } from "@montra/domain";

/** Finds or lazily creates the BudgetMonth row for a given month (spec: "Create monthly budget periods"). */
export async function getOrCreateBudgetMonth(
  tx: Prisma.TransactionClient | typeof prisma,
  budgetId: string,
  month: Date,
) {
  const normalized = monthStart(month);
  const existing = await tx.budgetMonth.findUnique({
    where: { budgetId_month: { budgetId, month: normalized } },
  });
  if (existing) return existing;

  return tx.budgetMonth.create({ data: { budgetId, month: normalized } });
}

/** Ensures every category has a CategoryMonth row for this month (assignedCents defaults to 0). */
export async function getOrCreateCategoryMonth(
  tx: Prisma.TransactionClient | typeof prisma,
  categoryId: string,
  budgetMonthId: string,
) {
  const existing = await tx.categoryMonth.findUnique({
    where: { categoryId_budgetMonthId: { categoryId, budgetMonthId } },
  });
  if (existing) return existing;

  return tx.categoryMonth.create({ data: { categoryId, budgetMonthId, assignedCents: 0 } });
}
