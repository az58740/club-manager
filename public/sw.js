// The build id and the precache list are injected into out/sw.js after `next build`
// (scripts/gen-sw-manifest.mjs), so every deployment gets its own cache.
const BUILD_ID = "__BUILD_ID__";
const PRECACHE = [/*__PRECACHE__*/];
const CACHE_NAME = `bashgah-shell-${BUILD_ID}`;
const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache every build file up front so the app opens with no connection at all.
      await Promise.all(
        PRECACHE.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // one missing file must not abort the whole install
          }
        }),
      );
      await self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

async function fromNetwork(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // ignoreSearch so `/players/?id=x` falls back to the cached `/players/` document
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const shell = await cache.match(SHELL_URL);
    if (shell) return shell;
    return new Response(
      "<!doctype html><meta charset=\"utf-8\"><body style=\"font-family:sans-serif;padding:2rem\" dir=\"rtl\">" +
        "آفلاین هستید و این صفحه هنوز روی دستگاه ذخیره نشده است." +
        "<p dir=\"ltr\" style=\"margin-top:1rem\">You are offline and this page has not been saved on this device yet.</p></body>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }
}

async function fromCache(request) {
  const cache = await caches.open(CACHE_NAME);
  // Next.js appends `?_rsc=<hash>` to navigation payloads; the query only busts caches,
  // so the precached file without it is the right answer offline.
  const cached = (await cache.match(request)) ?? (await cache.match(request, { ignoreSearch: true }));
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response("", { status: 504 });
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === "/sw.js") return;

  event.respondWith(request.mode === "navigate" ? fromNetwork(request) : fromCache(request));
});
