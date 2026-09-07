"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface TagView {
  id: string;
  name: string;
}

export function useTags(budgetId: string | null) {
  return useQuery({
    queryKey: ["tags", budgetId],
    queryFn: () => api.get<TagView[]>(`/api/budgets/${budgetId}/tags`),
    enabled: Boolean(budgetId),
  });
}

export function useDeleteTag(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tagId: string) => api.del(`/api/budgets/${budgetId}/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tags", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["transactions", budgetId] });
    },
  });
}
