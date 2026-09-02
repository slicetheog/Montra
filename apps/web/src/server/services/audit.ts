import "server-only";
import { prisma } from "@montra/db";
import type { Prisma } from "@prisma/client";

/**
 * Lightweight audit trail (spec: Audit Log). Deliberately stores only
 * structural metadata (ids, before/after amounts) — never raw memos, full
 * account numbers, or anything beyond what's needed to answer "what
 * changed and when" (spec: "Do not store sensitive information
 * unnecessarily").
 */
export async function logAudit(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      metadata: params.metadata,
    },
  });
}

/**
 * The audit trail was written on every action above but never read back
 * anywhere — no "recent activity" view existed. This is that read path,
 * for a plain "what happened on my account and when" list in Settings.
 */
export async function listAuditLog(userId: string, limit = 50) {
  return prisma.auditLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: { id: true, action: true, entityType: true, createdAt: true },
  });
}
