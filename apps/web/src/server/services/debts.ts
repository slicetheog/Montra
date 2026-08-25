import "server-only";
import { prisma } from "@montra/db";
import type { AccountType } from "@prisma/client";
import { cents, computeDebtPayoffProjection } from "@montra/domain";
import { ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { logAudit } from "@/server/services/audit";

const DEBT_ACCOUNT_TYPES: AccountType[] = ["CREDIT_CARD", "LOAN", "OTHER_LIABILITY"];
const DEBT_ACCOUNT_TYPE_SET = new Set<AccountType>(DEBT_ACCOUNT_TYPES);

export interface UpsertDebtInput {
  originalBalanceCents: number;
  interestRateBps: number;
  minimumPaymentCents: number;
  dueDayOfMonth?: number;
}

export async function upsertDebtDetails(userId: string, budgetId: string, accountId: string, input: UpsertDebtInput) {
  await requireBudgetOwnership(budgetId, userId);
  const account = await requireAccountInBudget(accountId, budgetId);
  if (!DEBT_ACCOUNT_TYPE_SET.has(account.type)) {
    throw new ValidationError("Only credit card, loan, and other liability accounts can track debt details.");
  }

  const debt = await prisma.debt.upsert({
    where: { accountId },
    update: input,
    create: { accountId, ...input },
  });
  await logAudit({ userId, action: "debt.updated", entityType: "Account", entityId: accountId });
  return debt;
}

export async function listDebts(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const accounts = await prisma.account.findMany({
    where: { budgetId, type: { in: DEBT_ACCOUNT_TYPES }, debt: { isNot: null } },
    include: { debt: true },
  });

  const now = new Date();

  return Promise.all(
    accounts.map(async (account) => {
      const balanceAgg = await prisma.transaction.aggregate({
        where: { accountId: account.id },
        _sum: { amountCents: true },
      });
      const currentBalanceCents = cents(balanceAgg._sum.amountCents ?? 0); // negative = owed
      const debt = account.debt!;
      const projection = computeDebtPayoffProjection({
        balanceCents: currentBalanceCents,
        annualRateBps: debt.interestRateBps,
        monthlyPaymentCents: cents(debt.minimumPaymentCents),
        asOf: now,
      });

      return {
        accountId: account.id,
        accountName: account.name,
        currentBalanceCents,
        debt,
        projection,
      };
    }),
  );
}

export async function getDebtSummary(userId: string, budgetId: string) {
  const debts = await listDebts(userId, budgetId);
  const totalDebtCents = debts.reduce((sum, d) => sum + Math.abs(d.currentBalanceCents), 0);
  return { debts, totalDebtCents };
}
