// vitra.com.tr ürün kataloğu — TV'de vitrin ürünü göstermek için. Satıcı
// sadece ürün kodunu (ör. "7231B403-6216") ya da ürünün vitra.com.tr linkini
// girer; ad, kategori ve tüm fotoğraflar sitedeki ürün sayfasından alınır
// (fotoğraf çekmeye gerek kalmaz). Sitenin arama sayfası tarayıcı içinde
// çalıştığı için kod → sayfa eşleşmesi site haritasından yapılır: ürün
// adresleri "…-p-<ürün kodu>" ile bitiyor.

const SITEMAP_URL = "https://www.vitra.com.tr/sitemaps/sitemap-products.xml";
const SITEMAP_TTL_MS = 24 * 60 * 60 * 1000;
const USER_AGENT = "Mozilla/5.0 (Macintosh; SitaYapi)";
// TV için fotoğraf boyutu — Vitra'nın görsel sunucusu (mncdn) istenen
// boyutta yeniden boyutlandırıp veriyor; orijinaller 5000 px.
const IMAGE_SIZE = 1600;

let codeIndex = null; // Map<normalizedCode, url>
let indexLoadedAt = 0;
let indexLoading = null;

// Büyük/küçük harf ve tire/boşluk farkları eşleşmeyi bozmasın.
function normalizeCode(code) {
  return String(code || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`vitra.com.tr yanıt vermedi (${res.status})`);
  return res.text();
}

async function loadIndex() {
  if (codeIndex && Date.now() - indexLoadedAt < SITEMAP_TTL_MS) return codeIndex;
  if (!indexLoading) {
    indexLoading = (async () => {
      const xml = await fetchText(SITEMAP_URL);
      const map = new Map();
      for (const m of xml.matchAll(/<loc>([^<]+-p-([a-z0-9-]+))<\/loc>/gi)) {
        map.set(normalizeCode(m[2]), m[1]);
      }
      if (map.size === 0) throw new Error("vitra.com.tr ürün listesi okunamadı.");
      codeIndex = map;
      indexLoadedAt = Date.now();
      return map;
    })().finally(() => {
      indexLoading = null;
    });
  }
  return indexLoading;
}

// Sitedeki görsel adresleri liste/küçük resim boyutlarıyla geliyor
// ("mnpadding/515/515/FFFFFF/…", "q_auto:low") — TV için büyük ve iyi kaliteli
// sürüme çevrilir.
function toLargeImage(url) {
  return url
    .replace(/\/mn(?:padding|resize)\/\d+\/\d+(?:\/[0-9A-Fa-f]{6})?\//, `/mnresize/${IMAGE_SIZE}/${IMAGE_SIZE}/`)
    .replace(/^(https:\/\/img-salsify\.mncdn\.com)\/images\//, `$1/mnresize/${IMAGE_SIZE}/${IMAGE_SIZE}/images/`)
    .replace("q_auto:low", "q_auto:good");
}

// Ürün sayfasındaki kısa özellik maddeleri ("Çıkış ucu uzunluğu 125 mm'dir.",
// "Cache (gizli) perlatör"…). İlk birkaçı açıkta, kalanı "devamını gör" ile
// açılan ikinci bir listede; ikisi de alınır. Sayfada mobil ve masaüstü için
// aynı listeler iki kez yer aldığı için tekrarlar atılır. Fayans gibi bazı
// ürünlerde liste yok. TV, sığmayanları sayfalara bölüp döndürür.
const MAX_FEATURES = 16;

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&#8217;/g, "’")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function parseFeatures(html) {
  const features = [];
  for (const [, list] of html.matchAll(/<ul class="text-\[var\(--color-sandstone-90\)\][^"]*">([\s\S]*?)<\/ul>/g)) {
    for (const [, li] of list.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)) {
      const text = decodeEntities(li.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
      if (text && !features.includes(text)) features.push(text);
    }
  }
  return features.slice(0, MAX_FEATURES);
}

function parseProductPage(html, url) {
  const blocks = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)];
  let product = null;
  for (const [, body] of blocks) {
    try {
      const data = JSON.parse(body);
      for (const item of Array.isArray(data) ? data : [data]) {
        if (item?.["@type"] === "Product") product = item;
      }
    } catch {
      // bozuk/başka bir JSON bloğu — atla
    }
  }
  if (!product) throw new Error("Ürün sayfasında ürün bilgisi bulunamadı.");
  const rawImages = Array.isArray(product.image) ? product.image : product.image ? [product.image] : [];
  const images = [...new Set(rawImages.filter(Boolean).map(toLargeImage))];
  return {
    code: product.sku || product.mpn || "",
    name: product.name || "",
    category: product.category || "",
    images,
    features: parseFeatures(html),
    url,
  };
}

function isVitraUrl(input) {
  return /^https?:\/\/(www\.)?vitra\.com\.tr\//i.test(String(input || "").trim());
}

// input: ürün kodu ya da vitra.com.tr ürün linki.
export async function lookupVitraProduct(input) {
  const text = String(input || "").trim();
  if (!text) throw new Error("Ürün kodu ya da vitra.com.tr linki girin.");
  let url;
  if (isVitraUrl(text)) {
    url = text.split("#")[0];
  } else {
    const index = await loadIndex();
    url = index.get(normalizeCode(text));
    if (!url) throw new Error(`vitra.com.tr'de "${text}" koduyla ürün bulunamadı.`);
  }
  const product = parseProductPage(await fetchText(url), url);
  if (product.images.length === 0) throw new Error("Bu ürünün sitede fotoğrafı yok.");
  return product;
}

// ---------- Ürün videosu (VitrA Türkiye YouTube kanalı) ----------
// API anahtarı olmadan kanalın resmi RSS akışı okunur — yalnız son 15 video
// gelir. Video başlığının ayırt edici kelimelerinin hepsi ("VitrA Origin Aura
// Koleksiyonu" → "origin" + "aura") ürünün adında/sayfa
// adresinde geçiyorsa o video eşleşir — "Origin Aura" batarya videosu
// "Origin" tezgaha gösterilmez.
const YOUTUBE_FEED_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=UC2Sx8rluV2hdSLs5UnIqs_A";
const FEED_TTL_MS = 6 * 60 * 60 * 1000;
const GENERIC_WORDS = new Set(["koleksiyonu", "koleksiyon", "serisi", "seri", "yeni", "turkiye"]);
let feedCache = null;
let feedLoadedAt = 0;

async function loadChannelVideos() {
  if (feedCache && Date.now() - feedLoadedAt < FEED_TTL_MS) return feedCache;
  const xml = await fetchText(YOUTUBE_FEED_URL);
  feedCache = [...xml.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<\/yt:videoId>[\s\S]*?<title>([^<]+)<\/title>/g)].map((m) => ({
    id: m[1],
    title: m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
  }));
  feedLoadedAt = Date.now();
  return feedCache;
}

// productText: ürün adı + vitra.com.tr adresi. Eşleşme yoksa null.
export async function findVitraVideo(productText) {
  const haystack = normalizeCode(toAsciiWords(productText).join(""));
  if (!haystack) return null;
  let videos;
  try {
    videos = await loadChannelVideos();
  } catch {
    return null;
  }
  const candidates = videos
    .map((v) => {
      // "VitrA QuantumFlush | Sessizlik testi" → "QuantumFlush"
      const words = toAsciiWords(v.title.split("|")[0].replace(/^\s*vitra\s+/i, "")).filter((w) => !GENERIC_WORDS.has(w));
      const series = words[0] || "";
      return { ...v, series, words, isMain: !v.title.includes("|") };
    })
    .filter((v) => v.series.length >= 5 && v.words.every((w) => haystack.includes(w)));
  if (candidates.length === 0) return null;
  // Kanalın ana tanıtım videosu (alt başlıksız, "| Sessizlik testi" gibi değil) öne.
  candidates.sort((a, b) => Number(b.isMain) - Number(a.isMain));
  return { id: candidates[0].id, title: candidates[0].title };
}

// ---------- Stok fotoğrafı eşleme ----------
// Görsel site haritası her ürün sayfası için fotoğrafları sitedeki sırayla
// listeliyor (ilki ürün sayfasındaki ana fotoğraf). Tek dosyadan tüm ürünlerin
// ilk fotoğrafı alınır; ürün sayfalarını tek tek açmaya gerek kalmaz.
const IMAGES_SITEMAP_URL = "https://www.vitra.com.tr/sitemaps/sitemap-images.xml";
// Masaüstündeki stok listesi küçük resmi ve TV için yeterli boyut.
const STOCK_IMAGE_SIZE = 1000;

function toStockImage(url) {
  // images.salsify.com/images/q_auto:low/<id>/<dosya> → mncdn üzerinden
  // istenen boyutta, iyi kalitede (images.salsify.com "http" ve düşük kalite).
  const m = /\/images\/(?:q_auto(?::[a-z]+)?\/)?(.+)$/.exec(url);
  if (!m) return url;
  return `https://img-salsify.mncdn.com/mnresize/${STOCK_IMAGE_SIZE}/${STOCK_IMAGE_SIZE}/images/q_auto:good/${m[1]}`;
}

// Map<normalizedCode, { imageUrl, slug, fileName }>
export async function loadFirstImagesByCode() {
  const xml = await fetchText(IMAGES_SITEMAP_URL);
  const map = new Map();
  for (const m of xml.matchAll(/<url>\s*<loc>[^<]*\/([a-z0-9-]+)-p-([a-z0-9-]+)<\/loc>([\s\S]*?)<\/url>/gi)) {
    const img = /<image:loc>([^<]+)<\/image:loc>/.exec(m[3]);
    if (!img) continue;
    const raw = img[1].trim();
    map.set(normalizeCode(m[2]), { imageUrl: toStockImage(raw), slug: m[1], fileName: raw.split("/").pop() });
  }
  if (map.size === 0) throw new Error("vitra.com.tr fotoğraf listesi okunamadı.");
  return map;
}

function toAsciiWords(text) {
  return String(text || "")
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

// Kod birebir eşleşse de fotoğraf, stoktaki ürünle örtüşmeyebiliyor: VitrA
// bazı ürünlerde (duş tekneleri, sifon tapaları…) farklı ölçü/renk için aynı
// aile fotoğrafını kullanıyor ya da stoktaki ad farklı bir ürünü tarif
// ediyor. Fotoğraf dosya adında ürün kodu geçmiyor VE stoktaki adla sitedeki
// ürün adı (sayfa adresi) belirgin şekilde benzemiyorsa eşleşme şüpheli
// sayılır ve fotoğraf eklenmez.
export function isConfidentImageMatch(stockCode, stockName, entry) {
  const code = normalizeCode(stockCode);
  const file = normalizeCode(entry.fileName);
  if (code && (file.includes(code) || file.includes(code.slice(0, 6)))) return true;
  const a = new Set(toAsciiWords(stockName));
  const b = new Set(toAsciiWords(entry.slug));
  if (a.size === 0 || b.size === 0) return false;
  const common = [...a].filter((w) => b.has(w)).length;
  return common / Math.min(a.size, b.size) >= 0.34;
}

export { normalizeCode };
