/**
 * CSRF defense-in-depth for the JSON API. `SameSite=Lax` on the session
 * cookie already blocks the cookie from being attached to a cross-site
 * POST/PUT/PATCH/DELETE, but we additionally verify the request actually
 * originated from our own origin. Edge-safe (no DB access) so it can run
 * in middleware.
 */
export function isSameOriginRequest(request: Request): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = request.headers.get("origin");
  // Browsers always send Origin on cross-origin fetch/XHR and on same-site
  // POSTs from modern browsers; a same-origin request without an Origin
  // header (some older same-site navigations) is allowed through since
  // SameSite=Lax already covers that case.
  if (!origin) return true;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const host = request.headers.get("host");
  const allowed = new Set<string>();
  if (appUrl) allowed.add(new URL(appUrl).origin);
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }

  return allowed.has(origin);
}
