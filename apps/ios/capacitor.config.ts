import type { CapacitorConfig } from "@capacitor/cli";

// This app is a thin native shell: it does not ship its own UI. On launch it
// loads the live production web app (server.url below) inside a native
// WKWebView, so every deploy to the web app is instantly reflected here with
// no new iOS build or TestFlight upload required. `webDir` still has to
// point at a real (near-empty) local folder — Capacitor uses it only as a
// same-origin bootstrap page and offline fallback; it is never the app's
// real UI.
//
// PRODUCTION_APP_URL must be set as a GitHub Actions secret/env var (see
// docs/ios-testflight-setup.md) before `cap sync` is run in CI. The
// localhost fallback here is only so this file (and `npx cap sync`) can be
// run/validated without that secret present, e.g. locally during setup.
const PRODUCTION_APP_URL = process.env.MONTRA_PRODUCTION_APP_URL ?? "http://localhost:3000";

const config: CapacitorConfig = {
  appId: "app.montra.mobile",
  appName: "Montra",
  webDir: "www",
  server: {
    url: PRODUCTION_APP_URL,
    cleartext: PRODUCTION_APP_URL.startsWith("http://"),
  },
  // Color for the native chrome behind the WKWebView — visible in the
  // safe-area strip `contentInset: "automatic"` reserves below the web
  // content (that's the "black bar at the bottom" this fixes) and
  // during elastic overscroll. Matches the app's dark-theme background
  // token (globals.css's dark `--color-background`), same idea as
  // manifest.ts's PWA `background_color` for the install splash screen.
  // Both are a single static color with no way to follow the system
  // light/dark setting, so this is a real tradeoff: dark-mode users get
  // an invisible match, light-mode users get a brief dark flash/edge
  // instead of a black one. Picked dark here since that's what's
  // actually been reported; revisit if light-mode users report the
  // reverse.
  backgroundColor: "#0a1220",
  ios: {
    contentInset: "automatic",
  },
};

export default config;
