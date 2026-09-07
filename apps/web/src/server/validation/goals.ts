import { z } from "zod";

// Empty strings are treated as "not provided" rather than a validation
// failure — the service layer (validateGoalInput) turns a truly missing
// categoryId/accountId into a clear, specific message ("Choose which
// category this goal tracks.") instead of Zod's generic rejection.
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? v : undefined));

export const createGoalSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(["TARGET_BALANCE", "MONTHLY_CONTRIBUTION", "TARGET_DATE", "DEBT_PAYOFF"]),
  categoryId: optionalId,
  accountId: optionalId,
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).optional(),
  targetAmountCents: z.number().int().positive().optional(),
  targetDate: z.coerce.date().optional(),
  monthlyContributionCents: z.number().int().positive().optional(),
});

export const updateGoalSchema = createGoalSchema.partial().omit({ type: true, categoryId: true, accountId: true });
