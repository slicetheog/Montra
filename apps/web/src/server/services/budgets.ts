import "server-only";
import { prisma } from "@montra/db";
import { ForbiddenError, NotFoundError } from "@/server/api-helpers";
import { logAudit } from "@/server/services/audit";

/**
 * THE single ownership gate for every budget-scoped resource in the app.
 * Every service function below (and in accounts.ts, transactions.ts,
 * budget-engine service, etc.) calls this before touching a Budget's data,
 * so a user can never reach another user's financial information by
 * guessing/manipulating an id (spec: Security — "database-level user
 * isolation" / "never trust client-side authorization").
 */
export async function requireBudgetOwnership(budgetId: string, userId: string) {
  const budget = await prisma.budget.findUnique({ where: { id: budgetId } });
  if (!budget) throw new NotFoundError("That budget couldn't be found.");
  if (budget.userId !== userId) throw new ForbiddenError();
  return budget;
}

export async function listBudgets(userId: string) {
  return prisma.budget.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "asc" },
  });
}

export async function createBudget(userId: string, name: string, currency = "USD") {
  const budget = await prisma.budget.create({ data: { userId, name, currency } });
  await logAudit({ userId, action: "budget.created", entityType: "Budget", entityId: budget.id });
  return budget;
}

export async function renameBudget(userId: string, budgetId: string, name: string) {
  await requireBudgetOwnership(budgetId, userId);
  const budget = await prisma.budget.update({ where: { id: budgetId }, data: { name } });
  await logAudit({ userId, action: "budget.renamed", entityType: "Budget", entityId: budgetId });
  return budget;
}

export async function archiveBudget(userId: string, budgetId: string, archived: boolean) {
  await requireBudgetOwnership(budgetId, userId);
  const budget = await prisma.budget.update({ where: { id: budgetId }, data: { isArchived: archived } });
  await logAudit({
    userId,
    action: archived ? "budget.archived" : "budget.unarchived",
    entityType: "Budget",
    entityId: budgetId,
  });
  return budget;
}

export async function deleteBudget(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  await prisma.budget.delete({ where: { id: budgetId } });
  await logAudit({ userId, action: "budget.deleted", entityType: "Budget", entityId: budgetId });
}

/**
 * Smart default category groups/categories (spec section 9). Applied once,
 * typically during onboarding; users are always free to edit/delete
 * afterward, so this is just a helpful starting point, not a fixed
 * structure.
 */
const DEFAULT_CATEGORY_GROUPS: { name: string; categories: string[] }[] = [
  { name: "Housing", categories: ["Rent/Mortgage", "Utilities", "Internet", "Phone"] },
  { name: "Food", categories: ["Groceries", "Restaurants", "Coffee"] },
  {
    name: "Transportation",
    categories: ["Gas", "Car Payment", "Insurance", "Maintenance", "Registration"],
  },
  { name: "Health", categories: ["Healthcare", "Prescriptions", "Fitness"] },
  { name: "Lifestyle", categories: ["Entertainment", "Shopping", "Subscriptions"] },
  { name: "Savings", categories: ["Emergency Fund", "Vacation", "Large Purchases"] },
  { name: "Debt", categories: ["Credit Card Payments", "Loans"] },
];

export async function seedDefaultCategories(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);

  const existingGroupCount = await prisma.categoryGroup.count({
    where: { budgetId, isSystem: false },
  });

  await prisma.$transaction(
    DEFAULT_CATEGORY_GROUPS.map((group, groupIndex) =>
      prisma.categoryGroup.create({
        data: {
          budgetId,
          name: group.name,
          sortOrder: existingGroupCount + groupIndex,
          categories: {
            create: group.categories.map((name, categoryIndex) => ({
              budgetId,
              name,
              sortOrder: categoryIndex,
            })),
          },
        },
      }),
    ),
  );

  await logAudit({
    userId,
    action: "budget.default_categories_seeded",
    entityType: "Budget",
    entityId: budgetId,
  });
}
