import "server-only";
import { prisma } from "@montra/db";
import { requireBudgetOwnership } from "@/server/services/budgets";

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function exportTransactionsCsv(userId: string, budgetId: string): Promise<string> {
  await requireBudgetOwnership(budgetId, userId);
  const transactions = await prisma.transaction.findMany({
    where: { budgetId },
    orderBy: { date: "desc" },
    include: {
      account: { select: { name: true } },
      payee: { select: { name: true } },
      splits: { include: { category: { select: { name: true } } } },
    },
  });

  const header = ["Date", "Payee", "Category", "Account", "Memo", "Outflow", "Inflow", "Cleared"];
  const rows = [header];

  for (const txn of transactions) {
    const categoryLabel = txn.isSplit
      ? "Split"
      : (txn.splits[0]?.category?.name ?? (txn.type === "TRANSFER" ? "Transfer" : "Uncategorized"));
    const outflow = txn.amountCents < 0 ? (Math.abs(txn.amountCents) / 100).toFixed(2) : "";
    const inflow = txn.amountCents >= 0 ? (txn.amountCents / 100).toFixed(2) : "";
    rows.push([
      txn.date.toISOString().slice(0, 10),
      txn.payee?.name ?? "",
      categoryLabel,
      txn.account.name,
      txn.memo ?? "",
      outflow,
      inflow,
      txn.cleared,
    ]);
  }

  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
}
