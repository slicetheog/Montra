import "server-only";
import { prisma } from "@montra/db";
import { cents, computeReconciliationAdjustment } from "@montra/domain";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { findOrCreatePayee } from "@/server/services/payees";
import { logAudit } from "@/server/services/audit";

/**
 * Simplified reconciliation: every CLEARED transaction on or before the
 * statement date is marked RECONCILED (locking it from further edits/
 * deletion — see transactions.ts), and any gap between the statement
 * balance and that reconciled total becomes a single, clearly-labeled
 * adjustment transaction. This intentionally does not offer a
 * per-transaction "which of these cleared" checklist (a fuller
 * reconciliation UI is a natural follow-up) — documented in
 * FINANCIAL_ENGINE.md.
 */
export async function reconcileAccount(
  userId: string,
  budgetId: string,
  accountId: string,
  statementDate: Date,
  statementBalanceCents: number,
) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(accountId, budgetId);

  const reconciliation = await prisma.$transaction(async (tx) => {
    await tx.transaction.updateMany({
      where: { accountId, cleared: "CLEARED", date: { lte: statementDate } },
      data: { cleared: "RECONCILED" },
    });

    const clearedAgg = await tx.transaction.aggregate({
      where: { accountId, cleared: "RECONCILED" },
      _sum: { amountCents: true },
    });
    const currentCents = cents(clearedAgg._sum.amountCents ?? 0);
    const { adjustmentCents, isBalanced } = computeReconciliationAdjustment(cents(statementBalanceCents), currentCents);

    let adjustmentTransactionId: string | null = null;
    if (!isBalanced) {
      const payee = await findOrCreatePayee(tx, budgetId, "Reconciliation Adjustment");
      const adjustmentTxn = await tx.transaction.create({
        data: {
          budgetId,
          accountId,
          payeeId: payee.id,
          date: statementDate,
          amountCents: adjustmentCents,
          memo: "Balance adjustment from reconciliation",
          type: adjustmentCents >= 0 ? "INCOME" : "EXPENSE",
          cleared: "RECONCILED",
          splits: { create: [{ amountCents: adjustmentCents, categoryId: null }] },
        },
      });
      adjustmentTransactionId = adjustmentTxn.id;
    }

    return tx.reconciliation.create({
      data: { accountId, statementDate, statementBalanceCents, previousBalanceCents: currentCents, adjustmentTransactionId },
    });
  });

  await logAudit({ userId, action: "account.reconciled", entityType: "Account", entityId: accountId });
  return reconciliation;
}

export async function listReconciliations(userId: string, budgetId: string, accountId: string) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(accountId, budgetId);
  return prisma.reconciliation.findMany({ where: { accountId }, orderBy: { statementDate: "desc" } });
}
