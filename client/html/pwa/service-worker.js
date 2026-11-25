const CACHE_NAME = "ncnu-scheduler-v1";
const APP_SHELL = [
  "./",
  "index.html",
  "settings.html",
  "timetable.html",
  "pwa/manifest.webmanifest",
  "favicon.png",
  "pwa/icon-192.png",
  "pwa/icon-512.png",
  "css/dashboard.css",
  "css/settings.css",
  "css/timetable.css",
  "css/transitions.css",
  "js/app.js",
  "js/auth.js",
  "pwa/pwa.js",
  "pwa/service-worker.js",
  "js/settings.js",
  "js/timetable.js",
  "js/transitions.js",
  "data/common.json",
  "data/cs_courses.json",
  "data/general_courses.json",
  "data/general_domains.json",
  "data/physical.json",
  "data/progress.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const urls = APP_SHELL.map((path) => new URL(path, self.registration.scope));
      await cache.addAll(urls);
      await self.skipWaiting();
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => cacheName.startsWith("ncnu-scheduler-") && cacheName !== CACHE_NAME)
            .map((cacheName) => caches.delete(cacheName))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  if (
    request.method !== "GET" ||
    url.origin !== scopeUrl.origin ||
    !url.pathname.startsWith(scopeUrl.pathname)
  ) {
    return;
  }

  const relativePath = url.pathname.slice(scopeUrl.pathname.length);
  if (relativePath === "api" || relativePath.startsWith("api/") || request.cache === "no-store") {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone()).catch((error) => {
              console.warn("無法快取離線頁面：", error);
            });
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const cachedPage = await cache.match(request, { ignoreSearch: true });
          if (cachedPage) {
            return cachedPage;
          }
          return (await cache.match(new URL("index.html", scopeUrl))) || Response.error();
        })
    );
    return;
  }

  const isAppAsset =
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image" ||
    relativePath.startsWith("css/") ||
    relativePath.startsWith("js/") ||
    relativePath.startsWith("data/") ||
    relativePath.startsWith("pwa/");

  if (!isAppAsset) {
    return;
  }

  const cachePromise = caches.open(CACHE_NAME);
  const refreshPromise = cachePromise.then(async (cache) => {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
    }
    return response;
  });

  event.waitUntil(
    refreshPromise.then(
      () => undefined,
      (error) => {
        console.warn("PWA 資源快取更新失敗：", url.pathname, error);
      }
    )
  );

  event.respondWith(
    cachePromise
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      .then((cachedResponse) => cachedResponse || refreshPromise)
  );
});
