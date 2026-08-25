"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface CategoryListItem {
  id: string;
  name: string;
  isSystem: boolean;
  linkedAccountId: string | null;
}

export interface CategoryGroupListItem {
  id: string;
  name: string;
  isSystem: boolean;
  categories: CategoryListItem[];
}

export function useCategories(budgetId: string | null) {
  return useQuery({
    queryKey: ["categories", budgetId],
    queryFn: () => api.get<CategoryGroupListItem[]>(`/api/budgets/${budgetId}/categories`),
    enabled: Boolean(budgetId),
  });
}
