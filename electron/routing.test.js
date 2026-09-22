import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { assignToTechnicians, haversineDistance, DEFAULT_DURATION_MINUTES } from "./routing.js";

const SHOP = { lat: 41.086, lng: 29.027 }; // Beşiktaş, dükkan

function makeTechnicians(count) {
  return Array.from({ length: count }, (_, i) => ({ id: `tech-${i + 1}`, name: `Teknisyen ${i + 1}` }));
}

// Dükkandan belirli bir açıda (derece) ve mesafede bir randevu üretir —
// aynı açıya yakın randevular gerçekte de aynı coğrafi bölgede olur.
function makeAppointment(id, angleDeg, distanceDeg = 0.02, durationMinutes) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    id,
    lat: SHOP.lat + Math.sin(rad) * distanceDeg,
    lng: SHOP.lng + Math.cos(rad) * distanceDeg,
    estimatedDurationMinutes: durationMinutes,
  };
}

describe("assignToTechnicians", () => {
  test("hiçbir randevuyu kaybetmez veya çiftlemez", () => {
    const appointments = Array.from({ length: 11 }, (_, i) => makeAppointment(`a${i}`, i * 30));
    const buckets = assignToTechnicians(appointments, makeTechnicians(4), SHOP);

    const allIds = buckets.flat().map((a) => a.id).sort();
    const expectedIds = appointments.map((a) => a.id).sort();
    assert.deepEqual(allIds, expectedIds);
  });

  test("teknisyen sayısı randevu sayısından fazlaysa boş teknisyenler olabilir ama hepsi paylaşılır", () => {
    // Bug regresyon testi: "tüm işler tek bir kişiye atanıyor" hatası.
    const appointments = [
      makeAppointment("a1", 0),
      makeAppointment("a2", 90),
      makeAppointment("a3", 180),
    ];
    const buckets = assignToTechnicians(appointments, makeTechnicians(4), SHOP);

    const nonEmptyBuckets = buckets.filter((b) => b.length > 0);
    assert.equal(nonEmptyBuckets.length, 3, "3 randevu, 3 farklı teknisyene dağılmalı");
    for (const bucket of nonEmptyBuckets) {
      assert.equal(bucket.length, 1, "hiçbir teknisyen birden fazla iş almamalı (hepsi boş teknisyen varken)");
    }
  });

  test("gerçek dünya boyutunda (asimetrik konumlu) bir gün bile en fazla 1 fark ile dengeleniyor", () => {
    // Regresyon testi: gerçek verideki bir günde (10 randevu, 4 teknisyen,
    // konumlar simetrik bir daire ÜZERİNDE DEĞİL, dükkânın çevresine
    // dağınık) eski eşik mantığı ("bucket.length < ortalama") bazı
    // bucket'ların 3'e çıkarken birinin 1'de kalmasına izin veriyordu —
    // çünkü coğrafi olarak elverişli bir bucket, diğerleri hâlâ boşken art
    // arda seçilebiliyordu. Doğru davranış: her adımda SADECE o an en az
    // işi olan bucket(lar) yeni iş alabilmeli.
    const appointments = [
      makeAppointment("a0", 15, 0.05),
      makeAppointment("a1", 40, 0.03),
      makeAppointment("a2", 70, 0.08),
      makeAppointment("a3", 95, 0.02),
      makeAppointment("a4", 130, 0.06),
      makeAppointment("a5", 160, 0.04),
      makeAppointment("a6", 190, 0.09),
      makeAppointment("a7", 230, 0.05),
      makeAppointment("a8", 280, 0.03),
      makeAppointment("a9", 320, 0.07),
    ];
    const buckets = assignToTechnicians(appointments, makeTechnicians(4), SHOP);
    const counts = buckets.map((b) => b.length);
    assert.equal(
      counts.reduce((s, c) => s + c, 0),
      10,
      "hiçbir randevu kaybolmamalı"
    );
    assert.ok(
      Math.max(...counts) - Math.min(...counts) <= 1,
      `iş sayıları en fazla 1 fark etmeli, gerçek dağılım: ${counts}`
    );
  });

  test("eşit süreli işler teknisyenler arasında sayıca dengeli bölüşülür", () => {
    const appointments = Array.from({ length: 8 }, (_, i) => makeAppointment(`a${i}`, i * 45, 0.02, 30));
    const buckets = assignToTechnicians(appointments, makeTechnicians(4), SHOP);

    for (const bucket of buckets) {
      assert.equal(bucket.length, 2, "8 eşit iş 4 teknisyene 2'şer dağılmalı");
    }
  });

  test("uzun süreli tek bir iş, o teknisyenin aldığı iş SAYISINI azaltmaz (süre değil sayı dengelenir)", () => {
    // Saha ekibi kendi aralarında iş SAYISINI karşılaştırıyor — "senin işin
    // uzun sürdüğü için az iş aldın" açıklaması pratikte kabul görmüyor ve
    // haksızlık algısı yaratıyor. Bu yüzden 180 dakikalık tek bir iş, o
    // teknisyenin toplam iş SAYISINI diğerlerinden az bırakmamalı.
    const longJob = makeAppointment("long", 0, 0.02, 180);
    const shortJobs = Array.from({ length: 6 }, (_, i) => makeAppointment(`s${i}`, 10 + i * 55, 0.02, 30));
    const buckets = assignToTechnicians([longJob, ...shortJobs], makeTechnicians(4), SHOP);

    const counts = buckets.map((b) => b.length);
    assert.ok(
      Math.max(...counts) - Math.min(...counts) <= 1,
      `iş sayıları teknisyenler arasında en fazla 1 fark etmeli, gerçek dağılım: ${counts}`
    );
  });

  test("gerçek mesafeye göre kümelenir: dükkâna göre benzer açıda ama birbirinden uzak işler ayrı teknisyene düşer", () => {
    // İki SIKI küme, dükkâna göre tam zıt yönlerde (~45° ve ~225°) ama her
    // kümenin kendi içindeki işler sadece birkaç yüz metre arayla. Eski açı
    // bazlı algoritmanın çözemediği tam senaryo: yakınlık, dükkâna göre AÇI
    // değil, işlerin BİRBİRİNE olan gerçek mesafesiyle ölçülmeli.
    const cluster1 = [44, 45, 46].map((deg, i) => makeAppointment(`c1-${i}`, deg, 0.05, 30));
    const cluster2 = [224, 225, 226].map((deg, i) => makeAppointment(`c2-${i}`, deg, 0.05, 30));
    const buckets = assignToTechnicians([...cluster1, ...cluster2], makeTechnicians(2), SHOP);

    const bucketOf = (id) => buckets.findIndex((b) => b.some((a) => a.id === id));
    const cluster1Buckets = new Set(cluster1.map((a) => bucketOf(a.id)));
    const cluster2Buckets = new Set(cluster2.map((a) => bucketOf(a.id)));
    assert.equal(cluster1Buckets.size, 1, "1. kümenin tüm işleri aynı teknisyene düşmeli");
    assert.equal(cluster2Buckets.size, 1, "2. kümenin tüm işleri aynı teknisyene düşmeli");
    assert.notEqual(
      [...cluster1Buckets][0],
      [...cluster2Buckets][0],
      "iki ayrı (birbirinden uzak) küme farklı teknisyenlere düşmeli"
    );
  });

  test("gerçek algoritma, coğrafyayı hiç dikkate almayan sıralı bölmeden daha sıkı (kompakt) kümeler üretir", () => {
    const ring = Array.from({ length: 12 }, (_, i) => makeAppointment(`a${i}`, i * 30, 0.02, 30));
    // Girdi sırasını karıştırıyoruz (çembersel komşuları birbirinden
    // ayırıyoruz) ki "girdi sırasını olduğu gibi eşit parçalara böl" temel
    // çizgisi tesadüfen zaten coğrafi açıdan iyi bir bölünme olmasın —
    // yoksa karşılaştırma anlamsızlaşır.
    const shuffleOrder = [0, 6, 1, 7, 2, 8, 3, 9, 4, 10, 5, 11];
    const shuffled = shuffleOrder.map((i) => ring[i]);

    const technicians = makeTechnicians(4);
    const realBuckets = assignToTechnicians(shuffled, technicians, SHOP);

    const groupSize = shuffled.length / technicians.length;
    const naiveBuckets = technicians.map((_, t) => shuffled.slice(t * groupSize, (t + 1) * groupSize));

    function centroidOf(bucket) {
      return {
        lat: bucket.reduce((s, a) => s + a.lat, 0) / bucket.length,
        lng: bucket.reduce((s, a) => s + a.lng, 0) / bucket.length,
      };
    }

    function totalSpread(buckets) {
      return buckets.reduce((sum, bucket) => {
        if (bucket.length === 0) return sum;
        const centroid = centroidOf(bucket);
        const avgDist = bucket.reduce((s, a) => s + haversineDistance(a, centroid), 0) / bucket.length;
        return sum + avgDist;
      }, 0);
    }

    const realSpread = totalSpread(realBuckets);
    const naiveSpread = totalSpread(naiveBuckets);
    assert.ok(
      realSpread <= naiveSpread + 1e-9,
      `gerçek algoritmanın toplam sıkılığı (${realSpread.toFixed(4)} km) naif bölmeden (${naiveSpread.toFixed(4)} km) daha kötü olmamalı`
    );
  });

  test("süre tahmini olmayan işler için varsayılan süre kullanılır", () => {
    const appointments = [makeAppointment("a1", 0, 0.02, undefined)];
    const buckets = assignToTechnicians(appointments, makeTechnicians(1), SHOP);
    assert.equal(buckets[0][0]._duration, DEFAULT_DURATION_MINUTES);
  });

  test("randevu yoksa tüm teknisyenler boş döner, hata vermez", () => {
    const buckets = assignToTechnicians([], makeTechnicians(4), SHOP);
    assert.equal(buckets.length, 4);
    for (const bucket of buckets) assert.equal(bucket.length, 0);
  });

  test("teknisyen yoksa boş dizi döner, hata vermez", () => {
    const appointments = [makeAppointment("a1", 0)];
    const buckets = assignToTechnicians(appointments, [], SHOP);
    assert.deepEqual(buckets, []);
  });
});

describe("haversineDistance", () => {
  test("aynı noktanın mesafesi sıfırdır", () => {
    assert.equal(haversineDistance(SHOP, SHOP), 0);
  });

  test("bilinen iki nokta arası mesafe yaklaşık doğrudur (Beşiktaş -> Kadıköy ~10-13 km)", () => {
    const besiktas = { lat: 41.0422, lng: 29.0083 };
    const kadikoy = { lat: 40.9833, lng: 29.0333 };
    const km = haversineDistance(besiktas, kadikoy);
    assert.ok(km > 5 && km < 15, `beklenmeyen mesafe: ${km} km`);
  });
});
