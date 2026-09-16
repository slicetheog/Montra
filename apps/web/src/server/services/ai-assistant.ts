import "server-only";
import { prisma } from "@montra/db";
import { buildBudgetSnapshotText, cents, type BudgetSnapshotInput } from "@montra/domain";
import { ValidationError } from "@/server/api-helpers";
import { requireBudgetOwnership } from "@/server/services/budgets";
import { getMonthView } from "@/server/services/budget";
import { getNetWorthNow } from "@/server/services/net-worth";
import { listGoals } from "@/server/services/goals";
import { getAiAssistantProvider, isAiAssistantConfigured } from "@/server/ai";
import { formatMonthLabel } from "@/lib/utils";

const UPCOMING_BILLS_LIMIT = 5;

const QA_SYSTEM_PROMPT = `You are Montra's built-in budgeting assistant. Answer the user's question using ONLY the budget data provided below — never invent numbers, and never assume information you weren't given. If the data doesn't answer the question, say so plainly rather than guessing. Keep answers conversational but concise (a few sentences, not a report). You are not a licensed financial advisor — for real investment, tax, or legal advice, tell the user to consult a professional.`;

const RECAP_SYSTEM_PROMPT = `You are Montra's built-in budgeting assistant. Write a short, plain-English recap (2-4 sentences) of the budget data below, as if summarizing the period for the user: highlight what stands out (categories they overspent or underspent, progress toward goals, notable upcoming bills). Use ONLY the data given — never invent numbers. Keep the tone friendly and encouraging, never judgmental.`;

/** Both the deployment-level key and the user's own opt-in must be true — see server/ai/index.ts. */
async function requireAssistantEnabled(userId: string) {
  if (!isAiAssistantConfigured()) {
    throw new ValidationError("The AI assistant isn't configured on this server yet.");
  }
  const settings = await prisma.userSettings.findUnique({ where: { userId }, select: { aiAssistantEnabled: true } });
  if (!settings?.aiAssistantEnabled) {
    throw new ValidationError("Turn on the AI Assistant in Settings first.");
  }
}

async function buildSnapshot(userId: string, budgetId: string, month: Date): Promise<BudgetSnapshotInput> {
  const budget = await requireBudgetOwnership(budgetId, userId);
  const [monthView, netWorth, goals, upcomingBills] = await Promise.all([
    getMonthView(userId, budgetId, month),
    getNetWorthNow(userId, budgetId),
    listGoals(userId, budgetId),
    prisma.recurringTransaction.findMany({
      where: { budgetId, isActive: true, type: "EXPENSE" },
      orderBy: { nextOccurrenceDate: "asc" },
      take: UPCOMING_BILLS_LIMIT,
      include: { payee: { select: { name: true } } },
    }),
  ]);

  return {
    budgetName: budget.name,
    currency: budget.currency,
    periodLabel: formatMonthLabel(monthView.month),
    readyToAssignCents: cents(monthView.readyToAssignCents),
    categories: monthView.groups
      .flatMap((g) => g.categories)
      .filter((c) => !c.isSystem)
      .map((c) => ({ name: c.name, assignedCents: cents(c.assignedCents), activityCents: cents(c.activityCents), availableCents: cents(c.availableCents) })),
    upcomingBills: upcomingBills.map((b) => ({
      name: b.payee?.name ?? b.memo ?? "Bill",
      amountCents: cents(Math.abs(b.amountCents)),
      dueDate: b.nextOccurrenceDate.toISOString().slice(0, 10),
    })),
    goals: goals.map((g) => ({ name: g.name, percentComplete: g.progress?.percentComplete ?? 0 })),
    netWorthCents: cents(netWorth.netWorthCents),
  };
}

const MAX_QUESTION_LENGTH = 500;

export async function askAssistant(userId: string, budgetId: string, question: string): Promise<{ answer: string }> {
  await requireBudgetOwnership(budgetId, userId);
  await requireAssistantEnabled(userId);
  const trimmed = question.trim();
  if (!trimmed) throw new ValidationError("Enter a question first.");
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    throw new ValidationError(`Keep questions under ${MAX_QUESTION_LENGTH} characters.`);
  }

  const snapshot = await buildSnapshot(userId, budgetId, new Date());
  const systemPrompt = `${QA_SYSTEM_PROMPT}\n\n${buildBudgetSnapshotText(snapshot)}`;

  const provider = getAiAssistantProvider();
  if (!provider) throw new ValidationError("The AI assistant isn't configured on this server yet.");
  const answer = await provider.ask({ systemPrompt, userMessage: trimmed });
  return { answer };
}

export async function getMonthlyRecap(userId: string, budgetId: string, month: Date) {
  await requireBudgetOwnership(budgetId, userId);
  const recap = await prisma.monthlyRecap.findUnique({ where: { budgetId_month: { budgetId, month } } });
  return recap ? { text: recap.text, generatedAt: recap.createdAt.toISOString() } : null;
}

/**
 * Generates (or regenerates) a month's recap and caches it — revisiting an
 * already-recapped month is a free read, never a repeat API call. Only an
 * explicit `force` regenerates an existing one.
 */
export async function generateMonthlyRecap(userId: string, budgetId: string, month: Date, force = false) {
  await requireBudgetOwnership(budgetId, userId);
  await requireAssistantEnabled(userId);

  if (!force) {
    const existing = await prisma.monthlyRecap.findUnique({ where: { budgetId_month: { budgetId, month } } });
    if (existing) return { text: existing.text, generatedAt: existing.createdAt.toISOString() };
  }

  const snapshot = await buildSnapshot(userId, budgetId, month);
  const systemPrompt = `${RECAP_SYSTEM_PROMPT}\n\n${buildBudgetSnapshotText(snapshot)}`;

  const provider = getAiAssistantProvider();
  if (!provider) throw new ValidationError("The AI assistant isn't configured on this server yet.");
  const text = await provider.ask({ systemPrompt, userMessage: "Summarize this period." });

  const recap = await prisma.monthlyRecap.upsert({
    where: { budgetId_month: { budgetId, month } },
    update: { text },
    create: { budgetId, month, text },
  });
  return { text: recap.text, generatedAt: recap.createdAt.toISOString() };
}
