import "server-only";
import { prisma } from "@montra/db";
import { ValidationError } from "@/server/api-helpers";
import { hashPassword, validatePasswordStrength, verifyPassword } from "@/server/auth/password";
import { destroyAllSessions } from "@/server/auth/session";
import { logAudit } from "@/server/services/audit";

export async function updateProfile(userId: string, name: string) {
  const user = await prisma.user.update({ where: { id: userId }, data: { name } });
  await logAudit({ userId, action: "user.profile_updated", entityType: "User", entityId: userId });
  return { id: user.id, email: user.email, name: user.name };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await verifyPassword(currentPassword, user.passwordHash);
  if (!valid) throw new ValidationError("Your current password isn't right.");

  const strengthIssue = validatePasswordStrength(newPassword);
  if (strengthIssue) throw new ValidationError(strengthIssue);

  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // Log out every other session — a password change should invalidate old
  // credentials everywhere, not just here.
  await destroyAllSessions(userId);
  await logAudit({ userId, action: "user.password_changed", entityType: "User", entityId: userId });
}

export async function deleteAccount(userId: string, password: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw new ValidationError("Your password isn't right.");

  await logAudit({ userId, action: "user.account_deleted", entityType: "User", entityId: userId });
  // Cascades through every relation (budgets, accounts, transactions, ...).
  await prisma.user.delete({ where: { id: userId } });
}
