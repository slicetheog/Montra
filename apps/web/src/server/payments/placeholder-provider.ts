import "server-only";
import { randomUUID } from "node:crypto";
import type { CheckoutResult, PaymentProviderAdapter } from "./types";

/**
 * Dev/demo provider — completes the "purchase" immediately with no real
 * money changing hands, so the entitlement pipeline (Purchase row ->
 * Entitlement flag -> ads disappear -> persists across devices) can be
 * exercised end to end without Stripe credentials. The UI is required to
 * label this clearly as a demo checkout (see PurchaseDialog) — it must
 * never be presented as a real charge.
 */
export class PlaceholderPaymentProvider implements PaymentProviderAdapter {
  readonly id = "PLACEHOLDER" as const;

  async createRemoveAdsCheckout(): Promise<CheckoutResult> {
    return { status: "completed", providerRef: `demo_${randomUUID()}` };
  }
}
