"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface MeResponse {
  user: { id: string; email: string; name: string } | null;
  settings: {
    currency: string;
    dateFormat: string;
    firstDayOfMonth: number;
    theme: "LIGHT" | "DARK" | "SYSTEM";
    notificationsEnabled: boolean;
    onboardingCompletedAt: string | null;
  } | null;
  adsRemoved: boolean;
  budgets: { id: string; name: string; currency: string }[];
  needsOnboarding: boolean;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api.get<MeResponse>("/api/auth/me"),
    staleTime: 60_000,
  });
}
