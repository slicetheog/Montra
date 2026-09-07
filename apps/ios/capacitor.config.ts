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
  ios: {
    contentInset: "automatic",
  },
};

export default config;
