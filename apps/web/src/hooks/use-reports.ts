"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export function useSpendingByCategory(budgetId: string | null) {
  return useQuery({
    queryKey: ["reports", budgetId, "by-category"],
    queryFn: () =>
      api.get<{ categoryId: string; categoryName: string; groupName: string; amountCents: number }[]>(
        `/api/budgets/${budgetId}/reports/spending-by-category`,
      ),
    enabled: Boolean(budgetId),
  });
}

export function useSpendingByPayee(budgetId: string | null) {
  return useQuery({
    queryKey: ["reports", budgetId, "by-payee"],
    queryFn: () =>
      api.get<{ payeeId: string; payeeName: string; amountCents: number }[]>(`/api/budgets/${budgetId}/reports/spending-by-payee`),
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
