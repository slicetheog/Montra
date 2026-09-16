"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { monthKey } from "@/hooks/use-budget-month";

export interface MonthlyRecap {
  text: string;
  generatedAt: string;
}

export function useAskAssistant(budgetId: string | null) {
  return useMutation({
    mutationFn: (question: string) => api.post<{ answer: string }>(`/api/budgets/${budgetId}/ai-assistant/ask`, { question }),
  });
}

export function useMonthlyRecap(budgetId: string | null, month: Date) {
  const key = monthKey(month);
  return useQuery({
    queryKey: ["monthly-recap", budgetId, key],
    queryFn: () => api.get<MonthlyRecap | null>(`/api/budgets/${budgetId}/ai-assistant/recap/${key}`),
    enabled: Boolean(budgetId),
  });
}

export function useGenerateMonthlyRecap(budgetId: string | null, month: Date) {
  const queryClient = useQueryClient();
  const key = monthKey(month);
  return useMutation({
    mutationFn: (force?: boolean) => api.post<MonthlyRecap>(`/api/budgets/${budgetId}/ai-assistant/recap/${key}`, { force }),
    onSuccess: (data) => {
      queryClient.setQueryData(["monthly-recap", budgetId, key], data);
    },
  });
}
