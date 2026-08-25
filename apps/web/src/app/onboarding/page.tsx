"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Check, PiggyBank, Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, ApiRequestError } from "@/lib/api-client";
import { ACCOUNT_TYPES, ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

interface DraftAccount {
  name: string;
  type: string;
  startingBalance: string; // decimal string from the input
}

const STEPS = ["Welcome", "Accounts", "Categories", "Give it a job", "Done"];

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
      for (const a of usable) {
        const cents = Math.round((parseFloat(a.startingBalance || "0") || 0) * 100);
        await api.post(`/api/budgets/${budgetId}/accounts`, {
          name: a.name.trim(),
          type: a.type,
          startingBalanceCents: cents,
        });
      }
      setStep(2);
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
      setStep(3);
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
                  <Button variant="ghost" onClick={() => setStep(2)}>
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

            {step === 3 && (
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
                  You can add your first paycheck any time from the Budget screen — no need to do it now.
                </div>
                <Button onClick={() => setStep(4)} size="lg">
                  Got it
                </Button>
              </div>
            )}

            {step === 4 && (
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
