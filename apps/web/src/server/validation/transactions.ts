import { z } from "zod";

export const transactionTypeSchema = z.enum(["EXPENSE", "INCOME", "TRANSFER", "REFUND", "CREDIT_CARD_PAYMENT"]);
export const clearedStatusSchema = z.enum(["UNCLEARED", "CLEARED", "RECONCILED"]);

export const splitInputSchema = z.object({
  categoryId: z.string().min(1).nullable(),
  amountCents: z.number().int(),
  memo: z.string().trim().max(280).optional(),
});

export const createTransactionSchema = z
  .object({
    accountId: z.string().min(1),
    date: z.coerce.date(),
    payeeId: z.string().min(1).optional(),
    payeeName: z.string().trim().max(160).optional(),
    memo: z.string().trim().max(500).optional(),
    cleared: clearedStatusSchema.optional(),
    type: transactionTypeSchema,
    amountCents: z.number().int(),
    splits: z.array(splitInputSchema).optional(),
    transferAccountId: z.string().min(1).optional(),
  })
  .refine((data) => data.type !== "TRANSFER" || Boolean(data.transferAccountId), {
    message: "Choose which account this transfers to.",
    path: ["transferAccountId"],
  })
  .refine((data) => data.type === "TRANSFER" || (data.splits && data.splits.length > 0), {
    message: "Add at least one category split.",
    path: ["splits"],
  });

export const updateTransactionSchema = z.object({
  accountId: z.string().min(1).optional(),
  date: z.coerce.date().optional(),
  payeeId: z.string().min(1).nullable().optional(),
  payeeName: z.string().trim().max(160).optional(),
  memo: z.string().trim().max(500).nullable().optional(),
  cleared: clearedStatusSchema.optional(),
  amountCents: z.number().int().optional(),
  splits: z.array(splitInputSchema).optional(),
});

export const listTransactionsQuerySchema = z.object({
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  payeeId: z.string().optional(),
  tagId: z.string().optional(),
  search: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
