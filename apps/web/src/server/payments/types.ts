export interface CheckoutResult {
  status: "completed" | "pending_redirect";
  redirectUrl?: string;
  providerRef?: string;
}

/**
 * Every payment provider (Stripe today; Apple/Google IAP for mobile later)
 * implements this one method. Nothing outside src/server/payments/ and
 * services/purchases.ts knows which provider is active — see PAYMENT.md /
 * DEPLOYMENT.md for how to add one.
 */
export interface PaymentProviderAdapter {
  id: "PLACEHOLDER" | "STRIPE";
  createRemoveAdsCheckout(user: { id: string; email: string }): Promise<CheckoutResult>;
}
