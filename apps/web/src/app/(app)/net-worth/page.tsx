"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentBudget } from "@/hooks/use-current-budget";
import { useNetWorthHistory, useNetWorthNow } from "@/hooks/use-net-worth";
import { EmptyBudgetState } from "@/components/layout/empty-budget-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ACCOUNT_TYPE_LABELS } from "@/lib/constants";
import { useFormatCents } from "@/hooks/use-locale-format";
import { useResolvedTheme } from "@/components/providers/theme-provider";

// Same blue as Reports' "Net cash flow" line — the dataviz palette's
// slot-1 series color, light and dark steps.
const LINE_COLOR = { light: "#2a78d6", dark: "#3987e5" };

export default function NetWorthPage() {
  const { budgetId } = useCurrentBudget();
  const now = useNetWorthNow(budgetId);
  const history = useNetWorthHistory(budgetId, 12);
  const formatCents = useFormatCents();
  const lineColor = LINE_COLOR[useResolvedTheme()];

  if (!budgetId) return <EmptyBudgetState />;
  if (now.isLoading || !now.data) {
    return (
      <div className="p-4 sm:p-6">
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold">Net Worth</h1>
      <p className="mb-6 text-sm text-foreground-muted">Assets minus liabilities, tracked over time.</p>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-foreground-muted">Net worth</p>
          <p className={`text-xl font-semibold tabular-nums ${now.data.netWorthCents < 0 ? "text-negative" : ""}`}>
            {formatCents(now.data.netWorthCents)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-foreground-muted">Assets</p>
          <p className="text-xl font-semibold tabular-nums text-positive">{formatCents(now.data.totalAssetsCents)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-foreground-muted">Liabilities</p>
          <p className="text-xl font-semibold tabular-nums text-negative">{formatCents(-now.data.totalLiabilitiesCents)}</p>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--foreground-muted)" />
                <YAxis tickFormatter={(v) => formatCents(v)} width={80} tick={{ fontSize: 11 }} stroke="var(--foreground-muted)" />
                <Tooltip
                  formatter={(value: number) => formatCents(value)}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }}
                />
                <Line type="monotone" dataKey="netWorthCents" name="Net worth" stroke={lineColor} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {now.data.assets.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span>
                    {a.name} <span className="text-foreground-muted">· {ACCOUNT_TYPE_LABELS[a.type]}</span>
                  </span>
                  <span className="font-medium tabular-nums">{formatCents(a.balanceCents)}</span>
                </li>
              ))}
              {now.data.assets.length === 0 && <p className="text-sm text-foreground-muted">No asset accounts yet.</p>}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {now.data.liabilities.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm">
                  <span>
                    {a.name} <span className="text-foreground-muted">· {ACCOUNT_TYPE_LABELS[a.type]}</span>
                  </span>
                  <span className="font-medium tabular-nums text-negative">{formatCents(a.balanceCents)}</span>
                </li>
              ))}
              {now.data.liabilities.length === 0 && <p className="text-sm text-foreground-muted">No liability accounts yet.</p>}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
