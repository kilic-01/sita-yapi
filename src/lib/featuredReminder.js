// "Haftanın ürünü" hatırlatması: aynı ürün bu kadar gündür TV'deyse
// Ayarlar'da ve uygulama açılışında (adminlere, günde bir kez) uyarılır.
export const FEATURED_STALE_DAYS = 7;

export function featuredAgeDays(config) {
  if (!config?.featuredName || !config.featuredSince) return 0;
  const since = new Date(config.featuredSince).getTime();
  if (!Number.isFinite(since)) return 0;
  return Math.floor((Date.now() - since) / 86_400_000);
}

export function isFeaturedStale(config) {
  return featuredAgeDays(config) >= FEATURED_STALE_DAYS;
}
