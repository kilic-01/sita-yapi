// Minimal service worker — sadece PWA'nın "ana ekrana ekle" ile kurulabilir
// sayılması için gereken şart (bir service worker'ın var olması). Veriyi
// (stok/barkod sorguları) BİLEREK cache'lemiyoruz — her zaman güncel stok
// miktarını göstermek gerekiyor, eski/önbellek bir sayı depoda yanlış
// sayıma yol açardı. Sadece uygulamanın kendi kabuğunu (index.html) offline
// açılışta gösterebilmek için basit bir cache-then-network stratejisi var.
const CACHE = "sita-barkod-shell-v3";
const SHELL = ["./", "./index.html", "./manifest.json", "./icon.png", "./logo.svg", "./logo-white.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // /api/ istekleri asla cache'lenmez — her zaman canlı veri.
  if (url.pathname.startsWith("/api/")) return;
  // index.html (kabuk) sık güncelleniyor — cache-first burada her düzenlemeyi
  // kullanıcıya günlerce göstermeyebilir. Önce ağdan taze sürümü dene, sadece
  // gerçekten çevrimdışıyken önbellekten göster; diğer statik dosyalar
  // (ikon/logo/manifest) nadiren değiştiği için önbellek öncelikli kalıyor.
  const isShellPage = e.request.mode === "navigate" || url.pathname.endsWith("/index.html");
  if (isShellPage) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
