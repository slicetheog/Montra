import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(1, "Please tell us your name.").max(120),
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  password: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address.").max(254),
  password: z.string().min(1, "Please enter your password."),
});
