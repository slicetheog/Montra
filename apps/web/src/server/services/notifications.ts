import "server-only";
import { prisma } from "@montra/db";
import type { NotificationType } from "@prisma/client";
import { listBudgets } from "@/server/services/budgets";
import { getMonthView } from "@/server/services/budget";
import { listGoals } from "@/server/services/goals";
import { listRecurring } from "@/server/services/recurring";

const DAY_MS = 86_400_000;

/** `sinceMs` omitted means "ever" (an existence check, no time filter) — see the GOAL_MILESTONE call site below. */
async function alreadyNotifiedSince(userId: string, type: NotificationType, entityId: string, sinceMs?: number): Promise<boolean> {
  const existing = await prisma.notification.findFirst({
    where: {
      userId,
      type,
      relatedEntityId: entityId,
      createdAt: sinceMs === undefined ? undefined : { gte: new Date(Date.now() - sinceMs) },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function notify(params: { userId: string; type: NotificationType; title: string; body: string; entityType: string; entityId: string }) {
  await prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      body: params.body,
      relatedEntityType: params.entityType,
      relatedEntityId: params.entityId,
    },
  });
}

/**
 * Scans every budget the user owns for the handful of things worth a
 * heads-up and writes any new Notification rows — called from the
 * notifications API on read, since there's no background job runner in
 * this app. Idempotent: each check has its own dedupe window, so opening
 * the notification panel repeatedly doesn't spam duplicates for a
 * condition that's still true.
 */
export async function generateNotifications(userId: string): Promise<void> {
  const budgets = await listBudgets(userId);
  const now = new Date();

  for (const budget of budgets) {
    // Overspending: any category currently in the red. Re-checked daily
    // — a category can go from fine to overspent (or back) as new
    // transactions post, so a day-old notification shouldn't suppress a
    // fresh one, but every page load shouldn't re-fire it either.
    const monthView = await getMonthView(userId, budget.id, now);
    for (const group of monthView.groups) {
      for (const category of group.categories) {
        if (category.availableCents >= 0) continue;
        if (await alreadyNotifiedSince(userId, "OVERSPENDING", category.categoryId, DAY_MS)) continue;
        await notify({
          userId,
          type: "OVERSPENDING",
          title: `${category.name} is overspent`,
          body: `${category.name} in ${budget.name} is overspent — move money in to cover it, or it'll pull from next month.`,
          entityType: "Category",
          entityId: category.categoryId,
        });
      }
    }

    // Upcoming bills: reminder-only (autoCreate: false) recurring
    // expenses due within the next 3 days — the ones that need the
    // viewer to actually go add the transaction themselves.
    const recurring = await listRecurring(userId, budget.id);
    for (const r of recurring) {
      if (r.type !== "EXPENSE" || r.autoCreate || !r.isActive) continue;
      const daysUntilDue = Math.round((r.nextOccurrenceDate.getTime() - now.getTime()) / DAY_MS);
      if (daysUntilDue < 0 || daysUntilDue > 3) continue;
      if (await alreadyNotifiedSince(userId, "UPCOMING_BILL", r.id, 3 * DAY_MS)) continue;
      const when = daysUntilDue <= 0 ? "today" : daysUntilDue === 1 ? "tomorrow" : `in ${daysUntilDue} days`;
      await notify({
        userId,
        type: "UPCOMING_BILL",
        title: `${r.payee?.name ?? r.memo ?? "A bill"} is due ${when}`,
        body: `${r.payee?.name ?? r.memo ?? "A recurring expense"} in ${budget.name} is due ${when} — it won't be added automatically.`,
        entityType: "RecurringTransaction",
        entityId: r.id,
      });
    }

    // Goal completed — the single clearest, most-earned milestone. Once
    // is enough (a completed goal doesn't need repeating), so this is an
    // existence check rather than a time window.
    const goals = await listGoals(userId, budget.id);
    for (const goal of goals) {
      if (!goal.progress || goal.progress.percentComplete < 100) continue;
      if (await alreadyNotifiedSince(userId, "GOAL_MILESTONE", goal.id)) continue;
      await notify({
        userId,
        type: "GOAL_MILESTONE",
        title: `You hit your goal: ${goal.name}`,
        body: `${goal.name} in ${budget.name} is fully funded. Nice work.`,
        entityType: "Goal",
        entityId: goal.id,
      });
    }

    // Reconciliation reminders: an on-budget account with any activity
    // that either has never been reconciled or hasn't been in 30+ days.
    const accounts = await prisma.account.findMany({
      where: { budgetId: budget.id, isClosed: false, onBudget: true },
      select: {
        id: true,
        name: true,
        createdAt: true,
        reconciliations: { orderBy: { statementDate: "desc" }, take: 1, select: { statementDate: true } },
        _count: { select: { transactions: true } },
      },
    });
    for (const account of accounts) {
      if (account._count.transactions === 0) continue;
      const lastReconciled = account.reconciliations[0]?.statementDate ?? account.createdAt;
      const daysSince = (now.getTime() - lastReconciled.getTime()) / DAY_MS;
      if (daysSince < 30) continue;
      if (await alreadyNotifiedSince(userId, "RECONCILIATION_REMINDER", account.id, 14 * DAY_MS)) continue;
      await notify({
        userId,
        type: "RECONCILIATION_REMINDER",
        title: `Time to reconcile ${account.name}`,
        body: `${account.name} in ${budget.name} hasn't been reconciled against a statement in a while — worth a quick check.`,
        entityType: "Account",
        entityId: account.id,
      });
    }
  }
}

export async function listNotifications(userId: string, limit = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 100),
  });
}

export async function markNotificationRead(userId: string, notificationId: string) {
  await prisma.notification.updateMany({ where: { id: notificationId, userId }, data: { isRead: true } });
}

export async function markAllNotificationsRead(userId: string) {
  await prisma.notification.updateMany({ where: { userId, isRead: false }, data: { isRead: true } });
}
