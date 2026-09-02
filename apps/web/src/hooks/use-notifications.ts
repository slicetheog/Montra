"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { useMe } from "@/hooks/use-me";

export interface NotificationView {
  id: string;
  type: "UPCOMING_BILL" | "OVERSPENDING" | "GOAL_MILESTONE" | "RECURRING_TRANSACTION" | "RECONCILIATION_REMINDER";
  title: string;
  body: string;
  isRead: boolean;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
  createdAt: string;
}

/**
 * Polls rather than pushing (no websocket/SSE infra in this app) — every
 * 60s is frequent enough for "you're overspent" to feel timely without
 * hammering the generation pass, which itself scans every budget the
 * user owns. Disabled outright when the user has turned notifications
 * off in Settings, matching that toggle's intent.
 */
export function useNotifications() {
  const { data: me } = useMe();
  const enabled = me?.settings?.notificationsEnabled ?? true;
  return useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationView[]>("/api/notifications"),
    enabled,
    refetchInterval: enabled ? 60_000 : false,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.patch(`/api/notifications/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/api/notifications/mark-all-read"),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
