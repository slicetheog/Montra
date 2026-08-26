import { NextResponse } from "next/server";
import { prisma } from "@montra/db";
import { handleApi, apiOk } from "@/server/api-helpers";
import { hashPassword } from "@/server/auth/password";
import { createBudget, seedDefaultCategories } from "@/server/services/budgets";
import { createAccount } from "@/server/services/accounts";
import { createTransaction } from "@/server/services/transactions";
import { assignMoney, listCategories } from "@/server/services/budget";
import { createGoal } from "@/server/services/goals";
import { createRecurring } from "@/server/services/recurring";
import { updateUserSettings } from "@/server/services/settings";
import { upsertDebtDetails } from "@/server/services/debts";
import { deleteAccount } from "@/server/services/profile";

/**
 * Browser-triggerable equivalent of `npm run seed:demo` (see that script
 * for the full rationale — same data plan, same "drive the real service
 * layer, never hand-write ledger rows" principle) for anyone who deployed
 * this app and doesn't have a local machine to run the script from. Visit
 * this URL once; it creates (or, with ?reset=1, recreates) a demo account
 * with two months of realistic budget data already in it.
 *
 * Gated behind SEED_DEMO_SECRET so it isn't a wide-open "create test data"
 * endpoint on a public deployment: unset (the default) or mismatched, this
 * 404s rather than 403s, the same "don't confirm the route exists either"
 * posture as the rest of the app's auth surface. Set that env var, hit
 * this URL with ?secret=<it> once, then feel free to unset it again.
 */

const EMAIL = "demo@montra.app";
const PASSWORD = "MontraDemo2026!";
const NAME = "Demo User";

function dateInMonth(monthsAgo: number, dayOfMonth: number): Date {
  const today = new Date();
  const d = new Date(today.getFullYear(), today.getMonth() - monthsAgo, dayOfMonth);
  if (monthsAgo === 0 && d > today) d.setDate(today.getDate());
  return d;
}

export async function GET(request: Request) {
  return handleApi(async () => {
    const url = new URL(request.url);
    const secret = process.env.SEED_DEMO_SECRET;
    if (!secret || url.searchParams.get("secret") !== secret) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const reset = url.searchParams.get("reset") === "1";

    let user = await prisma.user.findUnique({ where: { email: EMAIL } });

    if (user && reset) {
      await deleteAccount(user.id, PASSWORD);
      user = null;
    }

    if (user) {
      const existingBudget = await prisma.budget.findFirst({ where: { userId: user.id } });
      if (existingBudget) {
        return apiOk({
          message: "Demo account already has a budget — left as is. Add &reset=1 to start over.",
          email: EMAIL,
          password: PASSWORD,
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: EMAIL,
          name: NAME,
          passwordHash: await hashPassword(PASSWORD),
          settings: { create: {} },
          entitlement: { create: { adsRemoved: false } },
        },
      });
    }
    const userId = user.id;

    const budget = await createBudget(userId, "Demo Budget");
    await seedDefaultCategories(userId, budget.id);
    const groups = await listCategories(userId, budget.id);
    const categoryId = (name: string) =>
      groups.flatMap((g) => g.categories).find((c) => c.name === name)!.id;

    const checking = await createAccount(userId, budget.id, {
      name: "Checking",
      type: "CHECKING",
      institution: "First National",
      startingBalanceCents: 320000,
      startingDate: dateInMonth(3, 1),
    });
    await createAccount(userId, budget.id, {
      name: "Savings",
      type: "SAVINGS",
      institution: "First National",
      startingBalanceCents: 850000,
      startingDate: dateInMonth(3, 1),
    });
    const creditCard = await createAccount(userId, budget.id, {
      name: "Visa",
      type: "CREDIT_CARD",
      institution: "Chase",
      startingBalanceCents: -45000,
      startingDate: dateInMonth(3, 1),
    });
    await upsertDebtDetails(userId, budget.id, creditCard.id, {
      originalBalanceCents: 45000,
      interestRateBps: 1899,
      minimumPaymentCents: 2500,
      dueDayOfMonth: 15,
    });

    const expensePlan = [
      { day: 2, accountId: checking.id, payeeName: "Rent Co.", amountCents: -140000, category: "Rent/Mortgage", cleared: "CLEARED" as const },
      { day: 3, accountId: checking.id, payeeName: "Utilities Co.", amountCents: -9500, category: "Utilities", cleared: "CLEARED" as const },
      { day: 3, accountId: checking.id, payeeName: "Comcast", amountCents: -7000, category: "Internet", cleared: "CLEARED" as const },
      { day: 4, accountId: checking.id, payeeName: "Whole Foods", amountCents: -12000, category: "Groceries", cleared: "CLEARED" as const },
      { day: 6, accountId: checking.id, payeeName: "Shell", amountCents: -4500, category: "Gas", cleared: "CLEARED" as const },
      { day: 8, accountId: checking.id, payeeName: "Trader Joe's", amountCents: -6500, category: "Groceries", cleared: "CLEARED" as const },
      { day: 10, accountId: creditCard.id, payeeName: "Chipotle", amountCents: -1850, category: "Restaurants", cleared: "UNCLEARED" as const },
    ];
    const assignmentPlan: [string, number][] = [
      ["Rent/Mortgage", 140000],
      ["Groceries", 40000],
      ["Restaurants", 10000],
      ["Gas", 15000],
      ["Utilities", 10000],
      ["Internet", 7000],
      ["Entertainment", 5000],
      ["Emergency Fund", 30000],
    ];

    for (const monthsAgo of [1, 0]) {
      await createTransaction(userId, budget.id, {
        accountId: checking.id,
        date: dateInMonth(monthsAgo, 1),
        payeeName: "Employer Inc.",
        type: "INCOME",
        amountCents: 350000,
        cleared: "CLEARED",
        splits: [{ categoryId: null, amountCents: 350000 }],
      });

      for (const t of expensePlan) {
        await createTransaction(userId, budget.id, {
          accountId: t.accountId,
          date: dateInMonth(monthsAgo, t.day),
          payeeName: t.payeeName,
          type: "EXPENSE",
          amountCents: t.amountCents,
          cleared: t.cleared,
          splits: [{ categoryId: categoryId(t.category), amountCents: t.amountCents }],
        });
      }

      for (const [name, cents] of assignmentPlan) {
        await assignMoney(userId, budget.id, categoryId(name), dateInMonth(monthsAgo, 1), cents);
      }
    }

    await createGoal(userId, budget.id, {
      name: "Emergency Fund",
      type: "TARGET_BALANCE",
      categoryId: categoryId("Emergency Fund"),
      targetAmountCents: 1000000,
    });

    await createRecurring(userId, budget.id, {
      accountId: checking.id,
      payeeName: "Netflix",
      categoryId: categoryId("Entertainment"),
      amountCents: -1549,
      type: "EXPENSE",
      frequency: "MONTHLY",
      startDate: new Date(),
      autoCreate: false,
    });

    await updateUserSettings(userId, { completeOnboarding: true });

    return apiOk({ message: "Demo account seeded.", email: EMAIL, password: PASSWORD });
  });
}
