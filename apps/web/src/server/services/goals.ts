import "server-only";
import { prisma } from "@montra/db";
import { monthStart, cents, computeDebtPayoffProjection, computeGoalProgress, computeRecommendedMonthlyContribution, computeEstimatedCompletionDate } from "@montra/domain";
import { NotFoundError, ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { getCategoryAvailable, getMonthView } from "@/server/services/budget";
import { logAudit } from "@/server/services/audit";

export type GoalPriority = "HIGH" | "MEDIUM" | "LOW";

export interface CreateGoalInput {
  name: string;
  type: "TARGET_BALANCE" | "MONTHLY_CONTRIBUTION" | "TARGET_DATE" | "DEBT_PAYOFF";
  categoryId?: string;
  accountId?: string;
  priority?: GoalPriority;
  targetAmountCents?: number;
  targetDate?: Date;
  monthlyContributionCents?: number;
}

function validateGoalInput(input: CreateGoalInput) {
  if (input.type === "DEBT_PAYOFF") {
    if (!input.accountId) throw new ValidationError("Choose which debt account this goal pays off.");
  } else if (!input.categoryId) {
    throw new ValidationError("Choose which category this goal tracks.");
  }
  if ((input.type === "TARGET_BALANCE" || input.type === "TARGET_DATE") && !input.targetAmountCents) {
    throw new ValidationError("Enter a target amount.");
  }
  if (input.type === "TARGET_DATE" && !input.targetDate) {
    throw new ValidationError("Choose a target date.");
  }
  if (input.type === "MONTHLY_CONTRIBUTION" && !input.monthlyContributionCents) {
    throw new ValidationError("Enter a monthly contribution amount.");
  }
}

export async function createGoal(userId: string, budgetId: string, input: CreateGoalInput) {
  await requireBudgetOwnership(budgetId, userId);
  validateGoalInput(input);

  if (input.categoryId) {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category || category.budgetId !== budgetId) throw new NotFoundError("That category couldn't be found.");
  }
  if (input.accountId) {
    const account = await prisma.account.findUnique({ where: { id: input.accountId } });
    if (!account || account.budgetId !== budgetId) throw new NotFoundError("That account couldn't be found.");
  }

  const goal = await prisma.goal.create({
    data: {
      budgetId,
      name: input.name,
      type: input.type,
      categoryId: input.categoryId,
      accountId: input.accountId,
      priority: input.priority,
      targetAmountCents: input.targetAmountCents,
      targetDate: input.targetDate,
      monthlyContributionCents: input.monthlyContributionCents,
    },
  });
  await logAudit({ userId, action: "goal.created", entityType: "Goal", entityId: goal.id });
  return goal;
}

export async function updateGoal(userId: string, budgetId: string, goalId: string, input: Partial<CreateGoalInput>) {
  await requireBudgetOwnership(budgetId, userId);
  const existing = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!existing || existing.budgetId !== budgetId) throw new NotFoundError("That goal couldn't be found.");

  const updated = await prisma.goal.update({
    where: { id: goalId },
    data: {
      name: input.name,
      priority: input.priority,
      targetAmountCents: input.targetAmountCents,
      targetDate: input.targetDate,
      monthlyContributionCents: input.monthlyContributionCents,
    },
  });
  await logAudit({ userId, action: "goal.updated", entityType: "Goal", entityId: goalId });
  return updated;
}

export async function deleteGoal(userId: string, budgetId: string, goalId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const existing = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!existing || existing.budgetId !== budgetId) throw new NotFoundError("That goal couldn't be found.");
  await prisma.goal.delete({ where: { id: goalId } });
  await logAudit({ userId, action: "goal.deleted", entityType: "Goal", entityId: goalId });
}

export async function listGoals(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const goals = await prisma.goal.findMany({
    where: { budgetId },
    orderBy: { createdAt: "asc" },
    include: {
      category: { select: { id: true, name: true } },
      account: { select: { id: true, name: true, debt: true } },
    },
  });

  const now = new Date();

  return Promise.all(
    goals.map(async (goal) => {
      if (goal.type === "DEBT_PAYOFF" && goal.account) {
        const balanceAgg = await prisma.transaction.aggregate({
          where: { accountId: goal.accountId! },
          _sum: { amountCents: true },
        });
        const currentBalance = cents(balanceAgg._sum.amountCents ?? 0); // negative = owed
        const debt = goal.account.debt;
        const projection = debt
          ? computeDebtPayoffProjection({
              balanceCents: currentBalance,
              annualRateBps: debt.interestRateBps,
              monthlyPaymentCents: cents(debt.minimumPaymentCents),
              asOf: now,
            })
          : null;
        const originalBalance = debt ? cents(debt.originalBalanceCents) : cents(Math.abs(currentBalance));
        const paidDown = cents(Math.abs(originalBalance) - Math.abs(currentBalance));
        const progress = computeGoalProgress(originalBalance <= 0 ? cents(1) : cents(Math.abs(originalBalance)), paidDown);
        return { ...goal, currentAmountCents: paidDown, remainingCents: Math.abs(currentBalance), progress, projection };
      }

      if (!goal.categoryId) {
        return { ...goal, currentAmountCents: 0, remainingCents: goal.targetAmountCents ?? 0, progress: null, projection: null };
      }

      const currentCents = await getCategoryAvailable(prisma, goal.categoryId, now);

      if (goal.type === "MONTHLY_CONTRIBUTION") {
        const thisMonthAssigned = await prisma.assignment.aggregate({
          where: {
            categoryId: goal.categoryId,
            budgetMonth: { month: { gte: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)) } },
          },
          _sum: { amountCents: true },
        });
        const assignedThisMonth = cents(Math.max(0, thisMonthAssigned._sum.amountCents ?? 0));
        const progress = computeGoalProgress(cents(goal.monthlyContributionCents ?? 0), assignedThisMonth);
        return { ...goal, currentAmountCents: assignedThisMonth, remainingCents: progress.remainingCents, progress, projection: null };
      }

      const target = cents(goal.targetAmountCents ?? 0);
      const progress = computeGoalProgress(target, currentCents);
      let projection = null;
      if (goal.type === "TARGET_DATE" && goal.targetDate) {
        const recommendedMonthly = computeRecommendedMonthlyContribution({
          targetCents: target,
          currentCents,
          targetDate: goal.targetDate,
          asOf: now,
        });
        const estimatedCompletion = computeEstimatedCompletionDate({
          targetCents: target,
          currentCents,
          monthlyContributionCents: recommendedMonthly,
          asOf: now,
        });
        projection = { recommendedMonthlyCents: recommendedMonthly, estimatedCompletion };
      }

      return { ...goal, currentAmountCents: currentCents, remainingCents: progress.remainingCents, progress, projection };
    }),
  );
}

const PRIORITY_RANK: Record<GoalPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * "Your goals want to move $X/mo total but you only have $Y left over" —
 * the same cross-check the spreadsheet's "Reality check" row runs, but
 * priority-ordered rather than one pass/fail message: goals are queued
 * highest-priority first against Ready to Assign (the same uncommitted
 * pool "Available to Budget" shows), so it's clear not just *whether*
 * everything fits but *which* goals do.
 *
 * Only MONTHLY_CONTRIBUTION and TARGET_DATE goals have a real "per month"
 * number to compare — TARGET_BALANCE goals are funded whenever, on no
 * fixed cadence, and DEBT_PAYOFF minimums are already counted as a bill
 * elsewhere, so including either here would double-count against Ready
 * to Assign.
 */
export async function getGoalFeasibility(userId: string, budgetId: string) {
  await requireBudgetOwnership(budgetId, userId);
  const now = new Date();
  const [month, goals] = await Promise.all([
    getMonthView(userId, budgetId, monthStart(now)),
    prisma.goal.findMany({ where: { budgetId, type: { in: ["MONTHLY_CONTRIBUTION", "TARGET_DATE"] } } }),
  ]);

  const targets = goals.map((goal) => {
    let monthlyTargetCents = 0;
    if (goal.type === "MONTHLY_CONTRIBUTION") {
      monthlyTargetCents = goal.monthlyContributionCents ?? 0;
    } else if (goal.type === "TARGET_DATE" && goal.targetDate && goal.categoryId) {
      // Recomputing rather than reusing listGoals's cached projection —
      // this runs independently and goal.categoryId's current balance
      // isn't fetched here, so a light re-derivation using 0 as a
      // conservative floor keeps this self-contained. (Callers that
      // already have listGoals's richer per-goal projection can compare
      // against it directly; this endpoint is for the summary banner.)
      monthlyTargetCents = Math.max(
        0,
        computeRecommendedMonthlyContribution({
          targetCents: cents(goal.targetAmountCents ?? 0),
          currentCents: cents(0),
          targetDate: goal.targetDate,
          asOf: now,
        }),
      );
    }
    return { id: goal.id, name: goal.name, priority: goal.priority as GoalPriority, monthlyTargetCents };
  });

  targets.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);

  let cumulativeCents = 0;
  const items = targets.map((t) => {
    cumulativeCents += t.monthlyTargetCents;
    return { ...t, cumulativeCents, fits: cumulativeCents <= month.readyToAssignCents };
  });

  const totalRequestedCents = cumulativeCents;
  return {
    availableCents: month.readyToAssignCents,
    totalRequestedCents,
    items,
    isOverCommitted: totalRequestedCents > month.readyToAssignCents,
  };
}
