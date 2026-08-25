import { NextResponse } from "next/server";
import { completePurchaseByProviderRef } from "@/server/services/purchases";

/**
 * Stripe webhook receiver. This is the ONLY place a purchase is ever
 * marked complete for the real payment provider — never the client
 * redirect back from Checkout, which an attacker could hit without
 * paying. No-ops (200, does nothing) unless Stripe is actually
 * configured, so this route is safe to leave deployed even before Stripe
 * is wired up.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !stripeKey) {
    return NextResponse.json({ error: "Stripe is not configured." }, { status: 501 });
  }

  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  try {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(stripeKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature!, secret);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as { id: string };
      await completePurchaseByProviderRef(session.id);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe webhook] signature verification failed:", error);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }
}
