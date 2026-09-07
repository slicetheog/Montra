"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface ForecastEvent {
  date: string;
  seriesId: string;
  label: string;
  type: "INCOME" | "EXPENSE" | "REFUND" | "CREDIT_CARD_PAYMENT";
  amountCents: number;
}

export interface ForecastDay {
  date: string;
  events: ForecastEvent[];
  balanceCents: number;
}

export interface PayPeriod {
  startDate: string;
  endDate: string;
  incomeCents: number;
  outflowCents: number;
  startingBalanceCents: number;
  endingBalanceCents: number;
  lowestBalanceCents: number;
  isShort: boolean;
}

export interface CashFlowForecast {
  accountNames: string[];
  hasScheduledSeries: boolean;
  startingBalanceCents: number;
  asOf: string;
  horizonDays: number;
  days: ForecastDay[];
  lowestBalanceCents: number;
  lowestBalanceDate: string;
  firstNegativeDate: string | null;
  payPeriods: PayPeriod[];
}

export function useCashFlowForecast(budgetId: string | null, horizonDays = 60) {
  return useQuery({
    queryKey: ["cash-flow", budgetId, horizonDays],
    queryFn: () => api.get<CashFlowForecast>(`/api/budgets/${budgetId}/cash-flow?horizonDays=${horizonDays}`),
    enabled: Boolean(budgetId),
  });
}
