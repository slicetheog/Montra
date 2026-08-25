"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useIncomeVsExpense, useSpendingByCategory, useSpendingByPayee } from "@/hooks/use-reports";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AdBanner } from "@/components/ads/ad-banner";
import { formatCents } from "@/lib/utils";

const CHART_COLORS = ["#0f5f57", "#b3781c", "#147d5f", "#a8641b", "#5c625f", "#0b4a44", "#8b8f89"];

export default function ReportsPage() {
  const { budgetId } = useCurrentBudget();
  const byCategory = useSpendingByCategory(budgetId);
  const byPayee = useSpendingByPayee(budgetId);
  const monthly = useIncomeVsExpense(budgetId, 6);

  if (!budgetId) return <EmptyBudgetState />;

  const hasAnyData = (byCategory.data?.length ?? 0) > 0 || (monthly.data?.some((m) => m.incomeCents || m.expenseCents) ?? false);

  return (
    <div className="flex flex-col">
      <div className="p-4 sm:p-6">
        <h1 className="mb-1 text-xl font-semibold">Reports</h1>
        <p className="mb-6 text-sm text-foreground-muted">See where your money has been going.</p>

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
                      <Line type="monotone" dataKey="netCents" name="Net" stroke="#0f5f57" strokeWidth={2} dot={false} />
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
