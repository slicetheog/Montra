"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface DebtView {
  accountId: string;
  accountName: string;
  currentBalanceCents: number;
  debt: { originalBalanceCents: number; interestRateBps: number; minimumPaymentCents: number; dueDayOfMonth: number | null };
  projection: { months: number; payoffDate: string | null; totalInterestCents: number; totalPaidCents: number };
}

export function useDebts(budgetId: string | null) {
  return useQuery({
    queryKey: ["debts", budgetId],
    queryFn: () => api.get<{ debts: DebtView[]; totalDebtCents: number }>(`/api/budgets/${budgetId}/debts`),
    enabled: Boolean(budgetId),
  });
}

export interface DebtStrategyResult {
  strategy: "SNOWBALL" | "AVALANCHE";
  order: string[];
  totalMonths: number;
  payoffDate: string | null;
  totalInterestCents: number;
  perDebt: Record<string, { months: number; payoffDate: string | null; totalInterestCents: number }>;
}

export function useDebtStrategy(budgetId: string | null, extraMonthlyCents: number) {
  return useQuery({
    queryKey: ["debts", budgetId, "strategy", extraMonthlyCents],
    queryFn: () =>
      api.get<{ debtNames: Record<string, string>; snowball: DebtStrategyResult; avalanche: DebtStrategyResult }>(
        `/api/budgets/${budgetId}/debts/strategy?extraMonthlyCents=${extraMonthlyCents}`,
      ),
    // Debt page only needs this once >= 2 debts exist — a single debt has
    // only one possible "order," so there's nothing to compare.
    enabled: Boolean(budgetId),
  });
}

export function useUpsertDebt(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      accountId,
      ...input
    }: {
      accountId: string;
      originalBalanceCents: number;
      interestRateBps: number;
      minimumPaymentCents: number;
      dueDayOfMonth?: number;
    }) => api.put(`/api/budgets/${budgetId}/accounts/${accountId}/debt`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["debts", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
    },
  });
}
