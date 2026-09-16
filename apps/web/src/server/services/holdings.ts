import "server-only";
import { prisma } from "@montra/db";
import { cents, computeHoldingGainLoss, summarizePortfolio } from "@montra/domain";
import { ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { findOrCreatePayee } from "@/server/services/payees";
import { logAudit } from "@/server/services/audit";

async function requireInvestmentAccount(accountId: string, budgetId: string) {
  const account = await requireAccountInBudget(accountId, budgetId);
  if (account.type !== "INVESTMENT") {
    throw new ValidationError("Holdings can only be added to an Investment account.");
  }
  return account;
}

export interface HoldingInput {
  name: string;
  symbol?: string | null;
  quantity: number;
  currentPriceCents: number;
  costBasisCents?: number | null;
}

function withGainLoss<T extends { quantity: number; currentPriceCents: number; costBasisCents: number | null }>(
  holding: T,
) {
  const { marketValueCents, gainLossCents, gainLossPercent } = computeHoldingGainLoss({
    quantity: holding.quantity,
    currentPriceCents: cents(holding.currentPriceCents),
    costBasisCents: holding.costBasisCents == null ? null : cents(holding.costBasisCents),
  });
  return { ...holding, marketValueCents, gainLossCents, gainLossPercent };
}

export async function listHoldings(userId: string, budgetId: string, accountId: string) {
  await requireBudgetOwnership(budgetId, userId);
  await requireInvestmentAccount(accountId, budgetId);
  const holdings = await prisma.holding.findMany({
    where: { accountId },
    orderBy: { createdAt: "asc" },
    include: { snapshots: { orderBy: { recordedAt: "asc" } } },
  });
  return holdings.map(withGainLoss);
}

export async function createHolding(userId: string, budgetId: string, accountId: string, input: HoldingInput) {
  await requireBudgetOwnership(budgetId, userId);
  await requireInvestmentAccount(accountId, budgetId);

  const holding = await prisma.$transaction(async (tx) => {
    const created = await tx.holding.create({
      data: {
        accountId,
        name: input.name,
        symbol: input.symbol || null,
        quantity: input.quantity,
        currentPriceCents: input.currentPriceCents,
        costBasisCents: input.costBasisCents ?? null,
      },
    });
    await tx.holdingSnapshot.create({
      data: { holdingId: created.id, quantity: created.quantity, priceCents: created.currentPriceCents },
    });
    return created;
  });

  await logAudit({ userId, action: "holding.created", entityType: "Holding", entityId: holding.id });
  return withGainLoss(holding);
}

export interface UpdateHoldingInput {
  name?: string;
  symbol?: string | null;
  quantity?: number;
  currentPriceCents?: number;
  costBasisCents?: number | null;
}

/**
 * Updates a holding's details. Whenever quantity or price actually
 * changes, appends a HoldingSnapshot row first — this is the only "price
 * history" this app has (no live feed), so a change that isn't recorded
 * here is a change that never shows up in the holding's performance chart.
 */
export async function updateHolding(
  userId: string,
  budgetId: string,
  accountId: string,
  holdingId: string,
  patch: UpdateHoldingInput,
) {
  await requireBudgetOwnership(budgetId, userId);
  await requireInvestmentAccount(accountId, budgetId);
  const existing = await prisma.holding.findUnique({ where: { id: holdingId } });
  if (!existing || existing.accountId !== accountId) {
    throw new ValidationError("That holding couldn't be found.");
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.holding.update({ where: { id: holdingId }, data: patch });
    const quantityChanged = patch.quantity !== undefined && patch.quantity !== existing.quantity;
    const priceChanged = patch.currentPriceCents !== undefined && patch.currentPriceCents !== existing.currentPriceCents;
    if (quantityChanged || priceChanged) {
      await tx.holdingSnapshot.create({
        data: { holdingId, quantity: result.quantity, priceCents: result.currentPriceCents },
      });
    }
    return result;
  });

  await logAudit({ userId, action: "holding.updated", entityType: "Holding", entityId: holdingId });
  return withGainLoss(updated);
}

export async function deleteHolding(userId: string, budgetId: string, accountId: string, holdingId: string) {
  await requireBudgetOwnership(budgetId, userId);
  await requireInvestmentAccount(accountId, budgetId);
  const existing = await prisma.holding.findUnique({ where: { id: holdingId } });
  if (!existing || existing.accountId !== accountId) {
    throw new ValidationError("That holding couldn't be found.");
  }
  await prisma.holding.delete({ where: { id: holdingId } });
  await logAudit({ userId, action: "holding.deleted", entityType: "Holding", entityId: holdingId });
}

/** Aggregate holdings across every Investment account in the budget, for the Net Worth page. */
export async function getPortfolioSummary(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const holdings = await prisma.holding.findMany({
    where: { account: { budgetId, type: "INVESTMENT" } },
    select: { quantity: true, currentPriceCents: true, costBasisCents: true },
  });
  return summarizePortfolio(
    holdings.map((h) => ({
      quantity: h.quantity,
      currentPriceCents: cents(h.currentPriceCents),
      costBasisCents: h.costBasisCents == null ? null : cents(h.costBasisCents),
    })),
  );
}

/**
 * Brings the account's transaction ledger in line with what its holdings
 * currently say it's worth, by logging a single adjustment transaction for
 * the gap — the same "adjustment transaction closes the gap" pattern
 * reconciliation.ts uses, so an account's balance keeps having exactly one
 * source of truth (its transactions) even though holdings are tracked
 * separately.
 */
export async function syncAccountValueToHoldings(userId: string, budgetId: string, accountId: string) {
  await requireBudgetOwnership(budgetId, userId);
  await requireInvestmentAccount(accountId, budgetId);

  const [holdings, ledgerAgg] = await Promise.all([
    prisma.holding.findMany({ where: { accountId }, select: { quantity: true, currentPriceCents: true } }),
    prisma.transaction.aggregate({ where: { accountId }, _sum: { amountCents: true } }),
  ]);

  const targetCents = summarizePortfolio(
    holdings.map((h) => ({ quantity: h.quantity, currentPriceCents: cents(h.currentPriceCents), costBasisCents: null })),
  ).totalMarketValueCents;
  const currentCents = ledgerAgg._sum.amountCents ?? 0;
  const adjustmentCents = targetCents - currentCents;

  if (adjustmentCents === 0) {
    return { adjusted: false, adjustmentCents: 0 };
  }

  await prisma.$transaction(async (tx) => {
    const payee = await findOrCreatePayee(tx, budgetId, "Market Value Update");
    await tx.transaction.create({
      data: {
        budgetId,
        accountId,
        payeeId: payee.id,
        date: new Date(),
        amountCents: adjustmentCents,
        memo: "Balance adjustment to match holdings' market value",
        type: adjustmentCents >= 0 ? "INCOME" : "EXPENSE",
        cleared: "CLEARED",
        splits: { create: [{ amountCents: adjustmentCents, categoryId: null }] },
      },
    });
  });

  await logAudit({ userId, action: "account.value_synced", entityType: "Account", entityId: accountId });
  return { adjusted: true, adjustmentCents };
}
