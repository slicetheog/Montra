import "server-only";
import type { CheckoutResult, PaymentProviderAdapter } from "./types";

/**
 * Real Stripe Checkout integration for the one-time, non-recurring $4.99
 * "Remove Ads" purchase. Only ever instantiated when STRIPE_SECRET_KEY is
 * set (see server/payments/index.ts) — importing `stripe` is done lazily
 * inside the method so a deployment without Stripe configured never pays
 * the cost of loading the SDK.
 *
 * Completion is confirmed via the `checkout.session.completed` webhook
 * (see app/api/webhooks/stripe/route.ts), NOT by trusting the client
 * redirect back to the success URL — a user could hit that URL directly
 * without paying, so the entitlement is only ever granted server-side
 * from a verified webhook event.
 */
export class StripePaymentProvider implements PaymentProviderAdapter {
  readonly id = "STRIPE" as const;

  async createRemoveAdsCheckout(user: { id: string; email: string }): Promise<CheckoutResult> {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const priceId = process.env.STRIPE_REMOVE_ADS_PRICE_ID;

    const session = await stripe.checkout.sessions.create({
      mode: "payment", // one-time payment, never "subscription"
      customer_email: user.email,
      client_reference_id: user.id,
      line_items: priceId
        ? [{ price: priceId, quantity: 1 }]
        : [
            {
              quantity: 1,
              price_data: {
                currency: "usd",
                unit_amount: 499,
                product_data: { name: "Montra — Remove Ads Forever" },
              },
            },
          ],
      success_url: `${appUrl}/settings?purchase=success`,
      cancel_url: `${appUrl}/settings?purchase=cancelled`,
      metadata: { userId: user.id, product: "REMOVE_ADS" },
    });

    return { status: "pending_redirect", redirectUrl: session.url ?? undefined, providerRef: session.id };
  }
}
