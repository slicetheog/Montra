"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface GoalView {
  id: string;
  name: string;
  type: "TARGET_BALANCE" | "MONTHLY_CONTRIBUTION" | "TARGET_DATE" | "DEBT_PAYOFF";
  categoryId: string | null;
  category: { id: string; name: string } | null;
  accountId: string | null;
  account: { id: string; name: string } | null;
  targetAmountCents: number | null;
  targetDate: string | null;
  monthlyContributionCents: number | null;
  currentAmountCents: number;
  remainingCents: number;
  progress: { percentComplete: number; remainingCents: number; isComplete: boolean } | null;
  projection: unknown;
}

export interface CreateGoalInput {
  name: string;
  type: GoalView["type"];
  categoryId?: string;
  accountId?: string;
  targetAmountCents?: number;
  targetDate?: string;
  monthlyContributionCents?: number;
}

export function useGoals(budgetId: string | null) {
  return useQuery({
    queryKey: ["goals", budgetId],
    queryFn: () => api.get<GoalView[]>(`/api/budgets/${budgetId}/goals`),
    enabled: Boolean(budgetId),
  });
}

export function useCreateGoal(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => api.post(`/api/budgets/${budgetId}/goals`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", budgetId] });
    },
  });
}

export function useDeleteGoal(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/budgets/${budgetId}/goals/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", budgetId] });
    },
  });
}
