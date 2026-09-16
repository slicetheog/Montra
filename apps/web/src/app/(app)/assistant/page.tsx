"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, Sparkles } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useMe } from "@/hooks/use-me";
import { useAskAssistant, useGenerateMonthlyRecap, useMonthlyRecap } from "@/hooks/use-ai-assistant";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { monthStart } from "@montra/domain";
import { useFormatDate } from "@/hooks/use-locale-format";
import { ApiRequestError } from "@/lib/api-client";

const EXAMPLE_QUESTIONS = [
  "How much do I have left to spend on groceries this month?",
  "Which categories am I overspending in?",
  "Can I afford an extra $50/month subscription right now?",
];

export default function AssistantPage() {
  const { budgetId } = useCurrentBudget();
  const { data: me, isLoading } = useMe();

  if (!budgetId) return <EmptyBudgetState />;
  if (isLoading || !me) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-48 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  if (!me.aiAssistantAvailable) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold">AI Assistant</h1>
        <p className="mb-6 text-sm text-foreground-muted">Ask questions about your budget in plain English.</p>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Bot className="size-8 text-foreground-muted" />
            <p className="max-w-sm text-sm text-foreground-muted">
              This server doesn&apos;t have the AI assistant configured yet — an administrator needs to add a billed
              Anthropic API key before it can be turned on.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!me.settings?.aiAssistantEnabled) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold">AI Assistant</h1>
        <p className="mb-6 text-sm text-foreground-muted">Ask questions about your budget in plain English.</p>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Bot className="size-8 text-foreground-muted" />
            <p className="max-w-sm text-sm text-foreground-muted">
              The AI assistant is off by default since each question is a real, metered API call. Turn it on in
              Settings to start using it.
            </p>
            <Button asChild>
              <Link href="/settings?tab=preferences">Go to Settings</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <AssistantEnabled budgetId={budgetId} firstDayOfMonth={me.settings.firstDayOfMonth} />;
}

function AssistantEnabled({ budgetId, firstDayOfMonth }: { budgetId: string; firstDayOfMonth: number }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ask = useAskAssistant(budgetId);

  const month = monthStart(new Date(), firstDayOfMonth);
  const recap = useMonthlyRecap(budgetId, month);
  const generateRecap = useGenerateMonthlyRecap(budgetId, month);
  const formatDate = useFormatDate();

  async function submitQuestion() {
    setError(null);
    setAnswer(null);
    try {
      const result = await ask.mutateAsync(question);
      setAnswer(result.answer);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't get an answer. Please try again.");
    }
  }

  async function regenerateRecap() {
    setError(null);
    try {
      await generateRecap.mutateAsync(true);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Couldn't generate a recap. Please try again.");
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">AI Assistant</h1>
      <p className="mb-6 text-sm text-foreground-muted">Ask questions about your budget in plain English.</p>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-1.5">
            Ask a question
            <InfoTooltip content="Your question and a compact summary of your current budget (categories, upcoming bills, goals, net worth) are sent to Claude. No account credentials or full transaction history are ever included." />
          </CardTitle>
          <CardDescription>Answered using your real budget data — nothing is assigned or changed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Textarea
            placeholder="e.g. How much do I have left to spend on groceries this month?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={500}
          />
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuestion(q)}
                className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted hover:bg-surface-muted"
              >
                {q}
              </button>
            ))}
          </div>
          <div>
            <Button onClick={submitQuestion} disabled={ask.isPending || !question.trim()}>
              <Sparkles className="size-4" /> {ask.isPending ? "Thinking…" : "Ask"}
            </Button>
          </div>
          {error && <p className="text-sm text-negative">{error}</p>}
          {answer && (
            <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm whitespace-pre-wrap">{answer}</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Monthly recap</CardTitle>
          <CardDescription>A short, plain-English summary of this budget period.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recap.isLoading ? (
            <div className="h-16 animate-pulse rounded-lg bg-surface-muted" />
          ) : recap.data ? (
            <>
              <div className="rounded-lg border border-border bg-surface-muted p-3 text-sm whitespace-pre-wrap">{recap.data.text}</div>
              <p className="text-xs text-foreground-muted">Generated {formatDate(recap.data.generatedAt, "long")}</p>
              <div>
                <Button variant="outline" size="sm" onClick={regenerateRecap} disabled={generateRecap.isPending}>
                  {generateRecap.isPending ? "Regenerating…" : "Regenerate"}
                </Button>
              </div>
            </>
          ) : (
            <div>
              <Button onClick={regenerateRecap} disabled={generateRecap.isPending}>
                {generateRecap.isPending ? "Generating…" : "Generate recap"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
