"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, PiggyBank, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDecimalToCents, MoneyError } from "@montra/domain";
import { api, ApiRequestError } from "@/lib/api-client";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface DraftAccount {
  name: string;
  type: string;
  startingBalance: string; // decimal string from the input
}

interface CreatedAccount {
  id: string;
  name: string;
  type: string;
}

/** WEEKLY/BIWEEKLY/MONTHLY map straight to RecurrenceFrequency; SEMI_MONTHLY
 *  isn't a real frequency in the domain (see packages/domain/src/recurrence.ts)
 *  — it's represented as two independent MONTHLY recurring transactions, one
 *  per payday, which needs no changes to that engine at all. */
type PayFrequency = "WEEKLY" | "BIWEEKLY" | "SEMI_MONTHLY" | "MONTHLY" | "SKIP";

const STEPS = ["Welcome", "Accounts", "Paycheck", "Categories", "Give it a job", "Done"];

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [budgetName, setBudgetName] = useState("My Budget");
  const [budgetId, setBudgetId] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<DraftAccount[]>([
    { name: "Checking", type: "CHECKING", startingBalance: "" },
  ]);
  const [createdAccounts, setCreatedAccounts] = useState<CreatedAccount[]>([]);

  const [payFrequency, setPayFrequency] = useState<PayFrequency>("BIWEEKLY");
  const [payDate1, setPayDate1] = useState("");
  const [payDate2, setPayDate2] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState<string | null>(null);

  function updateAccount(index: number, patch: Partial<DraftAccount>) {
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }

  async function handleCreateBudget() {
    setError(null);
    setLoading(true);
    try {
      const budget = await api.post<{ id: string }>("/api/budgets", { name: budgetName || "My Budget" });
      setBudgetId(budget.id);
      setStep(1);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAccounts() {
    if (!budgetId) return;
    setError(null);
    setLoading(true);
    try {
      const usable = accounts.filter((a) => a.name.trim());
      const created: CreatedAccount[] = [];
      for (const a of usable) {
        const cents = Math.round((parseFloat(a.startingBalance || "0") || 0) * 100);
        const account = await api.post<CreatedAccount>(`/api/budgets/${budgetId}/accounts`, {
          name: a.name.trim(),
          type: a.type,
          startingBalanceCents: cents,
        });
        created.push(account);
      }
      setCreatedAccounts(created);
      // Default the paycheck deposit account to the first checking account
      // (most common case), falling back to whatever else was created.
      setPayAccountId(created.find((a) => a.type === "CHECKING")?.id ?? created[0]?.id ?? null);
      // Nowhere to point a paycheck reminder without an account — skip
      // straight to Categories rather than showing an empty, unusable step.
      setStep(created.length > 0 ? 2 : 3);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreatePaycheck() {
    if (!budgetId) return;
    setError(null);
    if (payFrequency === "SKIP") {
      setStep(3);
      return;
    }
    if (!payAccountId) return setError("Choose which account your paycheck deposits to.");
    if (!payDate1) return setError(payFrequency === "SEMI_MONTHLY" ? "Enter your first payday." : "Enter your next payday.");
    if (payFrequency === "SEMI_MONTHLY" && !payDate2) return setError("Enter your second payday.");

    let amountCents: number;
    try {
      amountCents = payAmount.trim() ? parseDecimalToCents(payAmount) : 0;
    } catch (err) {
      return setError(err instanceof MoneyError ? "Enter a valid dollar amount." : "Something went wrong. Please try again.");
    }
    if (amountCents <= 0) return setError("Enter your approximate paycheck amount.");

    setLoading(true);
    try {
      const dates = payFrequency === "SEMI_MONTHLY" ? [payDate1, payDate2] : [payDate1];
      for (const startDate of dates) {
        await api.post(`/api/budgets/${budgetId}/recurring`, {
          accountId: payAccountId,
          payeeName: "Paycheck",
          amountCents,
          type: "INCOME",
          frequency: payFrequency === "SEMI_MONTHLY" ? "MONTHLY" : payFrequency,
          startDate,
          // A reminder only — never auto-adds the transaction. Ready to
          // Assign should only ever reflect money that's actually landed;
          // you still enter the real deposit yourself when it does.
          autoCreate: false,
        });
      }
      setStep(3);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSeedCategories(useDefaults: boolean) {
    if (!budgetId) return;
    setError(null);
    setLoading(true);
    try {
      if (useDefaults) {
        await api.post(`/api/budgets/${budgetId}/seed-defaults`);
      }
      setStep(4);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    setError(null);
    setLoading(true);
    try {
      await api.patch("/api/settings", { completeOnboarding: true });
      await queryClient.invalidateQueries({ queryKey: ["me"] });
      toast.success("You're all set!", "Every dollar has a home now — let's put it to work.");
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-10">
        <div className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <div className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground">
            <Wallet className="size-4.5" />
          </div>
          Montra
        </div>

        <div className="mb-8 flex items-center justify-center gap-2" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={cn(
                "h-1.5 w-10 rounded-full transition-colors",
                i <= step ? "bg-brand" : "bg-border-strong",
              )}
            />
          ))}
        </div>

        <Card className="flex-1">
          <CardContent className="pt-6">
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <div>
                  <PiggyBank className="size-8 text-brand" />
                  <h1 className="mt-3 text-xl font-semibold">What are you budgeting for?</h1>
                  <p className="mt-2 text-sm text-foreground-muted">
                    Montra uses zero-based budgeting: every dollar you have gets assigned a job — rent,
                    groceries, savings, whatever matters to you — before you spend it. No more wondering
                    where your money went.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="budget-name">Name your budget</Label>
                  <Input
                    id="budget-name"
                    value={budgetName}
                    onChange={(e) => setBudgetName(e.target.value)}
                    placeholder="My Budget"
                  />
                </div>
                {error && <p className="text-sm text-negative">{error}</p>}
                <Button onClick={handleCreateBudget} disabled={loading} size="lg">
                  {loading ? "Creating…" : "Get started"}
                </Button>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-xl font-semibold">Add your accounts</h1>
                  <p className="mt-2 text-sm text-foreground-muted">
                    Add the checking, savings, cash, or credit card accounts you want to track — and how
                    much is in each right now. You can always add more later.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {accounts.map((account, i) => (
                    <div key={i} className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`acct-name-${i}`}>Name</Label>
                        <Input
                          id={`acct-name-${i}`}
                          value={account.name}
                          onChange={(e) => updateAccount(i, { name: e.target.value })}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Type</Label>
                        <Select value={account.type} onValueChange={(v) => updateAccount(i, { type: v })}>
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCOUNT_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {ACCOUNT_TYPE_LABELS[t]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`acct-balance-${i}`}>Balance</Label>
                        <Input
                          id={`acct-balance-${i}`}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="w-28"
                          value={account.startingBalance}
                          onChange={(e) => updateAccount(i, { startingBalance: e.target.value })}
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start"
                    onClick={() => setAccounts((prev) => [...prev, { name: "", type: "SAVINGS", startingBalance: "" }])}
                  >
                    + Add another account
                  </Button>
                </div>
                {error && <p className="text-sm text-negative">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(3)}>
                    Skip for now
                  </Button>
                  <Button onClick={handleCreateAccounts} disabled={loading} className="flex-1">
                    {loading ? "Saving…" : "Continue"}
                  </Button>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-xl font-semibold">When do you get paid?</h1>
                  <p className="mt-2 text-sm text-foreground-muted">
                    We&apos;ll show a heads-up on your dashboard before payday, so a tight-looking budget the
                    day before doesn&apos;t feel like something&apos;s wrong — it&apos;s just money that hasn&apos;t landed
                    yet. This never changes what you can actually assign; you&apos;ll still add the real
                    deposit as a transaction once it arrives.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label>Pay schedule</Label>
                  <Select value={payFrequency} onValueChange={(v) => setPayFrequency(v as PayFrequency)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WEEKLY">Weekly</SelectItem>
                      <SelectItem value="BIWEEKLY">Every 2 weeks</SelectItem>
                      <SelectItem value="SEMI_MONTHLY">Twice a month (e.g. 1st &amp; 15th)</SelectItem>
                      <SelectItem value="MONTHLY">Monthly</SelectItem>
                      <SelectItem value="SKIP">I&apos;ll set this up later</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {payFrequency !== "SKIP" && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="pay-date-1">{payFrequency === "SEMI_MONTHLY" ? "First payday" : "Next payday"}</Label>
                        <Input id="pay-date-1" type="date" value={payDate1} onChange={(e) => setPayDate1(e.target.value)} />
                      </div>
                      {payFrequency === "SEMI_MONTHLY" && (
                        <div className="flex flex-col gap-1.5">
                          <Label htmlFor="pay-date-2">Second payday</Label>
                          <Input id="pay-date-2" type="date" value={payDate2} onChange={(e) => setPayDate2(e.target.value)} />
                        </div>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor="pay-amount">Approximate amount</Label>
                        <Input
                          id="pay-amount"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label>Deposits to</Label>
                        <Select value={payAccountId ?? ""} onValueChange={setPayAccountId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select an account" />
                          </SelectTrigger>
                          <SelectContent>
                            {createdAccounts.map((a) => (
                              <SelectItem key={a.id} value={a.id}>
                                {a.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </>
                )}

                {error && <p className="text-sm text-negative">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => setStep(3)}>
                    Skip for now
                  </Button>
                  <Button onClick={handleCreatePaycheck} disabled={loading} className="flex-1">
                    {loading ? "Saving…" : "Continue"}
                  </Button>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div>
                  <h1 className="text-xl font-semibold">Create your categories</h1>
                  <p className="mt-2 text-sm text-foreground-muted">
                    Categories are where you plan spending — rent, groceries, gas, savings. Start with our
                    suggested set and customize freely, or build your own from scratch in the Budget screen.
                  </p>
                </div>
                <div className="rounded-md border border-border bg-surface-muted p-4 text-sm text-foreground-muted">
                  Housing · Food · Transportation · Health · Lifestyle · Savings · Debt — with common
                  categories under each.
                </div>
                {error && <p className="text-sm text-negative">{error}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => handleSeedCategories(false)} disabled={loading}>
                    I&apos;ll build my own
                  </Button>
                  <Button className="flex-1" onClick={() => handleSeedCategories(true)} disabled={loading}>
                    {loading ? "Adding…" : "Use suggested categories"}
                  </Button>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-5">
                <div>
                  <Sparkles className="size-8 text-accent" />
                  <h1 className="mt-3 text-xl font-semibold">Give your money a job</h1>
                  <p className="mt-2 text-sm text-foreground-muted">
                    When money arrives — a paycheck, a deposit — it lands in your{" "}
                    <strong className="text-foreground">Available to Budget</strong> pool. From there, you
                    assign it to categories until every dollar has somewhere to go. Spend from a category
                    and its <strong className="text-foreground">Available</strong> balance goes down — that&apos;s
                    always exactly what you can still safely spend.
                  </p>
                </div>
                <div className="rounded-md border border-border bg-brand-tint p-4 text-sm text-brand-strong">
                  You can add your first paycheck any time from the Accounts screen — no need to do it now.
                  (If you set up a pay schedule, that&apos;s just a heads-up on your dashboard; entering the
                  actual deposit is what makes it real money you can assign.)
                </div>
                <Button onClick={() => setStep(5)} size="lg">
                  Got it
                </Button>
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-col items-center gap-5 py-6 text-center">
                <div className="flex size-14 items-center justify-center rounded-full bg-positive-tint">
                  <Check className="size-7 text-positive" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold">You&apos;re ready.</h1>
                  <p className="mt-2 text-sm text-foreground-muted">
                    Your budget is set up. Head to the Budget screen to assign money, or the Dashboard for
                    the big picture.
                  </p>
                </div>
                {error && <p className="text-sm text-negative">{error}</p>}
                <Button onClick={handleFinish} disabled={loading} size="lg" className="w-full">
                  {loading ? "Finishing up…" : "Go to my dashboard"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
