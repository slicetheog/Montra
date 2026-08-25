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
