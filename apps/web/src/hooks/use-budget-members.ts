"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface BudgetMemberView {
  id: string;
  email: string;
  status: "PENDING" | "ACCEPTED";
  acceptedAt: string | null;
}

export interface BudgetMembersResponse {
  owner: { id: string; name: string; email: string } | null;
  members: BudgetMemberView[];
}

export function useBudgetMembers(budgetId: string | null) {
  return useQuery({
    queryKey: ["budget-members", budgetId],
    queryFn: () => api.get<BudgetMembersResponse>(`/api/budgets/${budgetId}/members`),
    enabled: Boolean(budgetId),
  });
}

export function useInviteMember(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) =>
      api.post<{ member: BudgetMemberView; budgetName: string; inviteUrl: string }>(`/api/budgets/${budgetId}/members`, { email }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budget-members", budgetId] }),
  });
}

export function useRemoveMember(budgetId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => api.del(`/api/budgets/${budgetId}/members/${memberId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["budget-members", budgetId] }),
  });
}

export interface InvitePreview {
  budgetName: string;
  invitedEmail: string;
  invitedByName: string;
}

export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: ["invite-preview", token],
    queryFn: () => api.get<InvitePreview>(`/api/invites/${token}`),
  });
}

export function useAcceptInvite() {
  return useMutation({
    mutationFn: (token: string) => api.post<{ budgetId: string }>(`/api/invites/${token}/accept`),
  });
}
