import "server-only";
import type { PaymentProviderAdapter } from "./types";
import { PlaceholderPaymentProvider } from "./placeholder-provider";
import { StripePaymentProvider } from "./stripe-provider";

export function getPaymentProvider(): PaymentProviderAdapter {
  if (process.env.PAYMENT_PROVIDER === "stripe" && process.env.STRIPE_SECRET_KEY) {
    return new StripePaymentProvider();
  }
  return new PlaceholderPaymentProvider();
}

export * from "./types";
