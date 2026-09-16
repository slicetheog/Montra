"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface HoldingSnapshotView {
  quantity: number;
  priceCents: number;
  recordedAt: string;
}

export interface HoldingView {
  id: string;
  accountId: string;
  name: string;
  symbol: string | null;
  quantity: number;
  currentPriceCents: number;
  costBasisCents: number | null;
  marketValueCents: number;
  gainLossCents: number | null;
  gainLossPercent: number | null;
  snapshots: HoldingSnapshotView[];
}

export interface HoldingInput {
  name: string;
  symbol?: string;
  quantity: number;
  currentPriceCents: number;
  costBasisCents?: number;
}

export interface UpdateHoldingInput {
  name?: string;
  symbol?: string | null;
  quantity?: number;
  currentPriceCents?: number;
  costBasisCents?: number | null;
}

export function useHoldings(budgetId: string | null, accountId: string | null) {
  return useQuery({
    queryKey: ["holdings", budgetId, accountId],
    queryFn: () => api.get<HoldingView[]>(`/api/budgets/${budgetId}/accounts/${accountId}/holdings`),
    enabled: Boolean(budgetId && accountId),
  });
}

export function useCreateHolding(budgetId: string | null, accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: HoldingInput) => api.post(`/api/budgets/${budgetId}/accounts/${accountId}/holdings`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings", budgetId, accountId] });
      queryClient.invalidateQueries({ queryKey: ["net-worth", budgetId] });
    },
  });
}

export function useUpdateHolding(budgetId: string | null, accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ holdingId, patch }: { holdingId: string; patch: UpdateHoldingInput }) =>
      api.patch(`/api/budgets/${budgetId}/accounts/${accountId}/holdings/${holdingId}`, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings", budgetId, accountId] });
      queryClient.invalidateQueries({ queryKey: ["net-worth", budgetId] });
    },
  });
}

export function useDeleteHolding(budgetId: string | null, accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (holdingId: string) => api.del(`/api/budgets/${budgetId}/accounts/${accountId}/holdings/${holdingId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["holdings", budgetId, accountId] });
      queryClient.invalidateQueries({ queryKey: ["net-worth", budgetId] });
    },
  });
}

export function useSyncAccountValue(budgetId: string | null, accountId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ adjusted: boolean; adjustmentCents: number }>(
      `/api/budgets/${budgetId}/accounts/${accountId}/sync-value`,
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["net-worth", budgetId] });
    },
  });
}
