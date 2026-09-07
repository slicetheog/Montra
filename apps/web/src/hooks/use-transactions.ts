"use client";

import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface SplitView {
  id: string;
  categoryId: string | null;
  category: { id: string; name: string } | null;
  amountCents: number;
  memo: string | null;
}

export interface TransactionView {
  id: string;
  accountId: string;
  account: { id: string; name: string; type: string };
  payeeId: string | null;
  payee: { id: string; name: string } | null;
  transferAccountId: string | null;
  transferAccount: { id: string; name: string } | null;
  date: string;
  amountCents: number;
  memo: string | null;
  type: string;
  cleared: "UNCLEARED" | "CLEARED" | "RECONCILED";
  isSplit: boolean;
  splits: SplitView[];
  tags: { id: string; name: string }[];
}

export interface TransactionFilters {
  accountId?: string;
  categoryId?: string;
  payeeId?: string;
  tagId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface SplitInput {
  categoryId: string | null;
  amountCents: number;
  memo?: string;
}

export interface CreateTransactionInput {
  accountId: string;
  date: string;
  payeeId?: string;
  payeeName?: string;
  memo?: string;
  cleared?: "UNCLEARED" | "CLEARED" | "RECONCILED";
  type: "EXPENSE" | "INCOME" | "TRANSFER" | "REFUND" | "CREDIT_CARD_PAYMENT";
  amountCents: number;
  splits?: SplitInput[];
  transferAccountId?: string;
}

export type UpdateTransactionInput = Partial<Omit<CreateTransactionInput, "type" | "transferAccountId">>;

function filtersToParams(filters: TransactionFilters, cursor?: string) {
  const params = new URLSearchParams();
  if (filters.accountId) params.set("accountId", filters.accountId);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  if (filters.payeeId) params.set("payeeId", filters.payeeId);
  if (filters.tagId) params.set("tagId", filters.tagId);
  if (filters.search) params.set("search", filters.search);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (cursor) params.set("cursor", cursor);
  return params.toString();
}

export function useTransactions(budgetId: string | null, filters: TransactionFilters) {
  return useInfiniteQuery({
    queryKey: ["transactions", budgetId, filters],
    queryFn: ({ pageParam }: { pageParam?: string }) =>
      api.get<{ items: TransactionView[]; nextCursor: string | null }>(
        `/api/budgets/${budgetId}/transactions?${filtersToParams(filters, pageParam)}`,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(budgetId),
  });
}

/** Shared by anything that creates real transactions outside this file's own mutations (e.g. logging a payment against a recurring series). */
export function invalidateAfterMutation(queryClient: ReturnType<typeof useQueryClient>, budgetId: string | null) {
  queryClient.invalidateQueries({ queryKey: ["transactions", budgetId] });
  queryClient.invalidateQueries({ queryKey: ["accounts", budgetId] });
  queryClient.invalidateQueries({ queryKey: ["budget-month", budgetId] });
  queryClient.invalidateQueries({ queryKey: ["payees", budgetId] });
  queryClient.invalidateQueries({ queryKey: ["reports", budgetId] });
  queryClient.invalidateQueries({ queryKey: ["net-worth", budgetId] });
}

export function useCreateTransaction(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    // Only { id } is guaranteed on the create response (the created row
    // has no relations loaded) — typed narrowly rather than as the full
    // TransactionView so nothing downstream assumes fields that aren't
    // actually there.
    mutationFn: (input: CreateTransactionInput) => api.post<{ id: string }>(`/api/budgets/${budgetId}/transactions`, input),
    onSuccess: () => invalidateAfterMutation(queryClient, budgetId),
  });
}

export function useUpdateTransaction(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTransactionInput }) =>
      api.patch(`/api/budgets/${budgetId}/transactions/${id}`, input),
    onSuccess: () => invalidateAfterMutation(queryClient, budgetId),
  });
}

export function useDeleteTransaction(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/budgets/${budgetId}/transactions/${id}`),
    onSuccess: () => invalidateAfterMutation(queryClient, budgetId),
  });
}

export function useSetTransactionTags(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tagNames }: { id: string; tagNames: string[] }) =>
      api.put(`/api/budgets/${budgetId}/transactions/${id}/tags`, { tagNames }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["transactions", budgetId] });
      queryClient.invalidateQueries({ queryKey: ["tags", budgetId] });
    },
  });
}
