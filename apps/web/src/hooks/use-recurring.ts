"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface RecurringView {
  id: string;
  accountId: string;
  account: { id: string; name: string };
  payeeId: string | null;
  payee: { id: string; name: string } | null;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  amountCents: number;
  memo: string | null;
  type: string;
  frequency: string;
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  nextOccurrenceDate: string;
  reminderDaysBefore: number | null;
  autoCreate: boolean;
  isActive: boolean;
}

export interface RecurringCandidate {
  payeeId: string;
  payeeName: string;
  accountId: string;
  amountCents: number;
  frequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "YEARLY";
  occurrences: number;
  lastDate: string;
}

export function useRecurringSuggestions(budgetId: string | null) {
  return useQuery({
    queryKey: ["recurring", budgetId, "suggestions"],
    queryFn: () => api.get<RecurringCandidate[]>(`/api/budgets/${budgetId}/recurring/suggestions`),
    enabled: Boolean(budgetId),
  });
}

export interface CreateRecurringInput {
  accountId: string;
  payeeName?: string;
  categoryId?: string;
  amountCents: number;
  memo?: string;
  type: "EXPENSE" | "INCOME" | "REFUND" | "CREDIT_CARD_PAYMENT";
  frequency: "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "EVERY_N_MONTHS" | "YEARLY" | "CUSTOM";
  intervalCount?: number;
  startDate: string;
  endDate?: string;
  occurrencesLimit?: number;
  reminderDaysBefore?: number;
  autoCreate?: boolean;
}

export function useRecurring(budgetId: string | null) {
  return useQuery({
    queryKey: ["recurring", budgetId],
    queryFn: () => api.get<RecurringView[]>(`/api/budgets/${budgetId}/recurring`),
    enabled: Boolean(budgetId),
  });
}

export function useCreateRecurring(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRecurringInput) => api.post(`/api/budgets/${budgetId}/recurring`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["dashboard", budgetId] });
    },
  });
}

export function useUpdateRecurring(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<{ isActive: boolean; autoCreate: boolean }> }) =>
      api.patch(`/api/budgets/${budgetId}/recurring/${id}`, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring", budgetId] }),
  });
}

export function useDeleteRecurring(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/budgets/${budgetId}/recurring/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["recurring", budgetId] }),
  });
}
