"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface CategoryMonthView {
  categoryId: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  goalId: string | null;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
}

export interface CategoryGroupView {
  groupId: string;
  name: string;
  sortOrder: number;
  isSystem: boolean;
  categories: CategoryMonthView[];
}

export interface MonthView {
  month: string;
  groups: CategoryGroupView[];
  totals: { totalAssignedCents: number; totalActivityCents: number; totalAvailableCents: number };
  readyToAssignCents: number;
}

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function useBudgetMonth(budgetId: string | null, month: Date) {
  const key = monthKey(month);
  return useQuery({
    queryKey: ["budget-month", budgetId, key],
    queryFn: () => api.get<MonthView>(`/api/budgets/${budgetId}/months/${key}`),
    enabled: Boolean(budgetId),
  });
}

export function useAssignMoney(budgetId: string | null, month: Date) {
  const queryClient = useQueryClient();
  const key = monthKey(month);
  return useMutation({
    mutationFn: (input: { categoryId: string; amountCents: number; memo?: string }) =>
      api.post(`/api/budgets/${budgetId}/months/${key}/assign`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-month", budgetId] });
    },
  });
}

export function useMoveMoney(budgetId: string | null, month: Date) {
  const queryClient = useQueryClient();
  const key = monthKey(month);
  return useMutation({
    mutationFn: (input: { fromCategoryId: string; toCategoryId: string; amountCents: number }) =>
      api.post(`/api/budgets/${budgetId}/months/${key}/move`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget-month", budgetId] });
    },
  });
}
