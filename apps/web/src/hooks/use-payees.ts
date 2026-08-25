"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface PayeeView {
  id: string;
  name: string;
  defaultCategoryId: string | null;
  defaultCategory: { id: string; name: string } | null;
}

export function usePayees(budgetId: string | null) {
  return useQuery({
    queryKey: ["payees", budgetId],
    queryFn: () => api.get<PayeeView[]>(`/api/budgets/${budgetId}/payees`),
    enabled: Boolean(budgetId),
  });
}

export function usePayeeSuggestion(budgetId: string | null, payeeId: string | null) {
  return useQuery({
    queryKey: ["payee-suggestion", budgetId, payeeId],
    queryFn: () => api.get<{ suggestedCategoryId: string | null }>(`/api/budgets/${budgetId}/payees/${payeeId}`),
    enabled: Boolean(budgetId && payeeId),
  });
}
