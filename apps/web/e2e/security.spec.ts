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

// The e2e environment never sets ANTHROPIC_API_KEY (see playwright.config.ts),
// so this also proves the server-side gate is real — not just a hidden UI —
// even for a user who somehow flips their own Settings toggle on.
test("AI assistant is unusable when the server has no API key configured, even via a direct API call", async () => {
  const askAttempt = await alice.post(`/api/budgets/${aliceBudget.id}/ai-assistant/ask`, {
    data: { question: "How much do I have left in groceries?" },
  });
  expect(askAttempt.status()).toBe(400);

  const recapAttempt = await alice.post(`/api/budgets/${aliceBudget.id}/ai-assistant/recap/2026-09`, { data: {} });
  expect(recapAttempt.status()).toBe(400);
});

/**
 * Shared-budget multi-user isolation (spec: "real permissions", not just
 * ownership). Reuses alice/bob rather than registering a third user, to
 * respect this file's registration-rate-limit budget (see the header
 * comment) — the "wrong email" test below proves the same email-binding
 * check without needing another real account.
 */
test.describe("shared budgets", () => {
  let bobEmail: string;
  let inviteToken: string;
  let bobMemberId: string;

  test("an invited collaborator gets real read/write access once they accept", async () => {
    const bobInfo = await (await bob.get("/api/auth/me")).json();
    bobEmail = bobInfo.user.email;

    // Before accepting, Bob has no access at all (already covered
    // elsewhere in this file, but the invite flow shouldn't short-circuit
    // that — confirm it's still true right up until acceptance).
    const beforeAccept = await bob.get(`/api/budgets/${aliceBudget.id}`);
    expect(beforeAccept.status()).toBe(403);

    const invite = await alice.post(`/api/budgets/${aliceBudget.id}/members`, { data: { email: bobEmail } });
    expect(invite.ok()).toBeTruthy();
    const inviteBody = await invite.json();
    inviteToken = new URL(inviteBody.inviteUrl).pathname.split("/").pop()!;
    bobMemberId = inviteBody.member.id;

    const accept = await bob.post(`/api/invites/${inviteToken}/accept`);
    expect(accept.ok()).toBeTruthy();

    // Real read AND write access — not just a 200 on GET.
    const afterAccept = await bob.get(`/api/budgets/${aliceBudget.id}`);
    expect(afterAccept.status()).toBe(200);
    const rename = await bob.patch(`/api/budgets/${aliceBudget.id}`, { data: { name: "Alice & Bob's Budget" } });
    expect(rename.ok()).toBeTruthy();
  });

  test("a collaborator cannot delete or archive the budget — owner-only", async () => {
    const archiveAttempt = await bob.patch(`/api/budgets/${aliceBudget.id}`, { data: { isArchived: true } });
    expect(archiveAttempt.status()).toBe(403);

    const deleteAttempt = await bob.delete(`/api/budgets/${aliceBudget.id}`);
    expect(deleteAttempt.status()).toBe(403);

    // Budget must still exist and be unarchived for the rest of this suite.
    const stillThere = await alice.get(`/api/budgets/${aliceBudget.id}`);
    expect(stillThere.ok()).toBeTruthy();
    expect((await stillThere.json()).isArchived).toBe(false);
  });

  test("an invite can only be accepted by the exact email it was sent to", async () => {
    const otherEmail = `not-bob-${Date.now()}@example.com`;
    const invite = await alice.post(`/api/budgets/${aliceBudget.id}/members`, { data: { email: otherEmail } });
    const inviteBody = await invite.json();
    const otherToken = new URL(inviteBody.inviteUrl).pathname.split("/").pop()!;

    // Bob is a real, logged-in user, but not the one this invite was sent to.
    const wrongPersonAccepts = await bob.post(`/api/invites/${otherToken}/accept`);
    expect(wrongPersonAccepts.status()).toBe(400);

    // Clean up so it doesn't linger as a dangling pending invite for other tests.
    await alice.delete(`/api/budgets/${aliceBudget.id}/members/${inviteBody.member.id}`);
  });

  test("a private category is invisible to other collaborators, even by direct id", async () => {
    const group = await (await alice.post(`/api/budgets/${aliceBudget.id}/category-groups`, { data: { name: "Alice Private Group" } })).json();
    const category = await (
      await alice.post(`/api/budgets/${aliceBudget.id}/categories`, { data: { groupId: group.id, name: "Alice's Secret Fund", isPrivate: true } })
    ).json();

    const bobsCategoryList = await (await bob.get(`/api/budgets/${aliceBudget.id}/categories`)).json();
    const bobSeesIt = bobsCategoryList.some((g: { categories: { id: string }[] }) => g.categories.some((c: { id: string }) => c.id === category.id));
    expect(bobSeesIt).toBe(false);

    // Not just hidden from listings — unreachable by direct id too.
    const bobRenameAttempt = await bob.patch(`/api/budgets/${aliceBudget.id}/categories/${category.id}`, { data: { name: "Renamed" } });
    expect(bobRenameAttempt.status()).toBe(404);

    // The owner still sees and controls it normally.
    const aliceCategoryList = await (await alice.get(`/api/budgets/${aliceBudget.id}/categories`)).json();
    const aliceSeesIt = aliceCategoryList.some((g: { categories: { id: string }[] }) => g.categories.some((c: { id: string }) => c.id === category.id));
    expect(aliceSeesIt).toBe(true);
  });

  test("removing a collaborator revokes their access immediately", async () => {
    const remove = await alice.delete(`/api/budgets/${aliceBudget.id}/members/${bobMemberId}`);
    expect(remove.ok()).toBeTruthy();

    const afterRemoval = await bob.get(`/api/budgets/${aliceBudget.id}`);
    expect(afterRemoval.status()).toBe(403);
  });
});
