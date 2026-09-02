import "server-only";
import { prisma } from "@montra/db";
import { z } from "zod";
import { ValidationError } from "@/server/api-helpers";
import { logAudit } from "@/server/services/audit";

/**
 * Portable JSON backup format (spec section 25). Every entity keeps its
 * *original* database id in the export purely as a stable cross-reference
 * key for the other entities in the same file (e.g. a transaction's
 * `accountId`) — restoreBackup() never reuses these ids, it always creates
 * fresh rows and remaps every reference through an old-id -> new-id table,
 * so a backup can be restored any number of times (or into a different
 * account) without ever colliding with existing data.
 *
 * Deliberately excluded: sessions, audit logs, purchases/entitlement,
 * imports, reconciliations, notifications — operational/security state,
 * not budgeting data, and out of scope per spec section 25's own list.
 */
const BACKUP_VERSION = 1;

export async function exportBackup(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      settings: true,
      budgets: {
        include: {
          categoryGroups: { include: { categories: true } },
          accounts: { include: { debt: true } },
          payees: true,
          months: true,
          transactions: { include: { splits: true, tags: true } },
          goals: true,
          recurring: true,
          tags: true,
        },
      },
    },
  });

  // Assignments aren't nested under Budget in Prisma's relation graph the
  // same way, so fetch them per-budget explicitly.
  const budgetsWithAssignments = await Promise.all(
    user.budgets.map(async (budget) => ({
      ...budget,
      assignments: await prisma.assignment.findMany({ where: { budgetId: budget.id } }),
    })),
  );

  await logAudit({ userId, action: "backup.exported", entityType: "User", entityId: userId });

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: user.settings
      ? {
          currency: user.settings.currency,
          dateFormat: user.settings.dateFormat,
          firstDayOfMonth: user.settings.firstDayOfMonth,
          theme: user.settings.theme,
          notificationsEnabled: user.settings.notificationsEnabled,
        }
      : null,
    budgets: budgetsWithAssignments,
  };
}

// Loose validation: we mainly need structural shape (arrays of objects with
// ids); financial values are re-validated implicitly by Prisma's typed
// columns on insert.
const backupSchema = z.object({
  version: z.number(),
  budgets: z.array(z.record(z.string(), z.unknown())),
  settings: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function restoreBackup(userId: string, raw: unknown) {
  const parsed = backupSchema.safeParse(raw);
  if (!parsed.success) throw new ValidationError("That doesn't look like a Montra backup file.");
  if (parsed.data.version > BACKUP_VERSION) {
    throw new ValidationError("This backup was made with a newer version of Montra than this app supports.");
  }

  const data = parsed.data as unknown as Awaited<ReturnType<typeof exportBackup>>;
  let restoredBudgets = 0;

  for (const budget of data.budgets) {
    await restoreOneBudget(userId, budget);
    restoredBudgets += 1;
  }

  await logAudit({ userId, action: "backup.restored", entityType: "User", entityId: userId, metadata: { restoredBudgets } });
  return { restoredBudgets };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function restoreOneBudget(userId: string, budget: any) {
  await prisma.$transaction(
    async (tx) => {
      const newBudget = await tx.budget.create({
        data: { userId, name: `${budget.name} (Restored)`, currency: budget.currency ?? "USD" },
      });

      const groupIdMap = new Map<string, string>();
      for (const group of budget.categoryGroups ?? []) {
        const newGroup = await tx.categoryGroup.create({
          data: { budgetId: newBudget.id, name: group.name, sortOrder: group.sortOrder ?? 0, isSystem: false, isArchived: group.isArchived ?? false },
        });
        groupIdMap.set(group.id, newGroup.id);
      }

      const accountIdMap = new Map<string, string>();
      for (const account of budget.accounts ?? []) {
        const newAccount = await tx.account.create({
          data: {
            budgetId: newBudget.id,
            name: account.name,
            type: account.type,
            institution: account.institution,
            notes: account.notes,
            isClosed: account.isClosed ?? false,
            onBudget: account.onBudget ?? true,
          },
        });
        accountIdMap.set(account.id, newAccount.id);
        if (account.debt) {
          await tx.debt.create({
            data: {
              accountId: newAccount.id,
              originalBalanceCents: account.debt.originalBalanceCents,
              interestRateBps: account.debt.interestRateBps,
              minimumPaymentCents: account.debt.minimumPaymentCents,
              dueDayOfMonth: account.debt.dueDayOfMonth,
            },
          });
        }
      }

      const categoryIdMap = new Map<string, string>();
      // Two passes: create categories first, then wire linkedAccountId (a
      // category can reference an account, e.g. auto CC payment categories).
      for (const group of budget.categoryGroups ?? []) {
        for (const category of group.categories ?? []) {
          const newCategory = await tx.category.create({
            data: {
              budgetId: newBudget.id,
              groupId: groupIdMap.get(group.id)!,
              name: category.name,
              sortOrder: category.sortOrder ?? 0,
              isSystem: category.isSystem ?? false,
              isArchived: category.isArchived ?? false,
            },
          });
          categoryIdMap.set(category.id, newCategory.id);
        }
      }
      for (const group of budget.categoryGroups ?? []) {
        for (const category of group.categories ?? []) {
          if (category.linkedAccountId && accountIdMap.has(category.linkedAccountId)) {
            await tx.category.update({
              where: { id: categoryIdMap.get(category.id)! },
              data: { linkedAccountId: accountIdMap.get(category.linkedAccountId) },
            });
          }
        }
      }

      const payeeIdMap = new Map<string, string>();
      for (const payee of budget.payees ?? []) {
        const newPayee = await tx.payee.create({
          data: { budgetId: newBudget.id, name: payee.name },
        });
        payeeIdMap.set(payee.id, newPayee.id);
      }
      for (const payee of budget.payees ?? []) {
        if (payee.defaultCategoryId && categoryIdMap.has(payee.defaultCategoryId)) {
          await tx.payee.update({
            where: { id: payeeIdMap.get(payee.id)! },
            data: { defaultCategoryId: categoryIdMap.get(payee.defaultCategoryId) },
          });
        }
      }

      const tagIdMap = new Map<string, string>();
      for (const tag of budget.tags ?? []) {
        const newTag = await tx.tag.create({ data: { budgetId: newBudget.id, name: tag.name } });
        tagIdMap.set(tag.id, newTag.id);
      }

      const monthIdMap = new Map<string, string>();
      for (const month of budget.months ?? []) {
        const newMonth = await tx.budgetMonth.create({ data: { budgetId: newBudget.id, month: new Date(month.month) } });
        monthIdMap.set(month.id, newMonth.id);
      }

      const transactionIdMap = new Map<string, string>();
      for (const txn of budget.transactions ?? []) {
        if (!accountIdMap.has(txn.accountId)) continue;
        const newTxn = await tx.transaction.create({
          data: {
            budgetId: newBudget.id,
            accountId: accountIdMap.get(txn.accountId)!,
            payeeId: txn.payeeId ? payeeIdMap.get(txn.payeeId) : undefined,
            date: new Date(txn.date),
            amountCents: txn.amountCents,
            memo: txn.memo,
            type: txn.type,
            cleared: txn.cleared,
            isSplit: txn.isSplit ?? false,
            transferAccountId: txn.transferAccountId ? accountIdMap.get(txn.transferAccountId) : undefined,
          },
        });
        transactionIdMap.set(txn.id, newTxn.id);
        const newTagIds = (txn.tags ?? [])
          .map((t: { tagId: string }) => tagIdMap.get(t.tagId))
          .filter((id: string | undefined): id is string => Boolean(id));
        if (newTagIds.length > 0) {
          await tx.transactionTag.createMany({ data: newTagIds.map((tagId: string) => ({ transactionId: newTxn.id, tagId })) });
        }
        for (const split of txn.splits ?? []) {
          await tx.transactionSplit.create({
            data: {
              transactionId: newTxn.id,
              categoryId: split.categoryId ? categoryIdMap.get(split.categoryId) : undefined,
              amountCents: split.amountCents,
              memo: split.memo,
            },
          });
        }
      }
      // Second pass: wire transfer pairs now that both legs exist.
      for (const txn of budget.transactions ?? []) {
        if (txn.transferPeerId && transactionIdMap.has(txn.id) && transactionIdMap.has(txn.transferPeerId)) {
          await tx.transaction.update({
            where: { id: transactionIdMap.get(txn.id)! },
            data: { transferPeerId: transactionIdMap.get(txn.transferPeerId) },
          });
        }
      }

      const assignmentIdMap = new Map<string, string>();
      for (const assignment of budget.assignments ?? []) {
        if (!categoryIdMap.has(assignment.categoryId) || !monthIdMap.has(assignment.budgetMonthId)) continue;
        const newAssignment = await tx.assignment.create({
          data: {
            categoryId: categoryIdMap.get(assignment.categoryId)!,
            budgetMonthId: monthIdMap.get(assignment.budgetMonthId)!,
            budgetId: newBudget.id,
            amountCents: assignment.amountCents,
            kind: assignment.kind,
            memo: assignment.memo,
            sourceTransactionId: assignment.sourceTransactionId ? transactionIdMap.get(assignment.sourceTransactionId) : undefined,
          },
        });
        assignmentIdMap.set(assignment.id, newAssignment.id);
      }
      for (const assignment of budget.assignments ?? []) {
        if (assignment.pairedWithId && assignmentIdMap.has(assignment.id) && assignmentIdMap.has(assignment.pairedWithId)) {
          await tx.assignment.update({
            where: { id: assignmentIdMap.get(assignment.id)! },
            data: { pairedWithId: assignmentIdMap.get(assignment.pairedWithId) },
          });
        }
      }

      // Rebuild the CategoryMonth cache from the restored Assignment ledger.
      const totals = new Map<string, number>();
      for (const [, newCategoryId] of categoryIdMap) {
        for (const [, newMonthId] of monthIdMap) {
          totals.set(`${newCategoryId}:${newMonthId}`, 0);
        }
      }
      const restoredAssignments = await tx.assignment.findMany({ where: { budgetId: newBudget.id } });
      for (const a of restoredAssignments) {
        const key = `${a.categoryId}:${a.budgetMonthId}`;
        totals.set(key, (totals.get(key) ?? 0) + a.amountCents);
      }
      for (const [key, sum] of totals) {
        if (sum === 0) continue;
        const [categoryId, budgetMonthId] = key.split(":");
        await tx.categoryMonth.create({ data: { categoryId, budgetMonthId, assignedCents: sum } });
      }

      for (const goal of budget.goals ?? []) {
        if (goal.categoryId && !categoryIdMap.has(goal.categoryId)) continue;
        if (goal.accountId && !accountIdMap.has(goal.accountId)) continue;
        await tx.goal.create({
          data: {
            budgetId: newBudget.id,
            categoryId: goal.categoryId ? categoryIdMap.get(goal.categoryId) : undefined,
            accountId: goal.accountId ? accountIdMap.get(goal.accountId) : undefined,
            name: goal.name,
            type: goal.type,
            targetAmountCents: goal.targetAmountCents,
            targetDate: goal.targetDate ? new Date(goal.targetDate) : undefined,
            monthlyContributionCents: goal.monthlyContributionCents,
          },
        });
      }

      for (const series of budget.recurring ?? []) {
        if (!accountIdMap.has(series.accountId)) continue;
        await tx.recurringTransaction.create({
          data: {
            budgetId: newBudget.id,
            accountId: accountIdMap.get(series.accountId)!,
            payeeId: series.payeeId ? payeeIdMap.get(series.payeeId) : undefined,
            categoryId: series.categoryId ? categoryIdMap.get(series.categoryId) : undefined,
            amountCents: series.amountCents,
            memo: series.memo,
            type: series.type,
            frequency: series.frequency,
            intervalCount: series.intervalCount ?? 1,
            startDate: new Date(series.startDate),
            endDate: series.endDate ? new Date(series.endDate) : undefined,
            occurrencesLimit: series.occurrencesLimit,
            occurrencesCreated: series.occurrencesCreated ?? 0,
            nextOccurrenceDate: new Date(series.nextOccurrenceDate),
            reminderDaysBefore: series.reminderDaysBefore,
            autoCreate: series.autoCreate ?? false,
            isActive: series.isActive ?? true,
          },
        });
      }
    },
    { timeout: 30000 },
  );
}
