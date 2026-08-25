import "server-only";
import { prisma } from "@montra/db";
import { cents, findLikelyDuplicate, normalizePayeeText } from "@montra/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { requireAccountInBudget } from "@/server/services/accounts";
import { createTransaction } from "@/server/services/transactions";
import { logAudit } from "@/server/services/audit";

export interface CsvRow {
  date: Date;
  payee: string;
  amountCents: number;
  memo?: string;
}

/**
 * Stages a CSV import: persists every row (so the preview survives a page
 * reload) with duplicate detection already run against this account's
 * existing ledger. Nothing becomes a real Transaction until commitImport()
 * — spec: "NEVER silently import obvious duplicates" / "Show an import
 * preview before committing."
 */
export async function stageImport(userId: string, budgetId: string, accountId: string, filename: string, rows: CsvRow[]) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAccountInBudget(accountId, budgetId);
  if (rows.length === 0) throw new ValidationError("That file didn't have any rows to import.");
  if (rows.length > 5000) throw new ValidationError("That file has too many rows (max 5,000 per import).");

  const existingTransactions = await prisma.transaction.findMany({
    where: { accountId },
    select: { id: true, date: true, amountCents: true, payee: { select: { name: true } } },
  });
  const existingForDedup = existingTransactions.map((t) => ({
    id: t.id,
    date: t.date,
    amountCents: cents(t.amountCents),
    payeeText: t.payee?.name ?? "",
  }));

  const payees = await prisma.payee.findMany({ where: { budgetId }, select: { id: true, name: true, defaultCategoryId: true } });
  const payeeByNormalizedName = new Map(payees.map((p) => [normalizePayeeText(p.name), p]));

  const importRecord = await prisma.import.create({
    data: { budgetId, accountId, filename, status: "PENDING" },
  });

  await prisma.importTransaction.createMany({
    data: rows.map((row) => {
      const duplicate = findLikelyDuplicate({ date: row.date, amountCents: cents(row.amountCents), payeeText: row.payee }, existingForDedup);
      const matchedPayee = payeeByNormalizedName.get(normalizePayeeText(row.payee));
      return {
        importId: importRecord.id,
        rawDate: row.date,
        rawPayeeText: row.payee,
        rawAmountCents: row.amountCents,
        rawMemo: row.memo,
        matchedPayeeId: matchedPayee?.id,
        matchedCategoryId: matchedPayee?.defaultCategoryId ?? undefined,
        isDuplicate: Boolean(duplicate),
        duplicateOfTransactionId: duplicate?.id,
        willImport: !duplicate, // pre-uncheck likely duplicates; user can still opt in
      };
    }),
  });

  await logAudit({ userId, action: "import.staged", entityType: "Import", entityId: importRecord.id, metadata: { rowCount: rows.length } });
  return getImportPreview(userId, budgetId, importRecord.id);
}

export async function getImportPreview(userId: string, budgetId: string, importId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const importRecord = await prisma.import.findUnique({
    where: { id: importId },
    include: {
      rows: { orderBy: { rawDate: "desc" }, include: { matchedPayee: { select: { id: true, name: true } } } },
      account: { select: { id: true, name: true } },
    },
  });
  if (!importRecord || importRecord.budgetId !== budgetId) throw new NotFoundError("That import couldn't be found.");

  // matchedCategoryId has no Prisma relation (it's a plain FK-like field so
  // ImportTransaction doesn't force a category to still exist), so resolve
  // display names with one extra lookup instead.
  const categoryIds = [...new Set(importRecord.rows.map((r) => r.matchedCategoryId).filter((id): id is string => Boolean(id)))];
  const categories = await prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } });
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  return {
    ...importRecord,
    rows: importRecord.rows.map((row) => ({
      ...row,
      matchedCategoryName: row.matchedCategoryId ? (categoryNameById.get(row.matchedCategoryId) ?? null) : null,
    })),
  };
}

export async function updateImportRow(
  userId: string,
  budgetId: string,
  importId: string,
  rowId: string,
  patch: { willImport?: boolean; matchedCategoryId?: string | null },
) {
  await requireBudgetOwnership(budgetId, userId);
  const importRecord = await prisma.import.findUnique({ where: { id: importId } });
  if (!importRecord || importRecord.budgetId !== budgetId) throw new NotFoundError("That import couldn't be found.");
  if (importRecord.status !== "PENDING") throw new ConflictError("This import has already been committed.");

  const row = await prisma.importTransaction.findUnique({ where: { id: rowId } });
  if (!row || row.importId !== importId) throw new NotFoundError("That row couldn't be found.");

  return prisma.importTransaction.update({ where: { id: rowId }, data: patch });
}

export async function commitImport(userId: string, budgetId: string, importId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const importRecord = await prisma.import.findUnique({ where: { id: importId }, include: { rows: true } });
  if (!importRecord || importRecord.budgetId !== budgetId) throw new NotFoundError("That import couldn't be found.");
  if (importRecord.status !== "PENDING") throw new ConflictError("This import has already been committed.");

  let importedCount = 0;
  for (const row of importRecord.rows) {
    if (!row.willImport) continue;

    const created = await createTransaction(userId, budgetId, {
      accountId: importRecord.accountId,
      date: row.rawDate,
      payeeName: row.rawPayeeText,
      memo: row.rawMemo ?? undefined,
      type: row.rawAmountCents >= 0 ? "INCOME" : "EXPENSE",
      amountCents: row.rawAmountCents,
      splits: [{ categoryId: row.matchedCategoryId, amountCents: row.rawAmountCents }],
    });
    // The link lives on Transaction.importRowId (a unique FK to this row),
    // not on ImportTransaction itself — see schema.prisma.
    await prisma.transaction.update({ where: { id: created.id }, data: { importRowId: row.id } });
    importedCount += 1;
  }

  await prisma.import.update({ where: { id: importId }, data: { status: "COMMITTED", committedAt: new Date() } });
  await logAudit({ userId, action: "import.committed", entityType: "Import", entityId: importId, metadata: { importedCount } });
  return { importedCount };
}

export async function cancelImport(userId: string, budgetId: string, importId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const importRecord = await prisma.import.findUnique({ where: { id: importId } });
  if (!importRecord || importRecord.budgetId !== budgetId) throw new NotFoundError("That import couldn't be found.");
  if (importRecord.status !== "PENDING") throw new ConflictError("This import has already been committed.");
  await prisma.import.update({ where: { id: importId }, data: { status: "CANCELLED" } });
}
