"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface DashboardSummary {
  netWorthCents: number;
  cashCents: number;
  totalDebtCents: number;
  monthIncomeCents: number;
  monthSpendingCents: number;
  readyToAssignCents: number;
  totalAssignedCents: number;
  totalAvailableCents: number;
  goals: Array<{
    id: string;
    name: string;
    type: string;
    progress: { percentComplete: number; remainingCents: number; isComplete: boolean } | null;
  }>;
  upcomingRecurring: Array<{
    id: string;
    amountCents: number;
    memo: string | null;
    nextOccurrenceDate: string;
    payee: { name: string } | null;
    account: { name: string };
  }>;
  recentTransactions: Array<{
    id: string;
    date: string;
    amountCents: number;
    payee: { name: string } | null;
    account: { name: string };
    type: string;
    splits: Array<{ category: { name: string } | null }>;
  }>;
}

export function useDashboard(budgetId: string | null) {
  return useQuery({
    queryKey: ["dashboard", budgetId],
    queryFn: () => api.get<DashboardSummary>(`/api/budgets/${budgetId}/dashboard`),
    enabled: Boolean(budgetId),
  });
}
