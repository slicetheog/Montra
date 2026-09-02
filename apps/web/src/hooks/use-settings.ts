"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface UpdateSettingsInput {
  currency?: string;
  dateFormat?: string;
  firstDayOfMonth?: number;
  theme?: "LIGHT" | "DARK" | "SYSTEM";
  notificationsEnabled?: boolean;
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => api.patch("/api/settings", input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useCreateBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, currency }: { name: string; currency?: string }) => api.post("/api/budgets", { name, currency }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useRenameBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch(`/api/budgets/${id}`, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useArchiveBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, isArchived }: { id: string; isArchived: boolean }) => api.patch(`/api/budgets/${id}`, { isArchived }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useDeleteBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/api/budgets/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });
}
