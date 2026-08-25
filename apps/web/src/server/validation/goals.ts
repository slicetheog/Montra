import { z } from "zod";

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["TARGET_BALANCE", "MONTHLY_CONTRIBUTION", "TARGET_DATE", "DEBT_PAYOFF"]),
  categoryId: z.string().min(1).optional(),
  accountId: z.string().min(1).optional(),
  targetAmountCents: z.number().int().positive().optional(),
  targetDate: z.coerce.date().optional(),
  monthlyContributionCents: z.number().int().positive().optional(),
});

export const updateGoalSchema = createGoalSchema.partial().omit({ type: true, categoryId: true, accountId: true });
