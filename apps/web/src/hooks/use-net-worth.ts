"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface NetWorthNow {
  netWorthCents: number;
  totalAssetsCents: number;
  totalLiabilitiesCents: number;
  assets: { id: string; name: string; type: string; balanceCents: number }[];
  liabilities: { id: string; name: string; type: string; balanceCents: number }[];
}

export function useNetWorthNow(budgetId: string | null) {
  return useQuery({
    queryKey: ["net-worth", budgetId],
    queryFn: () => api.get<NetWorthNow>(`/api/budgets/${budgetId}/net-worth`),
    enabled: Boolean(budgetId),
  });
}

export function useNetWorthHistory(budgetId: string | null, months = 12) {
  return useQuery({
    queryKey: ["net-worth", budgetId, "history", months],
    queryFn: () => api.get<{ month: string; netWorthCents: number }[]>(`/api/budgets/${budgetId}/net-worth/history?months=${months}`),
    enabled: Boolean(budgetId),
  });
}
