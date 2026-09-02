"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ReportDateRange {
  from?: string;
  to?: string;
}

function rangeParams(range?: ReportDateRange) {
  const params = new URLSearchParams();
  if (range?.from) params.set("from", range.from);
  if (range?.to) params.set("to", range.to);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function useSpendingByCategory(budgetId: string | null, range?: ReportDateRange) {
  return useQuery({
    queryKey: ["reports", budgetId, "by-category", range],
    queryFn: () =>
      api.get<{ categoryId: string; categoryName: string; groupName: string; amountCents: number }[]>(
        `/api/budgets/${budgetId}/reports/spending-by-category${rangeParams(range)}`,
      ),
    enabled: Boolean(budgetId),
  });
}

export function useSpendingByPayee(budgetId: string | null, range?: ReportDateRange) {
  return useQuery({
    queryKey: ["reports", budgetId, "by-payee", range],
    queryFn: () =>
      api.get<{ payeeId: string; payeeName: string; amountCents: number }[]>(
        `/api/budgets/${budgetId}/reports/spending-by-payee${rangeParams(range)}`,
      ),
    enabled: Boolean(budgetId),
  });
}

export function useIncomeVsExpense(budgetId: string | null, months = 6) {
  return useQuery({
    queryKey: ["reports", budgetId, "income-vs-expense", months],
    queryFn: () =>
      api.get<{ month: string; incomeCents: number; expenseCents: number; netCents: number }[]>(
        `/api/budgets/${budgetId}/reports/income-vs-expense?months=${months}`,
      ),
    enabled: Boolean(budgetId),
  });
}
