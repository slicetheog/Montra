"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export type GoalPriority = "HIGH" | "MEDIUM" | "LOW";

export interface GoalView {
  id: string;
  name: string;
  type: "TARGET_BALANCE" | "MONTHLY_CONTRIBUTION" | "TARGET_DATE" | "DEBT_PAYOFF";
  categoryId: string | null;
  category: { id: string; name: string } | null;
  accountId: string | null;
  account: { id: string; name: string } | null;
  priority: GoalPriority;
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
  priority?: GoalPriority;
  targetAmountCents?: number;
  targetDate?: string;
  monthlyContributionCents?: number;
}

export interface GoalFeasibility {
  availableCents: number;
  totalRequestedCents: number;
  isOverCommitted: boolean;
  items: { id: string; name: string; priority: GoalPriority; monthlyTargetCents: number; cumulativeCents: number; fits: boolean }[];
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

export function useUpdateGoal(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CreateGoalInput> }) => api.patch(`/api/budgets/${budgetId}/goals/${id}`, input),
    // A prefix match, so this also invalidates the ["goals", budgetId, "feasibility"] query below.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals", budgetId] }),
  });
}

export function useGoalFeasibility(budgetId: string | null) {
  return useQuery({
    queryKey: ["goals", budgetId, "feasibility"],
    queryFn: () => api.get<GoalFeasibility>(`/api/budgets/${budgetId}/goals/feasibility`),
    enabled: Boolean(budgetId),
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
