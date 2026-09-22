// Ekran koruyucu için Wikimedia Commons'ın editörce onaylanmış "Featured
// pictures" kategorisinden rastgele görsel çeker — ücretsiz, API anahtarı
// gerektirmez, açık lisanslı. Kategorinin tamamını her seferinde çekmemek
// için başlık listesi 24 saat bellek içi önbellekte tutulur.

const CATEGORY = "Category:Featured_pictures_on_Wikimedia_Commons";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let titlesCache = [];
let cachedAt = 0;

async function fetchTitles() {
  const url =
    "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers" +
    `&cmtitle=${encodeURIComponent(CATEGORY)}&cmtype=file&cmlimit=500&format=json&origin=*`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Wikimedia kategori isteği başarısız: ${res.status}`);
  const data = await res.json();
  const titles = (data?.query?.categorymembers || []).map((m) => m.title).filter(Boolean);
  if (!titles.length) throw new Error("Wikimedia kategorisinden başlık alınamadı");
  return titles;
}

async function getTitles() {
  const isStale = Date.now() - cachedAt > CACHE_TTL_MS;
  if (titlesCache.length && !isStale) return titlesCache;
  titlesCache = await fetchTitles();
  cachedAt = Date.now();
  return titlesCache;
}

export async function getRandomFeaturedImage() {
  try {
    const titles = await getTitles();
    const title = titles[Math.floor(Math.random() * titles.length)];
    const url =
      "https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo" +
      "&iiprop=url|extmetadata&format=json&origin=*" +
      `&titles=${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Wikimedia görsel isteği başarısız: ${res.status}`);
    const data = await res.json();
    const pages = data?.query?.pages || {};
    const page = Object.values(pages)[0];
    const info = page?.imageinfo?.[0];
    if (!info?.url) return null;
    const meta = info.extmetadata || {};
    const credit =
      meta.Artist?.value?.replace(/<[^>]+>/g, "").trim() ||
      meta.ObjectName?.value ||
      title.replace(/^File:/, "").replace(/\.[a-zA-Z0-9]+$/, "");
    return { url: info.url, title: title.replace(/^File:/, ""), credit };
  } catch (err) {
    console.error("Ekran koruyucu görseli alınamadı:", err.message);
    return null;
  }
}
