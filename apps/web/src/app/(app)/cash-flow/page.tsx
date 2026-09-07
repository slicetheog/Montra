"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Waves } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useCashFlowForecast, type PayPeriod } from "@/hooks/use-cash-flow";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";
import { useFormatCents, useFormatDate } from "@/hooks/use-locale-format";
import { useResolvedTheme } from "@/components/providers/theme-provider";

// Same blue as Net Worth's trend line and Reports' "Net cash flow" line —
// the dataviz palette's slot-1 series color, light and dark steps.
const LINE_COLOR = { light: "#2a78d6", dark: "#3987e5" };
const NEGATIVE_LINE_COLOR = { light: "#e34948", dark: "#e66767" };

const HORIZON_OPTIONS = [30, 60, 90] as const;

export default function CashFlowPage() {
  const { budgetId } = useCurrentBudget();
  const [horizonDays, setHorizonDays] = useState<(typeof HORIZON_OPTIONS)[number]>(60);
  const forecast = useCashFlowForecast(budgetId, horizonDays);
  const formatCents = useFormatCents();
  const formatDate = useFormatDate();
  const lineColor = LINE_COLOR[useResolvedTheme()];
  const negativeLineColor = NEGATIVE_LINE_COLOR[useResolvedTheme()];

  if (!budgetId) return <EmptyBudgetState />;
  if (forecast.isLoading || !forecast.data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  const data = forecast.data;
  const willGoNegative = data.firstNegativeDate != null;
  const chartData = data.days.map((d) => ({ date: d.date, balanceCents: d.balanceCents }));

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Cash Flow</h1>
        <Select value={String(horizonDays)} onValueChange={(v) => setHorizonDays(Number(v) as (typeof HORIZON_OPTIONS)[number])}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HORIZON_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                Next {d} days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="mb-6 text-sm text-foreground-muted">
        A forecast, not a balance — projects {data.accountNames.length > 0 ? data.accountNames.join(", ") : "your cash accounts"} forward
        using your scheduled paychecks and bills. Nothing here counts until it actually lands as a real transaction.
      </p>

      {!data.hasScheduledSeries ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
          <Waves className="size-8 text-foreground-muted" />
          <p className="text-foreground-muted">No scheduled paychecks or bills to project yet.</p>
          <p className="max-w-sm text-sm text-foreground-muted">
            Set up recurring transactions for your income and bills, and this page will show whether the money will be there when
            they&apos;re due.
          </p>
          <Link href="/recurring" className="text-sm font-medium text-brand underline underline-offset-2">
            Set up recurring transactions →
          </Link>
        </div>
      ) : (
        <>
          <Card
            className={cn(
              "mb-4 flex items-start gap-3 p-4",
              willGoNegative ? "border-negative/30 bg-negative/5" : "border-positive/30 bg-positive/5",
            )}
          >
            {willGoNegative ? (
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-negative" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-positive" />
            )}
            <div className="text-sm">
              {willGoNegative ? (
                <p>
                  Projected to go <span className="font-medium text-negative">negative on {formatDate(data.firstNegativeDate!)}</span>,
                  dropping as low as <span className="font-medium">{formatCents(data.lowestBalanceCents)}</span> around{" "}
                  {formatDate(data.lowestBalanceDate)}.
                </p>
              ) : (
                <p>
                  Projected to stay positive for the next {data.horizonDays} days — lowest point is{" "}
                  <span className="font-medium">{formatCents(data.lowestBalanceCents)}</span> around {formatDate(data.lowestBalanceDate)}.
                </p>
              )}
            </div>
          </Card>

          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Projected balance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={(v) => formatDate(v, "short")} tick={{ fontSize: 11 }} stroke="var(--foreground-muted)" />
                    <YAxis tickFormatter={(v) => formatCents(v)} width={80} tick={{ fontSize: 11 }} stroke="var(--foreground-muted)" />
                    <Tooltip
                      labelFormatter={(v) => formatDate(v as string)}
                      formatter={(value: number) => formatCents(value)}
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
                    />
                    <ReferenceLine y={0} stroke={negativeLineColor} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="balanceCents" name="Balance" stroke={lineColor} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pay periods</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-foreground-muted">
                Each stretch from one paycheck to the next — does this paycheck cover what&apos;s due before the next one lands?
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-foreground-muted">
                      <th className="py-2 pr-3 font-medium">Period</th>
                      <th className="py-2 pr-3 text-right font-medium">Income</th>
                      <th className="py-2 pr-3 text-right font-medium">Outflow</th>
                      <th className="py-2 pr-3 text-right font-medium">Ending balance</th>
                      <th className="py-2 text-right font-medium">
                        <span className="inline-flex items-center gap-1">
                          Status
                          <InfoTooltip content="Short means the running balance is actually projected to dip below zero sometime in this period — not just that this period's own bills exceed its own income. A cushion carried over from an earlier period counts." />
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.payPeriods.map((period, i) => (
                      <PayPeriodRow key={i} period={period} formatCents={formatCents} formatDate={formatDate} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PayPeriodRow({
  period,
  formatCents,
  formatDate,
}: {
  period: PayPeriod;
  formatCents: (cents: number) => string;
  formatDate: (date: string, format?: "short" | "long") => string;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-2 pr-3">
        {formatDate(period.startDate, "short")} – {formatDate(period.endDate, "short")}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums text-positive">{period.incomeCents > 0 ? formatCents(period.incomeCents) : "—"}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{period.outflowCents < 0 ? formatCents(period.outflowCents) : "—"}</td>
      <td className={cn("py-2 pr-3 text-right font-medium tabular-nums", period.endingBalanceCents < 0 && "text-negative")}>
        {formatCents(period.endingBalanceCents)}
      </td>
      <td className="py-2 text-right">
        {period.isShort ? (
          <span className="rounded-full bg-negative/10 px-2 py-0.5 text-xs font-medium text-negative">Short</span>
        ) : (
          <span className="rounded-full bg-positive/10 px-2 py-0.5 text-xs font-medium text-positive">OK</span>
        )}
      </td>
    </tr>
  );
}
