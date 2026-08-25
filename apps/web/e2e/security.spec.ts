import { test, expect, request as playwrightRequest, type APIRequestContext } from "@playwright/test";

/**
 * API-level security tests (spec section 47): unauthorized access, ID
 * manipulation / cross-user access, and basic auth/session hardening.
 * Uses two independent API request contexts (their own cookie jars) to
 * simulate two different users.
 *
 * Registrations are kept deliberately low across this whole file (Alice
 * and Bob are created once and reused) — the register endpoint is
 * intentionally rate-limited to 5/hour per IP as an anti-abuse measure
 * (see rate-limit.ts), and this suite runs sequentially against one
 * server, so it shares that budget with itself.
 */

async function registerUser(baseURL: string, email: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const res = await ctx.post("/api/auth/register", {
    data: { name: "Test", email, password: "SecurePassw0rd!" },
  });
  expect(res.ok()).toBeTruthy();
  return ctx;
}

let alice: APIRequestContext;
let bob: APIRequestContext;
let aliceBudget: { id: string };

test.beforeAll(async ({ baseURL }) => {
  const unique = Date.now();
  alice = await registerUser(baseURL!, `alice-${unique}@example.com`);
  bob = await registerUser(baseURL!, `bob-${unique}@example.com`);
  aliceBudget = await (await alice.post("/api/budgets", { data: { name: "Alice Budget" } })).json();
});

test("unauthenticated requests are rejected, not just redirected", async ({ baseURL }) => {
  const ctx = await playwrightRequest.newContext({ baseURL });
  const res = await ctx.get("/api/budgets");
  expect(res.status()).toBe(401);
});

test("a logged-out session cannot read another user's budget by id", async () => {
  // Bob tries to read Alice's budget directly by id.
  const forbidden = await bob.get(`/api/budgets/${aliceBudget.id}`);
  expect(forbidden.status()).toBe(403);

  // Bob tries to read Alice's month view by id.
  const forbiddenMonth = await bob.get(`/api/budgets/${aliceBudget.id}/months/2026-08`);
  expect(forbiddenMonth.status()).toBe(403);
});

test("a user cannot inject a transaction split into another user's category", async () => {
  await alice.post(`/api/budgets/${aliceBudget.id}/seed-defaults`);
  const aliceCats = await (await alice.get(`/api/budgets/${aliceBudget.id}/categories`)).json();
  const aliceCategoryId = aliceCats[0].categories[0].id;

  const bobBudget = await (await bob.post("/api/budgets", { data: { name: "Bob" } })).json();
  const bobAccount = await (
    await bob.post(`/api/budgets/${bobBudget.id}/accounts`, {
      data: { name: "Checking", type: "CHECKING", startingBalanceCents: 0 },
    })
  ).json();

  const attempt = await bob.post(`/api/budgets/${bobBudget.id}/transactions`, {
    data: {
      accountId: bobAccount.id,
      date: "2026-08-01",
      type: "EXPENSE",
      amountCents: -1000,
      splits: [{ categoryId: aliceCategoryId, amountCents: -1000 }],
    },
  });
  expect(attempt.status()).toBe(404);
});

test("a user cannot repoint their transaction onto another user's account", async () => {
  const bobBudget = await (await bob.post("/api/budgets", { data: { name: "Bob2" } })).json();
  const bobAccount = await (
    await bob.post(`/api/budgets/${bobBudget.id}/accounts`, {
      data: { name: "Checking", type: "CHECKING", startingBalanceCents: 0 },
    })
  ).json();
  const aliceAccount = await (
    await alice.post(`/api/budgets/${aliceBudget.id}/accounts`, {
      data: { name: "Alice Checking", type: "CHECKING", startingBalanceCents: 0 },
    })
  ).json();

  const bobTxn = await (
    await bob.post(`/api/budgets/${bobBudget.id}/transactions`, {
      data: { accountId: bobAccount.id, date: "2026-08-01", type: "EXPENSE", amountCents: -500, splits: [{ categoryId: null, amountCents: -500 }] },
    })
  ).json();

  const attempt = await bob.patch(`/api/budgets/${bobBudget.id}/transactions/${bobTxn.id}`, {
    data: { accountId: aliceAccount.id },
  });
  expect(attempt.status()).toBe(404);
});

test("register enforces password strength (does not consume extra registrations)", async ({ baseURL }) => {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const weak = await ctx.post("/api/auth/register", { data: { name: "Test", email: `weak-${Date.now()}@example.com`, password: "weak" } });
  expect(weak.status()).toBe(400);
});

test("register rejects a duplicate email", async ({ baseURL }) => {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  // Re-registering an address that's already Alice's.
  const aliceInfo = await (await alice.get("/api/auth/me")).json();
  const dup = await ctx.post("/api/auth/register", {
    data: { name: "Test", email: aliceInfo.user.email, password: "SecurePassw0rd!" },
  });
  expect(dup.status()).toBe(409);
});

test("login never reveals whether the email exists", async ({ baseURL }) => {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL! } });
  const unknownEmail = await ctx.post("/api/auth/login", {
    data: { email: `nobody-${Date.now()}@example.com`, password: "whatever123" },
  });
  const aliceInfo = await (await alice.get("/api/auth/me")).json();
  const knownEmailWrongPassword = await ctx.post("/api/auth/login", {
    data: { email: aliceInfo.user.email, password: "wrongpassword" },
  });
  expect(unknownEmail.status()).toBe(400);
  expect(knownEmailWrongPassword.status()).toBe(400);
  const unknownBody = await unknownEmail.json();
  const knownBody = await knownEmailWrongPassword.json();
  expect(unknownBody.error).toBe(knownBody.error);
});

test("cross-origin mutating requests are rejected", async ({ baseURL }) => {
  const ctx = await playwrightRequest.newContext({ baseURL, extraHTTPHeaders: { Origin: "https://evil.example.com" } });
  const res = await ctx.post("/api/auth/login", { data: { email: "a@b.com", password: "x" } });
  expect(res.status()).toBe(403);
});
