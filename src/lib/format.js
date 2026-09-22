export const STATUS_LABELS = {
  pending: "Bekliyor",
  routed: "Rotalandı",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
};

// Ürüne özel bir eşik (lowStockThreshold) girilmemişse bu varsayılan
// kullanılır — StockPage.jsx (Stok sekmesi) ve LowStockWidget
// (Anasayfa) arasında paylaşılan tek bir kural olsun diye.
export const DEFAULT_LOW_STOCK_THRESHOLD = 2;

export function isLowStock(item) {
  const threshold = item.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  return Number(item.quantity) <= threshold;
}

// Verilen Date nesnesinin YEREL (tarayıcının kendi saat dilimi) tarihini
// YYYY-MM-DD olarak döndürür. Date.toISOString() HER ZAMAN UTC kullanır —
// Türkiye (UTC+3) saatiyle gece yarısı ile 03:00 arasında bu, bir önceki
// GÜNÜN tarihini verir (örn. TR saatiyle 00:30 aslında UTC'de hâlâ dünün
// 21:30'u). Bu yüzden "bugünün tarihi" her yerde bu fonksiyonla hesaplanır.
export function toLocalISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayISO() {
  return toLocalISODate(new Date());
}

// Türkçe kurallarına uygun "Title Case" — "ı" harfi büyütülünce "I" değil
// "İ" olmalı ve tam tersi, bu yüzden düz .toUpperCase()/.toLowerCase()
// yerine "tr" yerel ayarlı sürümleri kullanılıyor. Kelime sınırı sadece
// boşluk değil — "NO:153", "K.3/D.5" gibi adres kısaltmalarında da doğru
// görünmesi için ayraçlardan (: - / . ( ) sonrası da büyük harfle başlar.
export function toTitleCase(str) {
  if (!str) return str;
  return str
    .toLocaleLowerCase("tr")
    .replace(/(^|[\s\-/.(:])([a-zçğıöşü])/g, (_m, sep, ch) => sep + ch.toLocaleUpperCase("tr"));
}

// Bir teknisyenin belirli bir gün (YYYY-MM-DD) için yıllık izinde olup
// olmadığını kontrol eder — technician.leaves, {startDate, endDate}
// aralıklarından oluşan bir dizi (her iki uç da dahil).
export function isOnLeave(technician, dateISO) {
  if (!dateISO || !technician?.leaves?.length) return false;
  return technician.leaves.some(
    (l) => l.startDate && l.endDate && dateISO >= l.startDate && dateISO <= l.endDate
  );
}

function parseISODateLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Bir tatil kaydının verilen tarihi kapsayıp kapsamadığını kontrol eder.
// `recurring` işaretliyse (ör. 23 Nisan, 1 Mayıs gibi tarihi hiç
// değişmeyen resmi bayramlar) yıl hiç dikkate alınmaz, sadece ay-gün
// eşleşmesine bakılır — böylece admin her yıl yeniden girmek zorunda
// kalmaz. Dini bayramlar (Ramazan/Kurban) her yıl tarihi değiştiği için
// `recurring` işaretlenmemeli, her yıl elle girilmeye devam eder.
function holidayMatches(dateISO, h) {
  if (!dateISO || !h.startDate || !h.endDate) return false;
  if (h.recurring) {
    const dayMD = dateISO.slice(5);
    const startMD = h.startDate.slice(5);
    const endMD = h.endDate.slice(5);
    return dayMD >= startMD && dayMD <= endMD;
  }
  return dateISO >= h.startDate && dateISO <= h.endDate;
}

// Verilen tarih (YYYY-MM-DD) bir resmi/dini tatile denk geliyorsa o tatil
// kaydını ({id, name, startDate, endDate, recurring}), değilse undefined
// döner — randevu formu ve takvim ekranlarında kullanıcıya göstermek için.
export function holidayOnDate(dateISO, holidays) {
  return (holidays || []).find((h) => holidayMatches(dateISO, h));
}

function isHoliday(dateISO, holidays) {
  return !!holidayOnDate(dateISO, holidays);
}

// Bir izin aralığındaki (her iki uç dahil) gün sayısını, PAZAR günlerini
// VE resmi/dini tatil günlerini (holidays — bkz. Ayarlar > Resmi ve Dini
// Tatiller) hariç tutarak sayar — şirkette cumartesi çalışılıyor, yani
// cumartesi izin süresinden düşülür ama pazar zaten haftalık tatil olduğu
// için hiç düşülmez (4857 sayılı İş Kanunu m.53: "izin süresine rastlayan
// hafta tatili, ulusal bayram ve genel tatil günleri izin süresinden
// sayılmaz").
export function countDeductibleLeaveDays(startDate, endDate, holidays = []) {
  if (!startDate || !endDate) return 0;
  let count = 0;
  let d = parseISODateLocal(startDate);
  const end = parseISODateLocal(endDate);
  while (d <= end) {
    const dISO = toLocalISODate(d);
    if (d.getDay() !== 0 && !isHoliday(dISO, holidays)) count++;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  }
  return count;
}

// Bir izin aralığının SADECE verilen takvim yılına denk gelen kısmını sayar
// (yıl sınırını aşan izinlerde diğer yıla taşan günler bu yıla dahil edilmez).
export function countDeductibleLeaveDaysInYear(startDate, endDate, year, holidays = []) {
  if (!startDate || !endDate) return 0;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const clippedStart = startDate < yearStart ? yearStart : startDate;
  const clippedEnd = endDate > yearEnd ? yearEnd : endDate;
  if (clippedStart > clippedEnd) return 0;
  return countDeductibleLeaveDays(clippedStart, clippedEnd, holidays);
}

// Bir işe başlama tarihinden itibaren TAMAMLANMIŞ hizmet yılı sayısı
// (kıdem yıl dönümü henüz gelmediyse bir eksik sayılır).
export function fullYearsOfService(hireDate, referenceDate = new Date()) {
  if (!hireDate) return 0;
  const hire = parseISODateLocal(hireDate);
  let years = referenceDate.getFullYear() - hire.getFullYear();
  const hadAnniversary =
    referenceDate.getMonth() > hire.getMonth() ||
    (referenceDate.getMonth() === hire.getMonth() && referenceDate.getDate() >= hire.getDate());
  if (!hadAnniversary) years -= 1;
  return Math.max(0, years);
}

// 4857 sayılı İş Kanunu madde 53'e göre kıdeme dayalı asgari yıllık ücretli
// izin süresi: 1-5 yıl (5 dahil) → 14 gün, 5 yıldan fazla-15 yıldan az → 20
// gün, 15 yıl ve üzeri → 26 gün. (18 yaşından küçük/50 yaşından büyük
// işçiler için kıdemden bağımsız 20 gün istisnası, doğum tarihi
// izlenmediği için burada uygulanmıyor — gerekirse elle 20'ye çıkarılabilir.)
export function suggestAnnualLeaveDays(hireDate, referenceDate = new Date()) {
  if (!hireDate) return 14;
  const years = fullYearsOfService(hireDate, referenceDate);
  if (years >= 15) return 26;
  if (years > 5) return 20;
  return 14;
}

// Bir kişinin TÜM izinlerinden, verilen tarihe kadar (dahil) kullandığı
// toplam gün sayısı — yıl sınırıyla kısıtlanmaz, kümülatif "kalan izin"
// hesabı için kullanılır (kullanılmayan izin bir sonraki yıla devreder,
// her yıl sıfırdan başlamaz).
export function totalDeductibleLeaveDaysUpTo(leaves, asOfDateISO, holidays = []) {
  return (leaves || []).reduce((sum, l) => {
    if (!l.startDate || !l.endDate) return sum;
    const clippedEnd = l.endDate > asOfDateISO ? asOfDateISO : l.endDate;
    if (l.startDate > clippedEnd) return sum;
    return sum + countDeductibleLeaveDays(l.startDate, clippedEnd, holidays);
  }, 0);
}

export function formatDateTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Verilen tarihten (YYYY-MM-DD ya da tam ISO zaman damgası) bu yana geçen
// tam gün sayısı — bekleyen parça takibinde "kaç gündür bekleniyor"
// göstermek için kullanılır.
export function daysSince(dateStr) {
  if (!dateStr) return 0;
  const then = new Date(dateStr).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86400000));
}
