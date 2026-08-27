/*
 * Service worker приложения «Автоосмотр».
 *
 * Два правила, из-за которых он выглядит именно так:
 *  1. Приложение живёт в подпапке (GitHub Pages), поэтому все пути строятся
 *     от `self.registration.scope`, а не от корня домена.
 *  2. Версия берётся из query-параметра, который подставляет `main.tsx` при
 *     сборке. Меняется версия — меняется URL скрипта — браузер обязан скачать
 *     новый service worker. Старые кэши удаляются в `activate`.
 */

const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `auto-inspection-${VERSION}`;
const SCOPE = self.registration.scope;
const INDEX_URL = new URL('index.html', SCOPE).href;
const SHELL = ['', 'index.html', 'manifest.webmanifest', 'icon.svg'].map((path) => new URL(path, SCOPE).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Пофайлово, а не addAll: один недоступный ресурс не должен
      // отменять установку целиком.
      await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) || (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.href.startsWith(SCOPE)) return;

  // Навигация — всегда сначала сеть: иначе после деплоя пользователь
  // навсегда остаётся на старой версии приложения.
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, INDEX_URL));
    return;
  }

  // Файлы сборки содержат хэш в имени и не меняются — их можно брать из кэша.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});
