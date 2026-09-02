"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useIncomeVsExpense, useSpendingByCategory, useSpendingByPayee } from "@/hooks/use-reports";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdBanner } from "@/components/ads/ad-banner";
import { useFormatCents } from "@/hooks/use-locale-format";
import { useResolvedTheme } from "@/components/providers/theme-provider";

// The dataviz skill's validated default categorical palette (blue, orange,
// aqua, yellow, magenta, green, violet, red) — fixed order, CVD-safe, and
// each row here already carries a visible name label, satisfying the
// contrast-relief rule for the three slots that dip below 3:1 on white.
// Separate light/dark steps (both from the same palette reference) rather
// than one fixed set, so the categorical colors stay validated for
// whichever surface they're actually rendering on.
const CHART_COLORS_LIGHT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const CHART_COLORS_DARK = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];
const LINE_COLOR = { light: "#2a78d6", dark: "#3987e5" };

type Period = "3mo" | "6mo" | "12mo" | "year" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  "3mo": "Last 3 months",
  "6mo": "Last 6 months",
  "12mo": "Last 12 months",
  year: "This year",
  all: "All time",
};

/** ISO date for the 1st of the month `monthsBack - 1` months before today (i.e. a trailing `monthsBack`-month window ending today). */
function monthsAgoIso(monthsBack: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (monthsBack - 1), 1)).toISOString().slice(0, 10);
}

/**
 * Both a trailing-month count (for the monthly-bucketed trend charts,
 * which need a whole number of months) and an explicit from/to range
 * (for the lifetime-aggregate breakdowns, which the API already supports
 * — see spending-by-category/payee) — kept in sync from one selection so
 * "This year" means the same thing across every chart on the page.
 */
function periodToRange(period: Period): { months: number; from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (period === "all") return { months: 60 }; // no from/to: true all-time for the breakdown charts
  if (period === "year") return { months: now.getUTCMonth() + 1, from: `${now.getUTCFullYear()}-01-01`, to };
  const months = period === "3mo" ? 3 : period === "12mo" ? 12 : 6;
  return { months, from: monthsAgoIso(months), to };
}

export default function ReportsPage() {
  const { budgetId } = useCurrentBudget();
  const [period, setPeriod] = useState<Period>("6mo");
  const range = periodToRange(period);
  const byCategory = useSpendingByCategory(budgetId, { from: range.from, to: range.to });
  const byPayee = useSpendingByPayee(budgetId, { from: range.from, to: range.to });
  const monthly = useIncomeVsExpense(budgetId, range.months);
  const formatCents = useFormatCents();
  const resolvedTheme = useResolvedTheme();
  const CHART_COLORS = resolvedTheme === "dark" ? CHART_COLORS_DARK : CHART_COLORS_LIGHT;
  const lineColor = LINE_COLOR[resolvedTheme];

  if (!budgetId) return <EmptyBudgetState />;

  const hasAnyData = (byCategory.data?.length ?? 0) > 0 || (monthly.data?.some((m) => m.incomeCents || m.expenseCents) ?? false);

  return (
    <div className="flex flex-col">
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mb-1 text-xl font-semibold">Reports</h1>
            <p className="text-sm text-foreground-muted">See where your money has been going.</p>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <SelectItem key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!hasAnyData ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-strong py-16 text-center">
            <p className="text-foreground-muted">Add a few transactions to see reports here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Income vs. spending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly.data ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--foreground-muted)" />
                      <YAxis tickFormatter={(v) => formatCents(v)} width={70} tick={{ fontSize: 11 }} stroke="var(--foreground-muted)" />
                      <Tooltip
                        formatter={(value: number) => formatCents(value)}
                        contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
                      />
                      <Bar dataKey="incomeCents" name="Income" fill="#147d5f" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expenseCents" name="Spending" fill="#b3261e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Net cash flow</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={monthly.data ?? []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--foreground-muted)" />
                      <YAxis tickFormatter={(v) => formatCents(v)} width={70} tick={{ fontSize: 11 }} stroke="var(--foreground-muted)" />
                      <Tooltip
                        formatter={(value: number) => formatCents(value)}
                        contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
                      />
                      <Line type="monotone" dataKey="netCents" name="Net" stroke={lineColor} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spending by category</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {(byCategory.data ?? []).slice(0, 10).map((row, i) => {
                    const max = byCategory.data?.[0]?.amountCents ?? 1;
                    return (
                      <li key={row.categoryId}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate">{row.categoryName}</span>
                          <span className="font-medium tabular-nums">{formatCents(row.amountCents)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(row.amountCents / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Spending by payee</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {(byPayee.data ?? []).slice(0, 10).map((row, i) => {
                    const max = byPayee.data?.[0]?.amountCents ?? 1;
                    return (
                      <li key={row.payeeId}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate">{row.payeeName}</span>
                          <span className="font-medium tabular-nums">{formatCents(row.amountCents)}</span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${(row.amountCents / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <AdBanner slot="reports-footer" />
    </div>
  );
}
