/* sw.js — Service Worker
 *
 * 策略：Stale-While-Revalidate。先回快取（開啟極快、離線可用），
 * 同時在背景抓新版更新快取，下次開啟就是新的。
 *
 * 教材檔案（content/*.js）也一併快取——通勤時沒網路仍要能刷題，
 * 這是這個 App 存在的主要情境之一。
 *
 * ★ 改版時記得把 CACHE 的版本號加一，否則舊快取不會被清掉。
 * ★ 新增 js/ 或 content/ 檔案時要同步加進 ASSETS。
 */

const CACHE = 'gradprep-v3';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/srs.js',
  './js/content.js',
  './js/plan.js',
  './js/ui.js',
  './js/flash.js',
  './js/quiz.js',
  './js/essay.js',
  './js/interview.js',
  './content/index.js',
  './content/marketing.js',
  './content/management.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // 個別 add，單一檔案失敗不會讓整個安裝失敗
      .then((c) => Promise.allSettled(ASSETS.map((url) => c.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);          // 離線且沒快取時，至少不要拋例外
      return cached || network;
    })
  );
});
