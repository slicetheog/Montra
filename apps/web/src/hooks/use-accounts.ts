"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface AccountBalances {
  currentCents: number;
  clearedCents: number;
  unclearedCents: number;
}

export interface CreateAccountInput {
  name: string;
  type: string;
  institution?: string;
  notes?: string;
  onBudget?: boolean;
  startingBalanceCents: number;
  startingDate?: string;
}

export interface UpdateAccountInput {
  name?: string;
  institution?: string | null;
  notes?: string | null;
  isClosed?: boolean;
  onBudget?: boolean;
}

export interface AccountView {
  id: string;
  budgetId: string;
  name: string;
  type: string;
  institution: string | null;
  notes: string | null;
  isClosed: boolean;
  onBudget: boolean;
  balances: AccountBalances;
  debt: { id: string; interestRateBps: number; minimumPaymentCents: number; dueDayOfMonth: number | null } | null;
}

export function useAccounts(budgetId: string | null) {
  return useQuery({
    queryKey: ["accounts", budgetId],
    queryFn: () => api.get<AccountView[]>(`/api/budgets/${budgetId}/accounts`),
    enabled: Boolean(budgetId),
  });
}

export function useAccount(budgetId: string | null, accountId: string | null) {
  return useQuery({
    queryKey: ["accounts", budgetId, accountId],
    queryFn: () => api.get<AccountView>(`/api/budgets/${budgetId}/accounts/${accountId}`),
    enabled: Boolean(budgetId && accountId),
  });
}

export function useCreateAccount(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => api.post(`/api/budgets/${budgetId}/accounts`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-month", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["categories", budgetId] });
    },
  });
}

export function useUpdateAccount(budgetId: string | null, accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAccountInput) => api.patch(`/api/budgets/${budgetId}/accounts/${accountId}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
    },
  });
}

export function useDeleteAccount(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (accountId: string) => api.del(`/api/budgets/${budgetId}/accounts/${accountId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
    },
  });
}
