// Basic app-shell caching for installability + resilience on a flaky
// connection — deliberately NOT a full offline data story (no IndexedDB
// mirror of balances/transactions; API responses are never cached, so a
// fully offline session still can't see live account data). The goal is
// just that the shell itself (and static assets already visited) doesn't
// show a blank browser error page when the network hiccups.
const CACHE_NAME = "montra-shell-v1";
const SHELL_URLS = ["/", "/login", "/register"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never cache API calls — this app's data must always be live, never a
  // stale offline snapshot silently presented as current.
  if (url.pathname.startsWith("/api/")) return;
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(event.request, copy))
          .catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match("/"))),
  );
});
