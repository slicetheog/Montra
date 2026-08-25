/**
 * Ad provider abstraction (spec section 3 & PHASE 10).
 *
 * The rest of the app never talks to an ad network directly — it only
 * renders <AdBanner slot="..." />. Swapping providers (or going
 * ad-network-free entirely) means changing this one file's env-driven
 * switch, not touching every page that shows a banner.
 *
 * "placeholder" (default) renders a tasteful house placeholder — used in
 * development and any environment without a real ad client configured.
 * "adsense" wires up Google AdSense once NEXT_PUBLIC_ADSENSE_CLIENT_ID is
 * set. Adding a new provider = adding one more case here + one renderer
 * component; AdBanner and every call site stay unchanged.
 */
export type AdProviderId = "placeholder" | "adsense";

export function getConfiguredAdProvider(): AdProviderId {
  const configured = process.env.NEXT_PUBLIC_AD_PROVIDER;
  if (configured === "adsense" && process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) {
    return "adsense";
  }
  return "placeholder";
}

/** Named placements — every call site picks one, keeping banner locations centrally auditable. */
export type AdSlot = "dashboard-footer" | "reports-footer" | "settings-footer" | "app-footer" | "budget-footer";
