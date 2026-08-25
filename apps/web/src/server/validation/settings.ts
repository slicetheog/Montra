import { z } from "zod";

export const updateSettingsSchema = z.object({
  currency: z.string().trim().length(3).optional(),
  dateFormat: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]).optional(),
  firstDayOfMonth: z.number().int().min(1).max(28).optional(),
  theme: z.enum(["LIGHT", "DARK", "SYSTEM"]).optional(),
  notificationsEnabled: z.boolean().optional(),
  completeOnboarding: z.boolean().optional(),
});
