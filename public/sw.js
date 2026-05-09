/// <reference lib="webworker" />

const CACHE_NAME = "donguri-__SW_VERSION__";
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/acorn.svg",
  "/icon-180.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest-icon-192.maskable.png",
  "/manifest-icon-512.maskable.png",
  "/icon-maskable.svg",
  // Splash screens used in the app (light + dark)
  "/apple-splash-dark-1125-2436.png",
  "/apple-splash-light-1125-2436.png",
  "/apple-splash-dark-1170-2532.png",
  "/apple-splash-light-1170-2532.png",
  "/apple-splash-dark-1179-2556.png",
  "/apple-splash-light-1179-2556.png",
  "/apple-splash-dark-1284-2778.png",
  "/apple-splash-light-1284-2778.png",
  "/apple-splash-dark-1290-2796.png",
  "/apple-splash-light-1290-2796.png",
  "/apple-splash-dark-1536-2048.png",
  "/apple-splash-light-1536-2048.png",
  "/apple-splash-dark-1668-2388.png",
  "/apple-splash-light-1668-2388.png",
  "/apple-splash-dark-2048-2732.png",
  "/apple-splash-light-2048-2732.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Skip non-GET and cross-origin requests
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  const url = new URL(request.url);

  // Static assets (hashed by Vite) — cache-first
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            return response;
          }),
      ),
    );
    return;
  }

  // Navigation requests — network-first with offline fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
    );
    return;
  }

  // Other same-origin requests — network-first, cache as fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses for precached URLs
        if (response.ok && PRECACHE_URLS.includes(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request).then((r) => r || Response.error())),
  );
});
