"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ImportRowView {
  id: string;
  rawDate: string;
  rawPayeeText: string;
  rawAmountCents: number;
  rawMemo: string | null;
  matchedCategoryId: string | null;
  matchedCategoryName: string | null;
  isDuplicate: boolean;
  willImport: boolean;
}

export interface ImportPreview {
  id: string;
  status: "PENDING" | "COMMITTED" | "CANCELLED";
  filename: string;
  account: { id: string; name: string };
  rows: ImportRowView[];
}

export function useImportPreview(budgetId: string | null, importId: string | null) {
  return useQuery({
    queryKey: ["import", budgetId, importId],
    queryFn: () => api.get<ImportPreview>(`/api/budgets/${budgetId}/import/${importId}`),
    enabled: Boolean(budgetId && importId),
  });
}

export function useStageImport(budgetId: string | null) {
  return useMutation({
    mutationFn: (input: { accountId: string; filename: string; rows: { date: string; payee: string; amountCents: number; memo?: string }[] }) =>
      api.post<ImportPreview>(`/api/budgets/${budgetId}/import`, input),
  });
}

export function useUpdateImportRow(budgetId: string | null, importId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ rowId, patch }: { rowId: string; patch: { willImport?: boolean; matchedCategoryId?: string | null } }) =>
      api.patch(`/api/budgets/${budgetId}/import/${importId}/rows/${rowId}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["import", budgetId, importId] }),
  });
}

export function useCommitImport(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (importId: string) => api.post<{ importedCount: number }>(`/api/budgets/${budgetId}/import/${importId}/commit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["budget-month", budgetId] });
    },
  });
}

export function useCancelImport(budgetId: string | null) {
  return useMutation({
    mutationFn: (importId: string) => api.post(`/api/budgets/${budgetId}/import/${importId}/cancel`),
  });
}
