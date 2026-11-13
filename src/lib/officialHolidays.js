// Türkiye'deki resmi tatiller (2429 sayılı Kanun) — Ayarlar > Resmi ve Dini
// Tatiller'de "Resmi tatil seç" listesi. Tarihi sabit olanlar her yıl tekrarlar;
// Ramazan/Kurban Bayramı'nın tarihi her yıl değiştiği için tarih elle girilir.
export const OFFICIAL_HOLIDAYS = [
  { name: "Yılbaşı", month: 1, day: 1 },
  { name: "Ulusal Egemenlik ve Çocuk Bayramı", month: 4, day: 23 },
  { name: "Emek ve Dayanışma Günü", month: 5, day: 1 },
  { name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı", month: 5, day: 19 },
  { name: "Demokrasi ve Milli Birlik Günü", month: 7, day: 15 },
  { name: "Zafer Bayramı", month: 8, day: 30 },
  { name: "Cumhuriyet Bayramı", month: 10, day: 29 },
  { name: "Ramazan Bayramı" },
  { name: "Kurban Bayramı" },
];

// Sabit tarihli tatilin bu yılki tarihi; geçtiyse gelecek yılınki.
export function nextOccurrence({ month, day }, today = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  let year = today.getFullYear();
  const thisYear = new Date(year, month - 1, day);
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (thisYear < startOfToday) year += 1;
  return `${year}-${pad(month)}-${pad(day)}`;
}
