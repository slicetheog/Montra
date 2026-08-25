import { z } from "zod";

export const stageImportSchema = z.object({
  accountId: z.string().min(1),
  filename: z.string().trim().min(1).max(200),
  rows: z
    .array(
      z.object({
        date: z.coerce.date(),
        payee: z.string().trim().min(1).max(200),
        amountCents: z.number().int(),
        memo: z.string().trim().max(500).optional(),
      }),
    )
    .min(1),
});

export const updateImportRowSchema = z.object({
  willImport: z.boolean().optional(),
  matchedCategoryId: z.string().min(1).nullable().optional(),
});
