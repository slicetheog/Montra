# iOS via TestFlight — one-time setup

## What this is

`apps/ios` is a thin native shell (built with [Capacitor](https://capacitorjs.com))
that loads the live production web app (`https://<your-domain>`) inside a
native iOS WKWebView. It ships **no separate UI of its own** — every page,
component, and fix in `apps/web` appears in the iOS app automatically, with
no new iOS build required, because the app is just pointing at the live site.

`.github/workflows/ios-testflight.yml` builds this shell and uploads it to
TestFlight automatically on every push to `main`, so a production web
release and a TestFlight release always ship together, as requested. Until
the app is ready for public App Store review, testers only get it by
**internal TestFlight testing** (nothing here submits to the public App
Store — that's a separate, later, deliberate step).

None of this workflow can run successfully yet — it needs the one-time
setup below first. Everything past step 1 is free; step 1 is the $99/yr
Apple charge.

## 1. Enroll in the Apple Developer Program

1. Go to [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/).
2. Enroll as an **Individual** (fastest — approval is usually same-day) unless
   you specifically need an Organization account (requires a D-U-N-S number
   and legal-entity verification, and can take 1–2 weeks). Individual is
   fine for solo/small-team development and can be changed later if needed.
3. Pay the $99/yr fee. You'll get an email once enrollment is active —
   usually within a few hours for Individual accounts.

You now have an **Apple Team ID** (10-character alphanumeric string) — find
it at [developer.apple.com/account](https://developer.apple.com/account)
under Membership Details. Save it; it's `APPLE_TEAM_ID` in step 4.

## 2. Register the app in App Store Connect

1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com) →
   **Apps** → **+** → **New App**.
2. Platform: iOS. Name: `Montra` (or your choice — this is the public
   TestFlight/App Store display name, changeable later).
3. Bundle ID: click "Register a new bundle ID" if `app.montra.mobile` isn't
   listed yet, and register exactly `app.montra.mobile` (this must match
   `appId` in `apps/ios/capacitor.config.ts` — if you want a different
   bundle ID, register that instead and update `capacitor.config.ts` and
   `PRODUCT_BUNDLE_IDENTIFIER` in `apps/ios/ios/App/App.xcodeproj/project.pbxproj`
   to match).
4. SKU: any unique string (e.g. `montra-ios`). Finish creating the app.

## 3. Create an App Store Connect API key (used instead of your Apple ID/password)

1. In App Store Connect, go to **Users and Access** → **Integrations** →
   **App Store Connect API**.
2. Click **+** to generate a new key. Name it e.g. "GitHub Actions CI".
   Access: **Admin** — this is required, not just convenient. Apple only
   lets a key auto-create/renew a distribution certificate ("Cloud Managed
   Signing", what `-allowProvisioningUpdates` relies on in CI) if its role
   is Admin; App Manager can't touch certificates at all and fails with a
   "Cloud signing permission error" at export time — a mistake in an
   earlier draft of this doc, if you already made a key with App Manager
   access, generate a new one with Admin instead (existing keys can't be
   upgraded in place) and update the 2 secrets below that reference it.
3. Download the `.p8` key file **immediately** — Apple only lets you
   download it once. Store it somewhere safe.
4. Note the **Key ID** and **Issuer ID** shown on that page.

## 4. Add GitHub repository secrets and variables

In the repo: **Settings → Secrets and variables → Actions**.

**Secrets** tab — add these 4:

| Name | Value |
| --- | --- |
| `APP_STORE_CONNECT_API_KEY_ID` | The Key ID from step 3 |
| `APP_STORE_CONNECT_API_ISSUER_ID` | The Issuer ID from step 3 |
| `APP_STORE_CONNECT_API_KEY_CONTENT` | The `.p8` file's contents, base64-encoded: run `base64 -i AuthKey_XXXXXXXXXX.p8 \| pbcopy` (macOS) or `base64 -w0 AuthKey_XXXXXXXXXX.p8` (Linux) and paste the output |
| `APPLE_TEAM_ID` | Your Team ID from step 1 |

**Variables** tab — add 1 (not secret, it's just the public site URL):

| Name | Value |
| --- | --- |
| `MONTRA_PRODUCTION_APP_URL` | `https://<your production domain>` (the same URL the web app is deployed to on Vercel) |

## 5. Enable automatic signing once, in Xcode (requires a Mac)

The CI workflow builds with `-allowProvisioningUpdates`, which asks Xcode
to auto-create the distribution certificate and provisioning profile using
the API key — but the project first needs "Automatically manage signing"
turned on and your team selected, one time, so that setting is committed:

1. On a Mac, open `apps/ios/ios/App/App.xcodeproj` in Xcode.
2. Select the **App** target → **Signing & Capabilities**.
3. Check **Automatically manage signing**, and pick your team (from step 1)
   in the **Team** dropdown.
4. Commit the resulting change to `project.pbxproj`.

(If you don't have a Mac available yet, tell me — I can hand-edit
`project.pbxproj` to set `CODE_SIGN_STYLE = Automatic` and
`DEVELOPMENT_TEAM = <your team ID>` directly once you have the Team ID,
without needing Xcode open.)

## 6. Add internal testers

1. In App Store Connect → your app → **TestFlight** tab → **Internal
   Testing** → create a group (e.g. "Internal") and add tester Apple IDs
   (up to 100 people; they must accept an email invite). Internal testing
   has **no Apple review step** — a build is available to testers within
   minutes of upload.
2. External testing (up to 10,000 testers, no Apple ID restriction) requires
   a one-time lightweight "Beta App Review" after your first build — not
   needed until you want testers beyond your internal group.

## 7. Trigger the first build

Once steps 1–5 are done, push to `main` (or run the workflow manually via
**Actions → iOS TestFlight → Run workflow**). Build progress is in the
Actions tab; once it succeeds, the build appears in App Store Connect's
TestFlight tab within a few minutes (internal testers are notified
automatically).

## What "push to web = push to TestFlight" actually means here

Because the iOS app loads the live production URL rather than shipping a
bundled copy of the UI, most web-only changes (new pages, bug fixes, copy
changes) reach every TestFlight tester **immediately**, with no new binary
needed at all — the workflow re-running on each push to `main` is really
about keeping the *native shell itself* (icons, permissions, native
plugins you add later like Face ID or push notifications) in lockstep, and
giving you a fresh, always-current build in TestFlight without having to
remember to trigger one by hand.
