import "server-only";
import { prisma } from "@montra/db";
import { formatMonthKey, monthRange, monthStart } from "@montra/domain";
import { requireBudgetOwnership } from "@/server/services/budgets";

export interface DateRange {
  from?: Date;
  to?: Date;
}

export async function spendingByCategory(userId: string, budgetId: string, range: DateRange) {
  await requireBudgetOwnership(budgetId, userId);
  const rows = await prisma.transactionSplit.groupBy({
    by: ["categoryId"],
    where: {
      categoryId: { not: null },
      amountCents: { lt: 0 },
      // Exclude transfers: a credit-card payment auto-categorizes its
      // checking-side leg into "Payment: <Card>" (see budget.ts), which is
      // money moving between your own accounts, not new spending — the
      // original purchase already counted once, in its real category.
      transaction: { budgetId, type: { not: "TRANSFER" }, date: { gte: range.from, lte: range.to } },
    },
    _sum: { amountCents: true },
  });

  const categories = await prisma.category.findMany({
    where: { id: { in: rows.map((r) => r.categoryId!).filter(Boolean) } },
    select: { id: true, name: true, group: { select: { name: true } } },
  });
  const byId = new Map(categories.map((c) => [c.id, c]));

  return rows
    .map((r) => ({
      categoryId: r.categoryId!,
      categoryName: byId.get(r.categoryId!)?.name ?? "Unknown",
      groupName: byId.get(r.categoryId!)?.group.name ?? "",
      amountCents: Math.abs(r._sum.amountCents ?? 0),
    }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export async function spendingByPayee(userId: string, budgetId: string, range: DateRange) {
  await requireBudgetOwnership(budgetId, userId);
  const rows = await prisma.transaction.groupBy({
    by: ["payeeId"],
    where: { budgetId, type: { in: ["EXPENSE", "CREDIT_CARD_PAYMENT"] }, payeeId: { not: null }, date: { gte: range.from, lte: range.to } },
    _sum: { amountCents: true },
  });
  const payees = await prisma.payee.findMany({
    where: { id: { in: rows.map((r) => r.payeeId!).filter(Boolean) } },
    select: { id: true, name: true },
  });
  const byId = new Map(payees.map((p) => [p.id, p.name]));

  return rows
    .map((r) => ({ payeeId: r.payeeId!, payeeName: byId.get(r.payeeId!) ?? "Unknown", amountCents: Math.abs(r._sum.amountCents ?? 0) }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

/** Monthly income vs. expense (and net cash flow), across `months` trailing months up to `asOf`. */
export async function incomeVsExpense(userId: string, budgetId: string, months: number, asOf = new Date()) {
  await requireBudgetOwnership(budgetId, userId);
  const from = monthStart(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (months - 1), 1)));
  const to = asOf;

  const transactions = await prisma.transaction.findMany({
    where: { budgetId, date: { gte: from, lte: to }, type: { not: "TRANSFER" } },
    select: { date: true, amountCents: true },
  });

  const buckets = new Map<string, { incomeCents: number; expenseCents: number }>();
  for (const month of monthRange(from, to)) buckets.set(formatMonthKey(month), { incomeCents: 0, expenseCents: 0 });

  for (const txn of transactions) {
    const key = formatMonthKey(txn.date);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    if (txn.amountCents >= 0) bucket.incomeCents += txn.amountCents;
    else bucket.expenseCents += Math.abs(txn.amountCents);
  }

  return Array.from(buckets.entries()).map(([month, v]) => ({
    month,
    incomeCents: v.incomeCents,
    expenseCents: v.expenseCents,
    netCents: v.incomeCents - v.expenseCents,
  }));
}

export async function categoryTrend(userId: string, budgetId: string, categoryId: string, months: number, asOf = new Date()) {
  await requireBudgetOwnership(budgetId, userId);
  const from = monthStart(new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (months - 1), 1)));

  const splits = await prisma.transactionSplit.findMany({
    where: { categoryId, transaction: { budgetId, date: { gte: from, lte: asOf } } },
    select: { amountCents: true, transaction: { select: { date: true } } },
  });

  const buckets = new Map<string, number>();
  for (const month of monthRange(from, asOf)) buckets.set(formatMonthKey(month), 0);
  for (const split of splits) {
    const key = formatMonthKey(split.transaction.date);
    buckets.set(key, (buckets.get(key) ?? 0) + Math.abs(Math.min(0, split.amountCents)));
  }

  return Array.from(buckets.entries()).map(([month, amountCents]) => ({ month, amountCents }));
}
