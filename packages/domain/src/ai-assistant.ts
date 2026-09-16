import { toDecimalString, type Cents } from "./money";

/**
 * Formats a compact, plain-text snapshot of a budget for an LLM prompt —
 * pure and DB-free like the rest of this package, so it's testable
 * without mocking Prisma. The caller (server/services/ai-assistant.ts)
 * is responsible for gathering the real numbers; this only decides what
 * the model gets to see and how it's worded. Kept deliberately compact
 * (a handful of categories/bills/goals, not the full transaction ledger)
 * to bound token usage, since every call here has a real dollar cost.
 */

export interface BudgetSnapshotCategory {
  name: string;
  assignedCents: Cents;
  activityCents: Cents;
  availableCents: Cents;
}

export interface BudgetSnapshotBill {
  name: string;
  amountCents: Cents;
  /** Pre-formatted by the caller (respects the user's date-format setting) — this module never parses/formats dates. */
  dueDate: string;
}

export interface BudgetSnapshotGoal {
  name: string;
  percentComplete: number;
}

export interface BudgetSnapshotInput {
  budgetName: string;
  currency: string;
  periodLabel: string;
  readyToAssignCents: Cents;
  categories: BudgetSnapshotCategory[];
  upcomingBills: BudgetSnapshotBill[];
  goals: BudgetSnapshotGoal[];
  netWorthCents: Cents;
}

function money(cents: Cents, currency: string): string {
  return toDecimalString(cents, { currency });
}

export function buildBudgetSnapshotText(input: BudgetSnapshotInput): string {
  const { currency } = input;
  const lines: string[] = [];

  lines.push(`Budget: ${input.budgetName} (${input.periodLabel})`);
  lines.push(`Ready to Assign: ${money(input.readyToAssignCents, currency)}`);
  lines.push(`Net worth: ${money(input.netWorthCents, currency)}`);

  lines.push("");
  lines.push("Categories this period (assigned / spent / available):");
  if (input.categories.length === 0) {
    lines.push("(no categories yet)");
  } else {
    for (const c of input.categories) {
      lines.push(`- ${c.name}: ${money(c.assignedCents, currency)} / ${money(c.activityCents, currency)} / ${money(c.availableCents, currency)}`);
    }
  }

  lines.push("");
  lines.push("Upcoming bills:");
  if (input.upcomingBills.length === 0) {
    lines.push("(none scheduled)");
  } else {
    for (const b of input.upcomingBills) {
      lines.push(`- ${b.name}: ${money(b.amountCents, currency)} due ${b.dueDate}`);
    }
  }

  lines.push("");
  lines.push("Goals:");
  if (input.goals.length === 0) {
    lines.push("(no goals set)");
  } else {
    for (const g of input.goals) {
      lines.push(`- ${g.name}: ${g.percentComplete}% complete`);
    }
  }

  return lines.join("\n");
}
