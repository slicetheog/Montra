import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@montra/db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/api-helpers";
import { requireBudgetOwner, requireBudgetAccess } from "@/server/services/budgets";
import { logAudit } from "@/server/services/audit";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function inviteUrl(token: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${appUrl}/invite/${token}`;
}

/**
 * Invites (or re-invites) a collaborator by email — owner-only, see
 * requireBudgetOwner. There's no email-sending infrastructure in this
 * deployment (see DEPLOYMENT.md), so this returns a shareable link for
 * the owner to send however they like, the same "generate a link, no
 * outbound email" approach the rest of this app uses when it doesn't
 * have a real delivery channel. Re-inviting an existing PENDING row
 * rotates its token (the old link stops working) rather than creating a
 * duplicate.
 */
export async function inviteMember(userId: string, budgetId: string, email: string) {
  const budget = await requireBudgetOwner(budgetId, userId);
  const normalizedEmail = email.trim().toLowerCase();

  const inviter = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (inviter?.email.toLowerCase() === normalizedEmail) {
    throw new ValidationError("You already own this budget.");
  }

  const existing = await prisma.budgetMember.findUnique({ where: { budgetId_email: { budgetId, email: normalizedEmail } } });
  if (existing?.status === "ACCEPTED") {
    throw new ConflictError("That person is already a collaborator on this budget.");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);

  const member = existing
    ? await prisma.budgetMember.update({ where: { id: existing.id }, data: { tokenHash, invitedByUserId: userId } })
    : await prisma.budgetMember.create({
        data: { budgetId, email: normalizedEmail, invitedByUserId: userId, tokenHash },
      });

  await logAudit({ userId, action: "budget.member_invited", entityType: "Budget", entityId: budgetId });
  return { member: { id: member.id, email: member.email, status: member.status }, budgetName: budget.name, inviteUrl: inviteUrl(token) };
}

export async function listMembers(userId: string, budgetId: string) {
  const budget = await requireBudgetAccess(budgetId, userId);
  const [owner, members] = await Promise.all([
    prisma.user.findUnique({ where: { id: budget.userId }, select: { id: true, name: true, email: true } }),
    prisma.budgetMember.findMany({ where: { budgetId }, orderBy: { createdAt: "asc" } }),
  ]);
  return {
    owner,
    members: members.map((m) => ({ id: m.id, email: m.email, status: m.status, acceptedAt: m.acceptedAt })),
  };
}

/** The owner can remove anyone; a member can remove only themselves (leaving the budget). */
export async function removeMember(userId: string, budgetId: string, memberId: string) {
  const budget = await requireBudgetAccess(budgetId, userId);
  const member = await prisma.budgetMember.findUnique({ where: { id: memberId } });
  if (!member || member.budgetId !== budgetId) throw new NotFoundError("That collaborator couldn't be found.");
  if (budget.userId !== userId && member.userId !== userId) throw new ForbiddenError();

  await prisma.budgetMember.delete({ where: { id: memberId } });
  await logAudit({ userId, action: "budget.member_removed", entityType: "Budget", entityId: budgetId });
}

/** Public preview of a pending invite (still requires a logged-in caller — see the API route) — no budget-access check, since the token itself is the credential. */
export async function getInvitePreview(token: string) {
  const member = await prisma.budgetMember.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { budget: { select: { name: true } }, invitedBy: { select: { name: true } } },
  });
  if (!member || member.status !== "PENDING") throw new NotFoundError("That invite link is no longer valid.");
  return { budgetName: member.budget.name, invitedEmail: member.email, invitedByName: member.invitedBy.name };
}

/**
 * Accepting requires the logged-in account's own email to match the
 * invited address exactly (case-insensitively) — otherwise anyone who
 * gets hold of a link (forwarded, leaked, guessed) could join a budget
 * that was never meant for them, since there's no other way (no email
 * delivery) to prove the link reached the right person.
 */
export async function acceptInvite(userId: string, userEmail: string, token: string) {
  const member = await prisma.budgetMember.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!member || member.status !== "PENDING") throw new NotFoundError("That invite link is no longer valid.");
  if (member.email.toLowerCase() !== userEmail.toLowerCase()) {
    throw new ValidationError("This invite is for a different email address.");
  }

  const updated = await prisma.budgetMember.update({
    where: { id: member.id },
    data: { userId, status: "ACCEPTED", acceptedAt: new Date() },
  });
  await logAudit({ userId, action: "budget.member_joined", entityType: "Budget", entityId: member.budgetId });
  return { budgetId: updated.budgetId };
}
