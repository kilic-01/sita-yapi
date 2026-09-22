// Filotim (Yakıt Ofisi) akaryakıt kartı API'sinden işlem (satın alma)
// geçmişini, araç/kart limit-kullanım durumunu ve filo hesap özetini
// çeker — filotim.yakitofisi.com/apikeys sayfasında oluşturulan bir API
// anahtarıyla çalışır. API'nin izin verdiği en büyük sayfa boyutu 1000
// ("Sayfa boyutu en fazla 1000 olabilir") — bugün 766 işlemle tek sayfaya
// sığsa da, filo büyüdükçe kırılmasın diye sayfalama uygulanıyor.
const API_BASE = "https://filotim.yakitofisi.com/api/1.0";
const PAGE_SIZE = 1000;

async function fetchAllPages(path, apiKey) {
  const results = [];
  let page = 1;
  while (true) {
    const res = await fetch(`${API_BASE}${path}?page=${page}&pageSize=${PAGE_SIZE}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new Error(`Filotim API hatası (HTTP ${res.status}, ${path}).`);
    }
    const data = await res.json();
    const items = data.items || [];
    results.push(...items);
    if (items.length < PAGE_SIZE || page >= (data.totalPages || 1)) break;
    page += 1;
  }
  return results;
}

function mapPurchase(it) {
  return {
    id: it.id,
    plate: it.plate || null,
    liter: it.liter != null ? Number(it.liter) : null,
    unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
    amount: it.totalAmountDiscounted != null ? Number(it.totalAmountDiscounted) : null,
    processDate: it.processDate || null,
    stationName: it.dealer?.name || null,
    stationCity: it.dealer?.city || null,
    transactionId: it.transactionID || null,
  };
}

export async function fetchFuelPurchases(apiKey) {
  const items = await fetchAllPages("/purchases", apiKey);
  return items.map(mapPurchase);
}

// Aynı plakaya birden fazla kart/cihaz kaydı olabilir (kayıp/yenileme
// geçmişi) — sadece HÂLÂ AKTİF olanları (deviceDisableDate boş) alıyoruz,
// satılan/iptal edilen araçların eski kartları limit tablosunda görünmesin.
// Bazen aynı plakada birden fazla AKTİF kayıt da olabiliyor (Filotim
// tarafında eski kart hiç "disabled" işaretlenmemiş) — bu durumda en son
// gerçek alım yapılmış olanı gerçek/güncel kart kabul ediyoruz, diğeri
// upsert'te aynı id'yi (plaka) ikinci kez etkileyip hataya yol açardı.
export async function fetchFuelDevices(apiKey) {
  const items = await fetchAllPages("/devices", apiKey);
  const active = items.filter((it) => it.plate && !it.deviceDisableDate);

  const byPlate = new Map();
  for (const it of active) {
    const existing = byPlate.get(it.plate);
    if (!existing || new Date(it.lastFuelPurchaseDate || 0) > new Date(existing.lastFuelPurchaseDate || 0)) {
      byPlate.set(it.plate, it);
    }
  }

  return [...byPlate.values()].map((it) => ({
    id: it.plate,
    plate: it.plate,
    dailyLimit: it.dailyLimit != null ? Number(it.dailyLimit) : null,
    weeklyLimit: it.weeklyLimit != null ? Number(it.weeklyLimit) : null,
    monthlyLimit: it.monthlyLimit != null ? Number(it.monthlyLimit) : null,
    monthlyPurchase: it.monthlyPurchase != null ? Number(it.monthlyPurchase) : null,
    monthlyPurchaseInLiters: it.monthlyPurchaseInLiters != null ? Number(it.monthlyPurchaseInLiters) : null,
    balance: it.balance != null ? Number(it.balance) : null,
  }));
}

// Filomuzun (hesabımızın) tek bir kaydı var — borç/risk/vade durumunu
// gösteren tek satırlık bir özet. Ayarlar'da "Yakıt Senkronizasyonu"
// bölümünde küçük bir bilgi kartı olarak gösterilir.
export async function fetchFleetSummary(apiKey) {
  const items = await fetchAllPages("/fleets", apiKey);
  const f = items[0];
  if (!f) return null;
  return {
    name: f.customName || f.name || null,
    totalDebt: f.totalDebtDiscounted != null ? Number(f.totalDebtDiscounted) : null,
    totalLimit: f.totalLimit != null ? Number(f.totalLimit) : null,
    remainingLimit: f.remainingLimit != null ? Number(f.remainingLimit) : null,
    totalRisk: f.totalRisk != null ? Number(f.totalRisk) : null,
    isOverdue: Boolean(f.isOverdue),
    averagePaymentDelayDays: f.averagePaymentDelayDays != null ? Number(f.averagePaymentDelayDays) : null,
  };
}
