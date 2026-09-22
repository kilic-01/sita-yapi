import { getDrivingDistances } from "./googleMaps.js";

function haversineDistance(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h =
    sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const DEFAULT_DURATION_MINUTES = 30;

// Bir teknisyenin belirli bir gün (YYYY-MM-DD) için yıllık izinde olup
// olmadığını kontrol eder — technician.leaves, {startDate, endDate}
// aralıklarından oluşan bir dizi (her iki uç da dahil).
export function isOnLeave(technician, dateISO) {
  if (!dateISO || !technician?.leaves?.length) return false;
  return technician.leaves.some(
    (l) => l.startDate && l.endDate && dateISO >= l.startDate && dateISO <= l.endDate
  );
}

// Randevuları teknisyenlere DAĞITIR: dükkâna göre açı (bearing) yerine
// gerçek coğrafi mesafeyi temel alan açgözlü bir kümeleme kullanır — iki
// randevu dükkâna göre benzer yönde ama birbirinden çok uzak olabilir, açı
// bazlı bölüştürme bunu ayırt edemiyordu. Denge ölçütü olarak SÜRE değil
// İŞ SAYISI kullanılır: sahada çalışan teknisyenler kendi aralarında iş
// sayısını karşılaştırıyor, "senin işin daha uzun sürdüğü için az iş
// aldın" açıklaması pratikte kabul görmüyor ve haksızlık algısı
// yaratabiliyor — bu yüzden her teknisyen mümkün olduğunca eşit SAYIDA iş
// alır (fark en fazla 1), süre tahmini sadece bilgi amaçlı taşınır. Hiçbir
// iş "çok uzak" diye açıkta bırakılmaz (kapsama garantisi yapısal olarak
// sağlanır).
//
// Yöntem: "farthest-point seeding" (teknisyen sayısı kadar, birbirinden
// mümkün olduğunca uzak başlangıç noktası seçilir) + açgözlü büyütme
// (kalan her randevu, hedef SAYIYA henüz ulaşmamış bucket'lardan en yakın
// olanına — bucket'ın coğrafi ağırlık merkezine göre — eklenir).
// En-yakın-ÜYEYE göre değil ağırlık merkezine (centroid) göre mesafe
// kullanılır: en-yakın-üye "zincirleme" hatasına açıktır (her yeni nokta
// sadece kümedeki TEK bir üyeye yakın olması yeterli olduğu için uzun,
// yılan gibi kümeler oluşabilir); centroid kümeyi toparlak tutar ve O(1)
// güncellenir.
export function assignToTechnicians(appointments, technicians, shop) {
  const n = technicians.length;
  const buckets = technicians.map(() => []);
  if (n === 0 || appointments.length === 0) return buckets;

  const items = appointments.map((a) => ({
    ...a,
    _duration: a.estimatedDurationMinutes ?? DEFAULT_DURATION_MINUTES,
  }));

  // --- Seed seçimi: birbirinden mümkün olduğunca uzak seedCount tane iş ---
  // ("farthest-point seeding"). Her karşılaştırma KESİNLİKLE ">" ile
  // yapılır (">=" değil), böylece eşitlik durumunda orijinal sıradaki İLK
  // aday kazanır — sonuç her zaman aynı girdi için deterministiktir.
  const seedCount = Math.min(n, items.length);
  const seedIndexes = [];
  let firstSeed = 0;
  let firstSeedDist = -Infinity;
  for (let i = 0; i < items.length; i++) {
    const d = haversineDistance(shop, items[i]);
    if (d > firstSeedDist) {
      firstSeedDist = d;
      firstSeed = i;
    }
  }
  seedIndexes.push(firstSeed);

  while (seedIndexes.length < seedCount) {
    let candidate = -1;
    let candidateScore = -Infinity;
    for (let i = 0; i < items.length; i++) {
      if (seedIndexes.includes(i)) continue;
      let minDistToSeeds = Infinity;
      for (const seedIdx of seedIndexes) {
        minDistToSeeds = Math.min(minDistToSeeds, haversineDistance(items[i], items[seedIdx]));
      }
      if (minDistToSeeds > candidateScore) {
        candidateScore = minDistToSeeds;
        candidate = i;
      }
    }
    seedIndexes.push(candidate);
  }

  // --- Bucket'ları seed'lerle başlat ---
  const assigned = new Array(items.length).fill(false);
  const bucketCentroid = new Array(n).fill(null);

  seedIndexes.forEach((itemIdx, bucketIdx) => {
    const item = items[itemIdx];
    buckets[bucketIdx].push(item);
    assigned[itemIdx] = true;
    bucketCentroid[bucketIdx] = { lat: item.lat, lng: item.lng, count: 1 };
  });
  // seedCount < n ise (randevu sayısı teknisyen sayısından az) kalan
  // teknisyenler boş kalır — mevcut davranış.

  // --- Açgözlü büyütme: kalan işleri en yakın (henüz dolmamış) bucket'a ekle ---
  let remaining = items.map((_, i) => i).filter((i) => !assigned[i]);

  while (remaining.length > 0) {
    // Her adımda SADECE o an en az işi olan bucket(lar) yarışır — bir
    // bucket, diğerleri henüz ondan az işe sahipken asla bir iş daha
    // alamaz. Bu, "hedefin altında mı" gibi sabit bir eşiğin (targetCount)
    // aksine, en fazla/en az iş sayısı farkının HER ZAMAN en fazla 1
    // olmasını yapısal olarak garanti eder — geometrik olarak elverişli
    // bir bucket'ın, diğerleri hâlâ boşken art arda seçilip öne geçmesini
    // engeller.
    let minCount = Infinity;
    for (let b = 0; b < seedCount; b++) {
      if (buckets[b].length < minCount) minCount = buckets[b].length;
    }
    const openBuckets = [];
    for (let b = 0; b < seedCount; b++) {
      if (buckets[b].length === minCount) openBuckets.push(b);
    }

    let bestBucket = -1;
    let bestPos = -1;
    let bestDist = Infinity;
    for (const b of openBuckets) {
      const centroid = bucketCentroid[b];
      for (let r = 0; r < remaining.length; r++) {
        const d = haversineDistance(items[remaining[r]], centroid);
        if (d < bestDist) {
          bestDist = d;
          bestBucket = b;
          bestPos = r;
        }
      }
    }

    const itemIdx = remaining[bestPos];
    const item = items[itemIdx];
    buckets[bestBucket].push(item);
    const centroid = bucketCentroid[bestBucket];
    bucketCentroid[bestBucket] = {
      lat: (centroid.lat * centroid.count + item.lat) / (centroid.count + 1),
      lng: (centroid.lng * centroid.count + item.lng) / (centroid.count + 1),
      count: centroid.count + 1,
    };
    remaining.splice(bestPos, 1);
  }

  return buckets;
}

async function nearestNeighborOrder(stops, startCoord, apiKey) {
  const remaining = [...stops];
  const ordered = [];
  let currentCoord = startCoord;

  while (remaining.length) {
    if (remaining.length === 1) {
      ordered.push(remaining.pop());
      break;
    }
    const distances = await getDrivingDistances(
      currentCoord,
      remaining.map((s) => ({ lat: s.lat, lng: s.lng })),
      apiKey
    );
    let minIdx = 0;
    for (let i = 1; i < distances.length; i++) {
      if (distances[i] < distances[minIdx]) minIdx = i;
    }
    const [next] = remaining.splice(minIdx, 1);
    ordered.push(next);
    currentCoord = { lat: next.lat, lng: next.lng };
  }
  return ordered;
}

// Bir teknisyenin durak listesini sıralar: önce acil işler dükkândan
// başlayarak en-yakın-komşu mantığıyla, ardından normal işler son
// gidilen noktadan devam ederek aynı mantıkla sıralanır.
export async function orderTechnicianStops(stops, shopCoord, apiKey) {
  const urgent = stops.filter((s) => s.urgency === "acil");
  const normal = stops.filter((s) => s.urgency !== "acil");

  const orderedUrgent = urgent.length
    ? await nearestNeighborOrder(urgent, shopCoord, apiKey)
    : [];

  const lastCoord = orderedUrgent.length
    ? { lat: orderedUrgent[orderedUrgent.length - 1].lat, lng: orderedUrgent[orderedUrgent.length - 1].lng }
    : shopCoord;

  const orderedNormal = normal.length
    ? await nearestNeighborOrder(normal, lastCoord, apiKey)
    : [];

  return [...orderedUrgent, ...orderedNormal];
}

export { haversineDistance };
