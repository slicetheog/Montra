import { z } from "zod";

export const createRecurringSchema = z.object({
  accountId: z.string().min(1),
  payeeId: z.string().min(1).optional(),
  payeeName: z.string().trim().max(160).optional(),
  categoryId: z.string().min(1).optional(),
  amountCents: z.number().int(),
  memo: z.string().trim().max(280).optional(),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER", "REFUND", "CREDIT_CARD_PAYMENT"]),
  frequency: z.enum(["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "EVERY_N_MONTHS", "YEARLY", "CUSTOM"]),
  intervalCount: z.number().int().min(1).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  occurrencesLimit: z.number().int().positive().optional(),
  reminderDaysBefore: z.number().int().min(0).optional(),
  autoCreate: z.boolean().optional(),
});

export const updateRecurringSchema = z.object({
  amountCents: z.number().int().optional(),
  memo: z.string().trim().max(280).optional(),
  isActive: z.boolean().optional(),
  autoCreate: z.boolean().optional(),
  endDate: z.coerce.date().nullable().optional(),
});
