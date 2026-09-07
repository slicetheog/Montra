"use client";

import Link from "next/link";
import { CalendarClock, PiggyBank, Target, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useDashboard, type DashboardSummary } from "@/hooks/use-dashboard";
import { useMe } from "@/hooks/use-me";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AdBanner } from "@/components/ads/ad-banner";
import { daysUntil, cn } from "@/lib/utils";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";

export default function DashboardPage() {
  const { budgetId, budget } = useCurrentBudget();
  const { data, isLoading } = useDashboard(budgetId);
  const { data: me } = useMe();
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();

  if (!budgetId) return <EmptyBudgetState />;
  if (isLoading || !data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  const assignedPercent = data.readyToAssignCents + data.totalAssignedCents > 0
    ? Math.min(100, (data.totalAssignedCents / (data.readyToAssignCents + data.totalAssignedCents)) * 100)
    : 100;

  return (
    <div className="flex flex-col">
      <div className="p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold">Welcome back{me?.user?.name ? `, ${me.user.name}` : ""}</h1>
        <p className="mb-4 text-sm text-foreground-muted">
          Here&apos;s how {budget ? budget.name : "your budget"} looks right now.
        </p>

        <NextPaycheckBanner nextPaycheck={data.nextPaycheck} />

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={TrendingUp} label="Net worth" cents={data.netWorthCents} />
          <StatCard icon={Wallet} label="Cash" cents={data.cashCents} />
          <StatCard
            icon={TrendingDown}
            label="Debt"
            cents={-data.totalDebtCents}
            tone={data.totalDebtCents > 0 ? "negative" : undefined}
            href={data.totalDebtCents > 0 ? "/debt" : undefined}
            caption={
              data.debtInterestProjection.totalInterestCents > 0
                ? `≈ ${formatCents(data.debtInterestProjection.totalInterestCents)} interest ahead`
                : undefined
            }
          />
          <StatCard icon={PiggyBank} label="Available to budget" cents={data.readyToAssignCents} href="/budget" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>This month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-foreground-muted">Income</p>
                  <p className="text-lg font-semibold tabular-nums text-positive">{formatCents(data.monthIncomeCents)}</p>
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Spending</p>
                  <p className="text-lg font-semibold tabular-nums">{formatCents(-data.monthSpendingCents)}</p>
                  {data.spendingPace && (
                    <p className="mt-0.5 text-[11px] text-foreground-muted">
                      On pace for {formatCents(-data.spendingPace.projectedFullMonthCents)}
                      {data.spendingPace.changeVsLastMonth != null && (
                        <span className={data.spendingPace.changeVsLastMonth > 0 ? "text-negative" : "text-positive"}>
                          {" "}
                          ({data.spendingPace.changeVsLastMonth > 0 ? "↑" : "↓"}
                          {Math.round(Math.abs(data.spendingPace.changeVsLastMonth) * 100)}% vs last month)
                        </span>
                      )}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs text-foreground-muted">Assigned</p>
                  <p className="text-lg font-semibold tabular-nums">{formatCents(data.totalAssignedCents)}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs text-foreground-muted">
                  <span>Budget progress</span>
                  <span>{Math.round(assignedPercent)}% assigned</span>
                </div>
                <Progress value={assignedPercent} aria-label="Budget progress" />
              </div>
              <Link href="/budget" className="mt-4 inline-block text-sm font-medium text-brand underline underline-offset-2">
                Go to Budget →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Goals</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {data.goals.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  No goals yet.{" "}
                  <Link href="/goals" className="text-brand underline underline-offset-2">
                    Create one
                  </Link>
                  .
                </p>
              ) : (
                data.goals.map((goal) => (
                  <div key={goal.id}>
                    <div className="mb-1 flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 font-medium">
                        <Target className="size-3.5 text-accent" /> {goal.name}
                      </span>
                      <span className="text-foreground-muted">{goal.progress ? `${Math.round(goal.progress.percentComplete)}%` : "—"}</span>
                    </div>
                    <Progress value={goal.progress?.percentComplete ?? 0} aria-label={`${goal.name} progress`} />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent transactions</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentTransactions.length === 0 ? (
                <p className="text-sm text-foreground-muted">No transactions yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.recentTransactions.map((txn) => (
                    <li key={txn.id} className="flex items-center justify-between text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{txn.payee?.name ?? txn.account.name}</p>
                        <p className="truncate text-xs text-foreground-muted">
                          {formatDate(txn.date)} · {txn.splits[0]?.category?.name ?? txn.type}
                        </p>
                      </div>
                      <span className={cn("shrink-0 tabular-nums font-medium", txn.amountCents >= 0 && "text-positive")}>
                        {formatCents(txn.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/accounts" className="mt-3 inline-block text-sm font-medium text-brand underline underline-offset-2">
                View all transactions →
              </Link>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Upcoming</CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcomingRecurring.length === 0 ? (
                <p className="text-sm text-foreground-muted">No upcoming recurring transactions.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {data.upcomingRecurring.map((r) => (
                    <li key={r.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium">{r.payee?.name ?? r.memo ?? r.account.name}</p>
                        <p className="text-xs text-foreground-muted">{formatDate(r.nextOccurrenceDate)}</p>
                      </div>
                      <span className="tabular-nums font-medium">{formatCents(r.amountCents)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/recurring" className="mt-3 inline-block text-sm font-medium text-brand underline underline-offset-2">
                Manage recurring transactions →
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>

      <AdBanner slot="dashboard-footer" />
    </div>
  );
}

/**
 * A forecast, not a balance: this never changes what "Available to
 * Budget" says, only tells you something's coming before it lands — see
 * the nextPaycheck field's doc comment in use-dashboard.ts for why.
 */
function NextPaycheckBanner({ nextPaycheck }: { nextPaycheck: DashboardSummary["nextPaycheck"] }) {
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();
  if (!nextPaycheck) {
    return (
      <Link
        href="/recurring"
        className="mb-4 flex items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-foreground-muted hover:border-brand hover:text-foreground"
      >
        <CalendarClock className="size-4 shrink-0" />
        Want a heads-up before payday? Set up your paycheck schedule.
      </Link>
    );
  }

  const days = daysUntil(nextPaycheck.date);
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `${formatDate(nextPaycheck.date)} (in ${days} days)`;

  return (
    <Card className="mb-4 bg-brand-tint">
      <CardContent className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
          <CalendarClock className="size-4.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            {nextPaycheck.payeeName ?? "Next paycheck"}: {formatCents(nextPaycheck.amountCents)} into{" "}
            {nextPaycheck.accountName} — {when}
          </p>
          <p className="text-xs text-foreground-muted">
            This is a heads-up, not a balance — Available to Budget won&apos;t include it until you add it as an
            actual transaction once it lands.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  cents,
  tone,
  href,
  caption,
}: {
  icon: typeof Wallet;
  label: string;
  cents: number;
  tone?: "negative";
  href?: string;
  caption?: string;
}) {
  const formatCents = useFormatCents();
  const content = (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-foreground-muted">
        <Icon className="size-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p
        className={cn(
          "mt-2 text-xl font-semibold tabular-nums",
          tone === "negative" || cents < 0 ? "text-negative" : "",
        )}
      >
        {formatCents(cents)}
      </p>
      {caption && <p className="mt-0.5 truncate text-[11px] text-foreground-muted">{caption}</p>}
    </Card>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}
