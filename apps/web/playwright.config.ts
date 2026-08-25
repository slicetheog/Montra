import { defineConfig, devices } from "@playwright/test";

/**
 * Runs against a real Next.js dev server + the local Postgres instance
 * (see DEPLOYMENT.md for how CI should provision `montra_test`). Each
 * test file registers its own user so tests don't collide with each
 * other's data.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  timeout: 30_000,
  // A fresh `next dev` (Turbopack) compiles each route on first request —
  // a route nobody has hit yet in this run can take noticeably longer to
  // respond than the default 5s assertion timeout allows for, purely as a
  // dev-mode JIT cost with no bearing on production (the app was also
  // verified against `next start`, which has no such cost — see
  // DEPLOYMENT.md). A little slack here avoids failing on that, not on a
  // real bug.
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3011",
    trace: "retain-on-failure",
    // This environment pre-installs a pinned Chromium build; point at it
    // directly rather than the revision @playwright/test would otherwise
    // try to download.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "npm run dev -- -p 3011",
        url: "http://localhost:3011",
        reuseExistingServer: true,
        timeout: 60_000,
        env: {
          // A dedicated database so e2e runs never touch dev/prod data.
          DATABASE_URL: "postgresql://montra:montra_dev_pw@localhost:5432/montra_test?schema=public",
          NEXT_PUBLIC_APP_URL: "http://localhost:3011",
          NEXT_PUBLIC_AD_PROVIDER: "placeholder",
          PAYMENT_PROVIDER: "placeholder",
        },
      },
});
