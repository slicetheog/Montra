import "server-only";
import { prisma } from "@montra/db";
import { getPaymentProvider } from "@/server/payments";
import { logAudit } from "@/server/services/audit";

const REMOVE_ADS_PRICE_CENTS = 499;

/**
 * PurchaseService — the one entry point for the $4.99 "Remove Ads
 * Forever" entitlement. Conceptually mirrors purchaseAdRemoval() /
 * hasAdRemoval() / restorePurchase() from the spec; split into three
 * functions here since this is a server module, not a client-side object.
 *
 * The Entitlement row is the only thing the rest of the app ever reads
 * (via /api/auth/me) — it is written ONLY here, and only after a
 * provider confirms payment (immediately for the demo provider; via a
 * verified Stripe webhook for the real one). The client never sets this
 * flag itself.
 */
export async function purchaseAdRemoval(userId: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const provider = getPaymentProvider();

  const purchase = await prisma.purchase.create({
    data: {
      userId,
      provider: provider.id,
      amountCents: REMOVE_ADS_PRICE_CENTS,
      status: "PENDING",
    },
  });

  const result = await provider.createRemoveAdsCheckout({ id: user.id, email: user.email });

  if (result.status === "completed") {
    await prisma.$transaction([
      prisma.purchase.update({
        where: { id: purchase.id },
        data: { status: "COMPLETED", providerRef: result.providerRef },
      }),
      prisma.entitlement.upsert({
        where: { userId },
        update: { adsRemoved: true },
        create: { userId, adsRemoved: true },
      }),
    ]);
    await logAudit({ userId, action: "purchase.completed", entityType: "Purchase", entityId: purchase.id });
  } else {
    await prisma.purchase.update({ where: { id: purchase.id }, data: { providerRef: result.providerRef } });
  }

  return { ...result, purchaseId: purchase.id };
}

export async function hasAdRemoval(userId: string): Promise<boolean> {
  const entitlement = await prisma.entitlement.findUnique({ where: { userId } });
  return entitlement?.adsRemoved ?? false;
}

/**
 * Re-derives the entitlement from the Purchase ledger. Exists for the
 * "restore purchase on a new device" flow and as a self-healing check —
 * the ledger (Purchase rows), not the Entitlement flag, is the ultimate
 * source of truth.
 */
export async function restorePurchase(userId: string) {
  const completedPurchase = await prisma.purchase.findFirst({
    where: { userId, status: "COMPLETED" },
  });
  const adsRemoved = Boolean(completedPurchase);

  await prisma.entitlement.upsert({
    where: { userId },
    update: { adsRemoved },
    create: { userId, adsRemoved },
  });

  return { adsRemoved };
}

export async function completePurchaseByProviderRef(providerRef: string) {
  const purchase = await prisma.purchase.findFirst({ where: { providerRef } });
  if (!purchase || purchase.status === "COMPLETED") return;

  await prisma.$transaction([
    prisma.purchase.update({ where: { id: purchase.id }, data: { status: "COMPLETED" } }),
    prisma.entitlement.upsert({
      where: { userId: purchase.userId },
      update: { adsRemoved: true },
      create: { userId: purchase.userId, adsRemoved: true },
    }),
  ]);
  await logAudit({
    userId: purchase.userId,
    action: "purchase.completed",
    entityType: "Purchase",
    entityId: purchase.id,
  });
}
