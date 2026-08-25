import "server-only";
import { prisma } from "@montra/db";
import { cents, computeNetWorth, monthEndExclusive, monthRange, monthStart } from "@montra/domain";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { ASSET_ACCOUNT_TYPES } from "@/lib/constants";

export async function getNetWorthNow(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const accounts = await prisma.account.findMany({ where: { budgetId }, select: { id: true, name: true, type: true } });

  const sums = await prisma.transaction.groupBy({
    by: ["accountId"],
    where: { accountId: { in: accounts.map((a) => a.id) } },
    _sum: { amountCents: true },
  });
  const balanceByAccount = new Map(sums.map((s) => [s.accountId, s._sum.amountCents ?? 0]));

  const assets = accounts
    .filter((a) => ASSET_ACCOUNT_TYPES.has(a.type))
    .map((a) => ({ ...a, balanceCents: balanceByAccount.get(a.id) ?? 0 }));
  const liabilities = accounts
    .filter((a) => !ASSET_ACCOUNT_TYPES.has(a.type))
    .map((a) => ({ ...a, balanceCents: balanceByAccount.get(a.id) ?? 0 }));

  const netWorthCents = computeNetWorth(accounts.map((a) => cents(balanceByAccount.get(a.id) ?? 0)));
  const totalAssetsCents = assets.reduce((sum, a) => sum + a.balanceCents, 0);
  const totalLiabilitiesCents = Math.abs(liabilities.reduce((sum, a) => sum + a.balanceCents, 0));

  return { netWorthCents, totalAssetsCents, totalLiabilitiesCents, assets, liabilities };
}

/** Reconstructs net worth at the end of each of the last `months` months from the transaction ledger. */
export async function getNetWorthHistory(userId: string, budgetId: string, months: number, asOf = new Date()) {
  await requireBudgetOwnership(budgetId, userId);
  const from = monthStart(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (months - 1), 1)));

  const transactions = await prisma.transaction.findMany({
    where: { budgetId, date: { lte: monthEndExclusive(asOf) } },
    select: { date: true, amountCents: true },
    orderBy: { date: "asc" },
  });

  const monthsList = monthRange(from, asOf);
  const results: { month: string; netWorthCents: number }[] = [];

  for (const month of monthsList) {
    const cutoff = monthEndExclusive(month);
    const total = transactions.filter((t) => t.date < cutoff).reduce((sum, t) => sum + t.amountCents, 0);
    results.push({ month: month.toISOString().slice(0, 7), netWorthCents: total });
  }

  return results;
}
