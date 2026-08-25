import "server-only";
import { prisma } from "@montra/db";
import type { Prisma } from "@prisma/client";
import {
  add,
  cents,
  Cents,
  computeBudgetTotals,
  computeCreditCardOffset,
  computeReadyToAssign,
  assertCanMove,
  monthEndExclusive,
  monthStart,
  toDecimalString,
  ZERO,
} from "@montra/domain";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { getOrCreateBudgetMonth, getOrCreateCategoryMonth } from "@/server/services/budget-months";
import { logAudit } from "@/server/services/audit";

type Client = Prisma.TransactionClient | typeof prisma;

// ---------------------------------------------------------------------------
// Ledger aggregates — the only place these two sums are computed.
// ---------------------------------------------------------------------------

/** Sum of every Assignment for this category through and including `uptoMonth`. */
async function cumulativeAssigned(db: Client, categoryId: string, uptoMonth: Date): Promise<Cents> {
  const result = await db.assignment.aggregate({
    where: { categoryId, budgetMonth: { month: { lte: monthStart(uptoMonth) } } },
    _sum: { amountCents: true },
  });
  return cents(result._sum.amountCents ?? 0);
}

/** Sum of every transaction split for this category dated strictly before `beforeDate`. */
async function cumulativeActivity(db: Client, categoryId: string, beforeDate: Date): Promise<Cents> {
  const result = await db.transactionSplit.aggregate({
    where: { categoryId, transaction: { date: { lt: beforeDate } } },
    _sum: { amountCents: true },
  });
  return cents(result._sum.amountCents ?? 0);
}

/** This category's Available balance at the end of `month` (the rollover formula, telescoped). */
export async function getCategoryAvailable(db: Client, categoryId: string, month: Date): Promise<Cents> {
  const assigned = await cumulativeAssigned(db, categoryId, month);
  const activity = await cumulativeActivity(db, categoryId, monthEndExclusive(month));
  return add(assigned, activity);
}

// ---------------------------------------------------------------------------
// Ready to Assign
// ---------------------------------------------------------------------------

export async function getReadyToAssign(db: Client, budgetId: string, uptoMonth: Date): Promise<Cents> {
  const [incomeResult, assignedResult] = await Promise.all([
    db.transactionSplit.aggregate({
      where: {
        categoryId: null,
        transaction: {
          budgetId,
          type: "INCOME",
          date: { lt: monthEndExclusive(uptoMonth) },
          account: { onBudget: true },
        },
      },
      _sum: { amountCents: true },
    }),
    db.assignment.aggregate({
      where: { budgetId, budgetMonth: { month: { lte: monthStart(uptoMonth) } } },
      _sum: { amountCents: true },
    }),
  ]);

  return computeReadyToAssign(
    cents(incomeResult._sum.amountCents ?? 0),
    cents(assignedResult._sum.amountCents ?? 0),
  );
}

// ---------------------------------------------------------------------------
// Month view (the Budget screen's data)
// ---------------------------------------------------------------------------

export interface CategoryMonthView {
  categoryId: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  goalId: string | null;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

export interface CategoryGroupView {
  groupId: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  categories: CategoryMonthView[];
}

export async function getMonthView(userId: string, budgetId: string, month: Date) {
  await requireBudgetOwnership(budgetId, userId);
  const normalized = monthStart(month);

  const groups = await prisma.categoryGroup.findMany({
    where: { budgetId, isArchived: false },
    orderBy: { sortOrder: "asc" },
    include: {
      categories: {
        where: { isArchived: false },
        orderBy: { sortOrder: "asc" },
        include: { goal: { select: { id: true } } },
      },
    },
  });

  const groupViews: CategoryGroupView[] = [];
  const flatCategories: CategoryMonthView[] = [];

  for (const group of groups) {
    const categoryViews: CategoryMonthView[] = [];
    for (const category of group.categories) {
      const [assignedThisMonth, activityThisMonth, available] = await Promise.all([
        prisma.assignment
          .aggregate({
            where: { categoryId: category.id, budgetMonth: { month: normalized } },
            _sum: { amountCents: true },
          })
          .then((r) => r._sum.amountCents ?? 0),
        prisma.transactionSplit
          .aggregate({
            where: {
              categoryId: category.id,
              transaction: { date: { gte: normalized, lt: monthEndExclusive(normalized) } },
            },
            _sum: { amountCents: true },
          })
          .then((r) => r._sum.amountCents ?? 0),
        getCategoryAvailable(prisma, category.id, normalized),
      ]);

      const view: CategoryMonthView = {
        categoryId: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isSystem: category.isSystem,
        goalId: category.goal?.id ?? null,
        assignedCents: assignedThisMonth,
        activityCents: activityThisMonth,
        availableCents: available,
      };
      categoryViews.push(view);
      flatCategories.push(view);
    }
    groupViews.push({
      groupId: group.id,
      name: group.name,
      sortOrder: group.sortOrder,
      isSystem: group.isSystem,
      categories: categoryViews,
    });
  }

  const totals = computeBudgetTotals(
    flatCategories.map((c) => ({
      categoryId: c.categoryId,
      assignedCents: cents(c.assignedCents),
      activityCents: cents(c.activityCents),
      availableCents: cents(c.availableCents),
    })),
  );

  const readyToAssign = await getReadyToAssign(prisma, budgetId, normalized);

  return {
    month: normalized.toISOString(),
    groups: groupViews,
    totals,
    readyToAssignCents: readyToAssign,
  };
}

// ---------------------------------------------------------------------------
// Assign / move money
// ---------------------------------------------------------------------------

export async function requireCategoryInBudget(categoryId: string, budgetId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category || category.budgetId !== budgetId) throw new NotFoundError("That category couldn't be found.");
  return category;
}

export async function assignMoney(
  userId: string,
  budgetId: string,
  categoryId: string,
  month: Date,
  amountCents: number,
  memo?: string,
) {
  await requireBudgetOwnership(budgetId, userId);
  await requireCategoryInBudget(categoryId, budgetId);
  const normalized = monthStart(month);

  await prisma.$transaction(async (tx) => {
    const budgetMonth = await getOrCreateBudgetMonth(tx, budgetId, normalized);
    await getOrCreateCategoryMonth(tx, categoryId, budgetMonth.id);

    await tx.assignment.create({
      data: { categoryId, budgetMonthId: budgetMonth.id, budgetId, amountCents, kind: "ASSIGN", memo },
    });
    await tx.categoryMonth.update({
      where: { categoryId_budgetMonthId: { categoryId, budgetMonthId: budgetMonth.id } },
      data: { assignedCents: { increment: amountCents } },
    });
  });

  await logAudit({ userId, action: "budget.money_assigned", entityType: "Category", entityId: categoryId });
}

export async function moveMoney(
  userId: string,
  budgetId: string,
  fromCategoryId: string,
  toCategoryId: string,
  month: Date,
  amountCents: number,
) {
  if (amountCents <= 0) throw new ConflictError("Enter an amount greater than $0 to move.");
  if (fromCategoryId === toCategoryId) throw new ConflictError("Choose two different categories.");

  await requireBudgetOwnership(budgetId, userId);
  await requireCategoryInBudget(fromCategoryId, budgetId);
  await requireCategoryInBudget(toCategoryId, budgetId);
  const normalized = monthStart(month);

  const availableInSource = await getCategoryAvailable(prisma, fromCategoryId, normalized);
  try {
    assertCanMove(availableInSource, cents(amountCents));
  } catch {
    throw new ConflictError(
      `Only ${toDecimalString(availableInSource)} is available in that category to move.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    const budgetMonth = await getOrCreateBudgetMonth(tx, budgetId, normalized);
    await getOrCreateCategoryMonth(tx, fromCategoryId, budgetMonth.id);
    await getOrCreateCategoryMonth(tx, toCategoryId, budgetMonth.id);

    const fromAssignment = await tx.assignment.create({
      data: {
        categoryId: fromCategoryId,
        budgetMonthId: budgetMonth.id,
        budgetId,
        amountCents: -amountCents,
        kind: "MOVE_FROM",
      },
    });
    const toAssignment = await tx.assignment.create({
      data: {
        categoryId: toCategoryId,
        budgetMonthId: budgetMonth.id,
        budgetId,
        amountCents,
        kind: "MOVE_TO",
        pairedWithId: fromAssignment.id,
      },
    });
    await tx.assignment.update({ where: { id: fromAssignment.id }, data: { pairedWithId: toAssignment.id } });

    await tx.categoryMonth.update({
      where: { categoryId_budgetMonthId: { categoryId: fromCategoryId, budgetMonthId: budgetMonth.id } },
      data: { assignedCents: { decrement: amountCents } },
    });
    await tx.categoryMonth.update({
      where: { categoryId_budgetMonthId: { categoryId: toCategoryId, budgetMonthId: budgetMonth.id } },
      data: { assignedCents: { increment: amountCents } },
    });
  });

  await logAudit({ userId, action: "budget.money_moved", entityType: "Category", entityId: toCategoryId });
}

// ---------------------------------------------------------------------------
// Category groups & categories
// ---------------------------------------------------------------------------

/** Flat groups+categories list, independent of any month — used to populate pickers in forms. */
export async function listCategories(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  return prisma.categoryGroup.findMany({
    where: { budgetId, isArchived: false },
    orderBy: { sortOrder: "asc" },
    include: {
      categories: {
        where: { isArchived: false },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true, isSystem: true, linkedAccountId: true },
      },
    },
  });
}

export async function createCategoryGroup(userId: string, budgetId: string, name: string) {
  await requireBudgetOwnership(budgetId, userId);
  const count = await prisma.categoryGroup.count({ where: { budgetId } });
  const group = await prisma.categoryGroup.create({ data: { budgetId, name, sortOrder: count } });
  await logAudit({ userId, action: "category_group.created", entityType: "CategoryGroup", entityId: group.id });
  return group;
}

export async function createCategory(userId: string, budgetId: string, groupId: string, name: string) {
  await requireBudgetOwnership(budgetId, userId);
  const group = await prisma.categoryGroup.findUnique({ where: { id: groupId } });
  if (!group || group.budgetId !== budgetId) throw new NotFoundError("That category group couldn't be found.");

  const count = await prisma.category.count({ where: { groupId } });
  const category = await prisma.category.create({ data: { budgetId, groupId, name, sortOrder: count } });
  await logAudit({ userId, action: "category.created", entityType: "Category", entityId: category.id });
  return category;
}

export async function renameCategory(userId: string, budgetId: string, categoryId: string, name: string) {
  await requireBudgetOwnership(budgetId, userId);
  const category = await requireCategoryInBudget(categoryId, budgetId);
  if (category.isSystem) throw new ForbiddenError("This category is managed automatically and can't be renamed.");
  const updated = await prisma.category.update({ where: { id: categoryId }, data: { name } });
  await logAudit({ userId, action: "category.renamed", entityType: "Category", entityId: categoryId });
  return updated;
}

export async function archiveCategory(userId: string, budgetId: string, categoryId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const category = await requireCategoryInBudget(categoryId, budgetId);
  if (category.isSystem) throw new ForbiddenError("This category is managed automatically and can't be deleted.");
  const updated = await prisma.category.update({ where: { id: categoryId }, data: { isArchived: true } });
  await logAudit({ userId, action: "category.archived", entityType: "Category", entityId: categoryId });
  return updated;
}

export async function reorderCategories(
  userId: string,
  budgetId: string,
  updates: { categoryId: string; groupId: string; sortOrder: number }[],
) {
  await requireBudgetOwnership(budgetId, userId);
  await prisma.$transaction(
    updates.map((u) =>
      prisma.category.update({ where: { id: u.categoryId }, data: { groupId: u.groupId, sortOrder: u.sortOrder } }),
    ),
  );
}

export async function reorderCategoryGroups(userId: string, budgetId: string, updates: { groupId: string; sortOrder: number }[]) {
  await requireBudgetOwnership(budgetId, userId);
  await prisma.$transaction(
    updates.map((u) => prisma.categoryGroup.update({ where: { id: u.groupId }, data: { sortOrder: u.sortOrder } })),
  );
}

// ---------------------------------------------------------------------------
// Credit card auto-offset — see FINANCIAL_ENGINE.md "Credit Cards"
// ---------------------------------------------------------------------------

const CC_PAYMENT_GROUP_NAME = "Credit Card Payments";

/** Idempotently ensures a CREDIT_CARD account has its own "Payment: <Card>" category. Called from accounts.ts. */
export async function ensureCreditCardPaymentCategory(
  tx: Prisma.TransactionClient,
  budgetId: string,
  accountId: string,
  accountName: string,
) {
  const existing = await tx.category.findFirst({ where: { linkedAccountId: accountId } });
  if (existing) return existing;

  let group = await tx.categoryGroup.findFirst({ where: { budgetId, isSystem: true, name: CC_PAYMENT_GROUP_NAME } });
  if (!group) {
    const count = await tx.categoryGroup.count({ where: { budgetId } });
    group = await tx.categoryGroup.create({
      data: { budgetId, name: CC_PAYMENT_GROUP_NAME, isSystem: true, sortOrder: count },
    });
  }

  const count = await tx.category.count({ where: { groupId: group.id } });
  return tx.category.create({
    data: {
      budgetId,
      groupId: group.id,
      name: `Payment: ${accountName}`,
      isSystem: true,
      sortOrder: count,
      linkedAccountId: accountId,
    },
  });
}

/**
 * Called when a purchase is recorded against a credit card in a real
 * spending category.
 *
 * IMPORTANT: this is a single-sided credit to the card's payment category,
 * NOT a "move money" pair off the spending category. The spending
 * category's Available already drops by the purchase amount through the
 * ordinary Activity effect (its TransactionSplit) — every transaction gets
 * that regardless of payment method. If this function *also* subtracted
 * the offset from the spending category, a purchase that exactly matched
 * what was available would push that category into a phantom "overspent"
 * state (available - activity - offset = negative) even though the user
 * spent exactly what they'd budgeted. See FINANCIAL_ENGINE.md "Credit
 * Cards" for the worked example and the accounting-identity proof that a
 * single-sided credit still keeps books balanced: crediting the payment
 * category by `offset` and nothing else on the spending side reduces
 * Ready to Assign by the same `offset` (every Assignment row counts
 * toward cumulative-assigned regardless of which category it's on), which
 * is exactly the amount that's now earmarked for the card bill instead of
 * being freely assignable.
 */
export async function applyCreditCardOffset(
  tx: Prisma.TransactionClient,
  budgetId: string,
  spendingCategoryId: string,
  paymentCategoryId: string,
  month: Date,
  outflowMagnitudeCents: number,
  sourceTransactionId: string,
) {
  if (spendingCategoryId === paymentCategoryId) return;

  const normalized = monthStart(month);
  // The pending purchase hasn't been inserted yet, so "available through this
  // month" from existing rows already means "available before this txn".
  const availableBefore = await getCategoryAvailable(tx, spendingCategoryId, normalized);
  const offset = computeCreditCardOffset(cents(outflowMagnitudeCents), availableBefore);
  if (offset <= 0) return;

  const budgetMonth = await getOrCreateBudgetMonth(tx, budgetId, normalized);
  await getOrCreateCategoryMonth(tx, paymentCategoryId, budgetMonth.id);

  await tx.assignment.create({
    data: {
      categoryId: paymentCategoryId,
      budgetMonthId: budgetMonth.id,
      budgetId,
      amountCents: offset,
      kind: "CC_OFFSET",
      sourceTransactionId,
    },
  });

  await tx.categoryMonth.update({
    where: { categoryId_budgetMonthId: { categoryId: paymentCategoryId, budgetMonthId: budgetMonth.id } },
    data: { assignedCents: { increment: offset } },
  });
}

/**
 * Undoes every CC_OFFSET Assignment pair that a transaction caused (called
 * before deleting/reversing that transaction), keeping the cached
 * CategoryMonth.assignedCents sums consistent with the ledger.
 */
export async function reverseCreditCardOffsetsForTransaction(tx: Prisma.TransactionClient, transactionId: string) {
  const rows = await tx.assignment.findMany({ where: { sourceTransactionId: transactionId } });
  for (const row of rows) {
    await tx.categoryMonth.update({
      where: { categoryId_budgetMonthId: { categoryId: row.categoryId, budgetMonthId: row.budgetMonthId } },
      data: { assignedCents: { decrement: row.amountCents } },
    });
  }
  await tx.assignment.deleteMany({ where: { sourceTransactionId: transactionId } });
}

export { cumulativeAssigned as _cumulativeAssigned, ZERO };
