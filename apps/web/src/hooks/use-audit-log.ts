"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
}

export function useAuditLog() {
  return useQuery({
    queryKey: ["audit-log"],
    queryFn: () => api.get<AuditLogEntry[]>("/api/audit-log"),
  });
}

/**
 * "transaction.created" -> "Transaction created", "user.account_deleted" ->
 * "User account deleted", "budget.default_categories_seeded" -> "Budget
 * default categories seeded" — generic on purpose, so a new logAudit()
 * call site anywhere in the app shows up here readably without this list
 * needing to be hand-maintained alongside it.
 */
export function humanizeAuditAction(action: string): string {
  const [entity, ...rest] = action.split(".");
  const label = `${entity} ${rest.join(" ")}`.replace(/_/g, " ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}
