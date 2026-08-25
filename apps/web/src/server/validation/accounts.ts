import { z } from "zod";

export const accountTypeSchema = z.enum([
  "CHECKING",
  "SAVINGS",
  "CREDIT_CARD",
  "CASH",
  "INVESTMENT",
  "LOAN",
  "OTHER_ASSET",
  "OTHER_LIABILITY",
]);

export const createAccountSchema = z.object({
  name: z.string().trim().min(1, "Give the account a name.").max(80),
  type: accountTypeSchema,
  institution: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  onBudget: z.boolean().optional(),
  /** Integer cents; may be negative for a card/loan you already owe money on. */
  startingBalanceCents: z.number().int(),
  startingDate: z.coerce.date().optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  institution: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
  isClosed: z.boolean().optional(),
  onBudget: z.boolean().optional(),
});
