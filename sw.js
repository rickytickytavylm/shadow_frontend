/* Service worker для PWA «ЧЕМПИОНАТ | ТЕНЬ».
   Стратегия:
   - навигации (HTML) — network-first, чтобы не показывать устаревшие страницы;
   - остальные same-origin GET — stale-while-revalidate;
   - офлайн-фолбэк на закэшированную главную. */
const CACHE = "shadow-pwa-v4";
const CORE = [
  "./",
  "./index.html",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        CORE.map((url) => cache.add(url).catch(() => null))
      );
      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // не трогаем API/сторонние домены

  // Навигации — network-first с фолбэком на кэш/главную.
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || (await caches.match("./index.html")) || Response.error();
        }
      })()
    );
    return;
  }

  // Код (скрипты/стили) — network-first, чтобы никогда не показывать
  // устаревший JS/CSS. Кэш — только офлайн-фолбэк.
  if (req.destination === "script" || req.destination === "style") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200 && fresh.type === "basic") {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone());
          }
          return fresh;
        } catch {
          const cached = await caches.match(req);
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // Прочие ресурсы — stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            cache.put(req, res.clone());
          }
          return res;
        })
        .catch(() => null);
      return cached || (await network) || Response.error();
    })()
  );
});
