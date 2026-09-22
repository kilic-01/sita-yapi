// Geocoding isteği için kullanılan yardımcılar — kullanıcının girdiği
// orijinal addressDetail/address ASLA değiştirilmez (veritabanına, forma,
// hiçbir yere bu dosyanın ürettiği string yazılmaz); burada üretilen
// string'ler SADECE Google'a giden geçici sorgu metnidir.

// Türkçe adreslerde çok sık kullanılan kısaltmalar — Google'ın kendi
// normalizasyonu bunları genelde çözüyor ama özellikle nokta/boşluk
// varyasyonlarında (ör. "Bağdat Cd" vs "Bağdat Cad.") kaçırdığı durumlar
// oluyor; açık haliyle göndermek eşleşme oranını artırıyor.
// Not: "\b" harften SONRA, olası noktadan ÖNCE aranır — "\bcd\.?\b" gibi
// noktayı da sınır kontrolünün içine alan bir desen, "Cd." + boşluk gibi
// durumlarda nokta ile boşluk arasında kelime sınırı bulunamadığı için
// (ikisi de "kelime değil" karakteri) geri izleyip noktayı hiç yakalamadan
// eşleşiyordu — sonuçta nokta metinde kalıyordu ("Caddesi." gibi).
const ABBREVIATIONS = [
  [/\bcd\b\.?/gi, "Caddesi"],
  [/\bcad\b\.?/gi, "Caddesi"],
  [/\bsk\b\.?/gi, "Sokak"],
  [/\bsok\b\.?/gi, "Sokak"],
  [/\bblv\b\.?/gi, "Bulvarı"],
  [/\bbul\b\.?/gi, "Bulvarı"],
  [/\bmah\b\.?/gi, "Mahallesi"],
  [/\bapt\b\.?/gi, "Apartmanı"],
  [/\bsit\b\.?/gi, "Sitesi"],
];

export function expandAbbreviations(text) {
  if (!text) return text;
  let out = text;
  for (const [pattern, full] of ABBREVIATIONS) {
    out = out.replace(pattern, full);
  }
  return out;
}

// İl, Google'ın Türkiye verisinde tutarlı şekilde administrative_area_level_1
// olarak etiketleniyor — bu yüzden sonucu bu ile SIKI şekilde kısıtlamak
// (components parametresi) güvenli. İlçe ise Google'da bazen
// administrative_area_level_2, bazen sublocality olarak geçiyor (tutarsız),
// bu yüzden onu "components" ile sıkı kısıtlamak yerine serbest metnin
// içine (adres cümlesine) dahil ediyoruz — daha yüksek eşleşme oranı için.
function componentsFor(il) {
  return il ? `country:TR|administrative_area_level_1:${il}` : "country:TR";
}

// Çok aşamalı arama stratejisi: en spesifikten en sadeye doğru, ilk
// başarılı sonuçta durulur. Daire numarası HİÇBİR aşamaya dahil edilmez —
// Google'ın geocoder'ı için gürültü, hassasiyeti artırmıyor.
export function buildGeocodeAttempts({ street, buildingName, mahalle, ilce, il }) {
  const expandedStreet = expandAbbreviations(street);
  const mahalleLine = mahalle ? `${mahalle} Mahallesi` : "";
  const components = componentsFor(il);

  const attempts = [];

  // 1) En spesifik: sokak + bina adı + mahalle + ilçe
  const full = [expandedStreet, buildingName, mahalleLine, ilce].filter(Boolean).join(", ");
  if (full) attempts.push({ address: full, components, stage: "full" });

  // 2) Bina adı olmadan: sokak + mahalle + ilçe
  const withoutBuilding = [expandedStreet, mahalleLine, ilce].filter(Boolean).join(", ");
  if (withoutBuilding && withoutBuilding !== full) {
    attempts.push({ address: withoutBuilding, components, stage: "withoutBuilding" });
  }

  // 3) En sade: sadece mahalle + ilçe (sokak bulunamadıysa en azından
  // mahalle merkezine yakın bir tahmin — checkGeocodeQuality zaten bunu
  // "approximate" olarak işaretleyip kullanıcıyı uyarıyor).
  const neighborhoodOnly = [mahalleLine, ilce].filter(Boolean).join(", ");
  if (neighborhoodOnly && neighborhoodOnly !== withoutBuilding && neighborhoodOnly !== full) {
    attempts.push({ address: neighborhoodOnly, components, stage: "neighborhoodOnly" });
  }

  return attempts;
}
