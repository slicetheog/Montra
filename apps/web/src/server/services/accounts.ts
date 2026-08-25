import "server-only";
import { prisma } from "@montra/db";
import { ConflictError, NotFoundError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { ensureCreditCardPaymentCategory } from "@/server/services/budget";
import { findOrCreatePayee } from "@/server/services/payees";
import { logAudit } from "@/server/services/audit";
import type { AccountType } from "@prisma/client";

/** Account types that participate in day-to-day budgeting by default. */
const ON_BUDGET_DEFAULT: Record<AccountType, boolean> = {
  CHECKING: true,
  SAVINGS: true,
  CASH: true,
  CREDIT_CARD: true,
  INVESTMENT: false,
  LOAN: false,
  OTHER_ASSET: false,
  OTHER_LIABILITY: false,
};

export async function requireAccountInBudget(accountId: string, budgetId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.budgetId !== budgetId) throw new NotFoundError("That account couldn't be found.");
  return account;
}

export interface CreateAccountInput {
  name: string;
  type: AccountType;
  institution?: string;
  notes?: string;
  onBudget?: boolean;
  startingBalanceCents: number;
  startingDate?: Date;
}

export async function createAccount(userId: string, budgetId: string, input: CreateAccountInput) {
  await requireBudgetOwnership(budgetId, userId);

  const account = await prisma.$transaction(async (tx) => {
    const created = await tx.account.create({
      data: {
        budgetId,
        name: input.name,
        type: input.type,
        institution: input.institution,
        notes: input.notes,
        onBudget: input.onBudget ?? ON_BUDGET_DEFAULT[input.type],
      },
    });

    if (input.type === "CREDIT_CARD") {
      await ensureCreditCardPaymentCategory(tx, budgetId, created.id, created.name);
    }

    if (input.startingBalanceCents !== 0) {
      const startingPayee = await findOrCreatePayee(tx, budgetId, "Starting Balance");
      await tx.transaction.create({
        data: {
          budgetId,
          accountId: created.id,
          payeeId: startingPayee.id,
          date: input.startingDate ?? new Date(),
          amountCents: input.startingBalanceCents,
          memo: "Starting balance",
          type: input.startingBalanceCents >= 0 ? "INCOME" : "EXPENSE",
          cleared: "CLEARED",
          splits: { create: [{ amountCents: input.startingBalanceCents, categoryId: null }] },
        },
      });
    }

    return created;
  });

  await logAudit({ userId, action: "account.created", entityType: "Account", entityId: account.id });
  return account;
}

export interface AccountBalances {
  currentCents: number;
  clearedCents: number;
  unclearedCents: number;
}

export async function getAccountBalances(accountIds: string[]): Promise<Record<string, AccountBalances>> {
  if (accountIds.length === 0) return {};

  const grouped = await prisma.transaction.groupBy({
    by: ["accountId", "cleared"],
    where: { accountId: { in: accountIds } },
    _sum: { amountCents: true },
  });

  const result: Record<string, AccountBalances> = {};
  for (const id of accountIds) result[id] = { currentCents: 0, clearedCents: 0, unclearedCents: 0 };

  for (const row of grouped) {
    const sum = row._sum.amountCents ?? 0;
    const bucket = result[row.accountId];
    bucket.currentCents += sum;
    if (row.cleared === "UNCLEARED") bucket.unclearedCents += sum;
    else bucket.clearedCents += sum;
  }
  return result;
}

export async function listAccounts(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const accounts = await prisma.account.findMany({
    where: { budgetId },
    orderBy: [{ isClosed: "asc" }, { createdAt: "asc" }],
    include: { debt: true },
  });
  const balances = await getAccountBalances(accounts.map((a) => a.id));
  return accounts.map((a) => ({ ...a, balances: balances[a.id] }));
}

export async function getAccount(userId: string, budgetId: string, accountId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const account = await requireAccountInBudget(accountId, budgetId);
  const balances = await getAccountBalances([accountId]);
  return { ...account, balances: balances[accountId] };
}

export interface UpdateAccountInput {
  name?: string;
  institution?: string | null;
  notes?: string | null;
  isClosed?: boolean;
  onBudget?: boolean;
}

export async function updateAccount(userId: string, budgetId: string, accountId: string, patch: UpdateAccountInput) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(accountId, budgetId);
  const updated = await prisma.account.update({ where: { id: accountId }, data: patch });
  await logAudit({ userId, action: "account.updated", entityType: "Account", entityId: accountId });
  return updated;
}

export async function deleteAccount(userId: string, budgetId: string, accountId: string) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(accountId, budgetId);

  const transactionCount = await prisma.transaction.count({ where: { accountId } });
  if (transactionCount > 0) {
    throw new ConflictError(
      "This account has transactions on it, so it can't be deleted. Close it instead to keep your history.",
    );
  }

  await prisma.account.delete({ where: { id: accountId } });
  await logAudit({ userId, action: "account.deleted", entityType: "Account", entityId: accountId });
}
