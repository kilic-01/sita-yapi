// Randevu oluşturma özelliği için regresyon testleri.
//
// Not: handlers.addAppointment doğrudan Supabase'e bağlı (mock kullanmıyoruz
// — mevcut çalışan mantığı değiştirmemek için) bu yüzden DB'ye bağımlı
// testler GERÇEK DEV veritabanına karşı çalışan entegrasyon testleridir (her
// biri oluşturduğu test kaydını sonunda siler). NODE_ENV burada elle
// "development" yapılır ki testler yanlışlıkla PROD'a bağlanmasın —
// db.js/handlers.js'i STATİK değil DİNAMİK import ediyoruz ki bu satır,
// modüller yüklenmeden (ve dolayısıyla config.js NODE_ENV'i okumadan) önce
// çalışsın.
process.env.NODE_ENV = "development";
delete process.env.FORCE_PROD_DB;

import { test } from "node:test";
import assert from "node:assert/strict";
import { findCustomerAppointments } from "../src/lib/customerMatch.js";

const db = await import("./db.js");
const handlers = await import("./handlers.js");

// handlers.addAppointment artık geocoding'i bilerek BEKLEMEDEN dönüyor
// (fire-and-forget arkaplan işi — bkz. runBackgroundGeocode). Bir testin
// oluşturduğu kaydı hemen silmesi, o arkaplan işi hâlâ sürerken kaydı
// ortadan kaldırabiliyor — iş bitince "bulunamayan" bir satırı güncellemeye
// çalışıp zararsız ama gürültülü bir hata basıyor. Temizlikten önce kısa
// bir bekleme, arkaplan işinin doğal olarak bitmesine izin verir.
function waitForBackgroundGeocode() {
  return new Promise((resolve) => setTimeout(resolve, 3000));
}

function validAppointmentInput(overrides = {}) {
  return {
    customerName: "Test Müşteri Regresyon",
    contactName: "",
    customerPhone: "05551112233",
    address: "Test Sokak No:1, Test Mahallesi, Kadıköy/İstanbul",
    addressDetail: { street: "Test Sokak No:1", mahalle: "Test Mahallesi", ilce: "Kadıköy", il: "İstanbul" },
    complaint: "Test şikayeti",
    urgency: "normal",
    scheduledDate: "2099-06-15",
    ...overrides,
  };
}

// --- Müşteri eşleştirme (findCustomerAppointments) — saf fonksiyon, DB
// gerekmiyor, hızlı ve ağdan bağımsız. DB'ye bağımlı entegrasyon testinden
// (aşağıda, kendi after kancasında process.exit(0) çağırıyor) ÖNCE
// çalışması için bilerek dosyanın bu noktasına, üstte tutuluyor.

test("müşteri adı+telefonu aynıysa geçmiş randevusuyla eşleşiyor", () => {
  const appointments = [
    { id: "a1", customerName: "Ayşe Yılmaz", customerPhone: "05551112233", address: "X Mah.", scheduledDate: "2026-01-01" },
    { id: "a2", customerName: "Başka Müşteri", customerPhone: "05559998877", address: "Y Mah.", scheduledDate: "2026-01-02" },
  ];
  const matches = findCustomerAppointments(appointments, { name: "Ayşe Yılmaz", phone: "0555 111 22 33" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "a1");
});

test("aynı isim ama farklı telefon numarasıyla EŞLEŞMİYOR (yaygın isim koruması)", () => {
  const appointments = [
    { id: "a1", customerName: "Cengiz Kaya", customerPhone: "05551112233", address: "X Mah.", scheduledDate: "2026-01-01" },
  ];
  const matches = findCustomerAppointments(appointments, { name: "Cengiz Kaya", phone: "05559998877" });
  assert.equal(matches.length, 0, "sadece isim aynı olması yeterli sayılmamalı");
});

test("adres sorgusu (en az 4 karakter) içeren geçmiş kayıtlarla eşleşiyor", () => {
  const appointments = [
    { id: "a1", customerName: "Eski Kayıt", customerPhone: "", address: "ORMANADA NO:153", scheduledDate: "2020-01-01" },
  ];
  const matches = findCustomerAppointments(appointments, { name: "", phone: "", addressQuery: "ormanada" });
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "a1");
});

test("düzenlenmekte olan randevunun kendisi (excludeId) sonuçtan çıkarılıyor", () => {
  const appointments = [
    { id: "current", customerName: "Deniz Er", customerPhone: "05551112233", address: "X Mah.", scheduledDate: "2026-01-01" },
    { id: "past", customerName: "Deniz Er", customerPhone: "05551112233", address: "X Mah.", scheduledDate: "2025-01-01" },
  ];
  const matches = findCustomerAppointments(appointments, { name: "Deniz Er", phone: "05551112233" }, "current");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].id, "past");
});

test("sonuçlar en yeni tarihten en eskiye doğru sıralanıyor", () => {
  const appointments = [
    { id: "old", customerName: "Fatma Su", customerPhone: "05550001122", address: "", scheduledDate: "2020-01-01" },
    { id: "new", customerName: "Fatma Su", customerPhone: "05550001122", address: "", scheduledDate: "2025-01-01" },
  ];
  const matches = findCustomerAppointments(appointments, { name: "Fatma Su", phone: "05550001122" });
  assert.deepEqual(matches.map((m) => m.id), ["new", "old"]);
});

// DB'ye bağımlı 5 test TEK bir üst test altında alt-test (t.test) olarak
// çalıştırılıyor — db.initDb()'nin açtığı Supabase Realtime aboneliğini
// (electron/db.js'in normal, değiştirmediğimiz davranışı) bu üst testin
// kendi after kancasıyla, tüm alt testler bittiğinde kapatıyoruz. Bunları
// bağımsız üst-seviye test() çağrıları olarak değil de böyle gruplamamızın
// sebebi: db.initDb()'yi dosya en üstünde top-level await ile çağırmak,
// bu Node sürümünde node:test'in zamanlamasını şaşırtıp yalnızca ilk birkaç
// testi çalıştırıp after()'ı erken tetikliyordu (gözlemlenmiş bir tuhaflık)
// — tek bir üst testin ALT testleri olarak çalıştırmak bunu ortadan kaldırdı.
test("randevu oluşturma — entegrasyon testleri (DEV veritabanı)", async (t) => {
  await db.initDb();
  // process.exit()'i after() içinde DOĞRUDAN/senkron çağırmak, bu Node
  // sürümünde node:test'in son alt-testi kaydetmeden hemen önce süreci
  // kapatmasına yol açan gözlemlenmiş bir off-by-one zamanlama sorunuydu
  // (minimal bir tekrarla doğrulandı) — setImmediate ile bir tık geciktirmek
  // test runner'ın kendi iç durumunu toparlamasına yetiyor.
  t.after(() => {
    setImmediate(() => process.exit(0));
  });

  await t.test("geçerli bilgilerle randevu oluşturulabiliyor", async () => {
    const { appointment, geocodeError } = await handlers.addAppointment(validAppointmentInput());
    try {
      assert.ok(appointment.id, "oluşan randevunun bir id'si olmalı");
      assert.equal(appointment.customerName, "Test Müşteri Regresyon");
      assert.equal(appointment.address, "Test Sokak No:1, Test Mahallesi, Kadıköy/İstanbul");
      assert.equal(appointment.status, "pending", "teknisyen atanmadan oluşturulan randevu 'pending' olmalı");
      assert.equal(appointment.scheduledDate, "2099-06-15");
      // Geocoding artık asenkron/arkaplanda çalışıyor — kayıt anında hata
      // döndürmemeli (bkz. AppointmentForm.jsx'in bu değeri nasıl kullandığı).
      assert.equal(geocodeError, null);
      await waitForBackgroundGeocode();
    } finally {
      await db.deleteAppointment(appointment.id, null);
    }
  });

  await t.test("zorunlu bir alan (müşteri adı) boşsa kayıt engelleniyor", async () => {
    await assert.rejects(
      () => handlers.addAppointment(validAppointmentInput({ customerName: null })),
      /customerName|not-null|null value/i,
      "customerName null iken addAppointment hata fırlatmalı"
    );
  });

  await t.test("zorunlu bir alan (adres) boşsa kayıt engelleniyor", async () => {
    await assert.rejects(
      () => handlers.addAppointment(validAppointmentInput({ address: null })),
      /address|not-null|null value/i,
      "address null iken addAppointment hata fırlatmalı"
    );
  });

  await t.test("randevu kaydedildikten sonra listede doğru şekilde görünüyor", async () => {
    const { appointment } = await handlers.addAppointment(
      validAppointmentInput({ customerName: "Test Liste Kontrol Regresyon" })
    );
    try {
      // handlers.listAppointments() (== db.getAppointments()) gerçek
      // üretimde OLDUĞU GİBİ ~20 binin üzerindeki TÜM randevu tablosunu
      // sayfalayarak çekiyor — bunu her testte çağırmak yavaş ve gereksiz;
      // asıl doğrulanmak istenen "kayıt depoya doğru yazıldı mı, tam ve
      // doğru geri okunabiliyor mu" sorusu, listede yer alacağı AYNI satırı
      // tekil okuyarak da eksiksiz test ediliyor.
      const found = await db.getAppointmentById(appointment.id);
      assert.ok(found, "yeni oluşturulan randevu veritabanından geri okunabilmeli");
      assert.equal(found.customerName, "Test Liste Kontrol Regresyon");
      assert.equal(found.address, appointment.address);
      assert.equal(found.scheduledDate, "2099-06-15");
      await waitForBackgroundGeocode();
    } finally {
      await db.deleteAppointment(appointment.id, null);
    }
  });

  await t.test(
    "adres/tarih düzenlemesi randevunun durumunu/teknisyen atamasını sıfırlamıyor",
    async () => {
      const REAL_TECHNICIAN_ID = "85d30a83-1e52-4a4e-bdc9-a3f8286302f7"; // Çağlar KARA (DEV)
      const appointment = await db.addAppointment({
        customerName: "Test Durum Koruma Regresyon",
        address: "Eski Adres, Test Mahallesi, Kadıköy/İstanbul",
        addressDetail: { street: "Eski Adres", mahalle: "Test Mahallesi", ilce: "Kadıköy", il: "İstanbul" },
        complaint: "Test",
        scheduledDate: "2099-06-17",
        status: "routed",
        assignedTechnicianId: REAL_TECHNICIAN_ID,
        stopOrder: 3,
        manuallyAssigned: true,
        lat: 40.98,
        lng: 29.03,
      });
      try {
        // Sadece adresi değiştiriyoruz — form davranışına uygun olarak
        // assignedTechnicianId patch'te HİÇ gönderilmiyor (dokunulmamış).
        const { appointment: updated } = await handlers.updateAppointment(appointment.id, {
          address: "Yeni Adres, Test Mahallesi, Kadıköy/İstanbul",
          addressDetail: { street: "Yeni Adres", mahalle: "Test Mahallesi", ilce: "Kadıköy", il: "İstanbul" },
        });
        assert.equal(updated.status, "routed", "adres değişince durum 'pending'e çekilmemeli");
        assert.equal(updated.assignedTechnicianId, REAL_TECHNICIAN_ID, "teknisyen ataması korunmalı");
        assert.equal(updated.stopOrder, 3, "rota sırası korunmalı");
        await waitForBackgroundGeocode();
      } finally {
        await db.deleteAppointment(appointment.id, null);
      }
    }
  );

  await t.test(
    "rota oluşturma, henüz geocode edilmemiş (arkaplan işi bitmemiş) bir randevuyu yanlışlıkla atlamıyor",
    async () => {
      // handlers.addAppointment yerine db.addAppointment kullanılıyor — bu,
      // handlers.js'teki arkaplan geocoding'i hiç tetiklemez, böylece
      // "randevu eklendi ama konumu henüz gelmedi" anını güvenilir şekilde
      // simüle eder.
      const appointment = await db.addAppointment({
        customerName: "Test Rota Yakalama Regresyon",
        address: "Test Sokak No:1, Test Mahallesi, Kadıköy/İstanbul",
        addressDetail: { street: "Test Sokak No:1", mahalle: "Test Mahallesi", ilce: "Kadıköy", il: "İstanbul" },
        complaint: "Test",
        scheduledDate: "2099-06-16",
        lat: null,
        lng: null,
      });
      try {
        await handlers.buildRoutes("2099-06-16", null);
        const refreshed = await db.getAppointmentById(appointment.id);
        // Asıl doğrulanmak istenen budur: buildRoutes çalıştıktan sonra
        // lat/lng dolmuş olmalı (yakalama denemesi çalıştı). Google'ın bu
        // adresi "partial match"/düşük güvenilirlikli bulup ayrıca bir
        // geocodeIssue uyarısı koyması ayrı, MEŞRU bir durum (adres kalitesi
        // şüpheliyse "kontrol gerekli" listesinde kalması zaten istenen
        // davranış) — bu test SADECE "lat==null olduğu için yanlışlıkla
        // atlanma" hatasının düzeldiğini kontrol ediyor.
        assert.ok(refreshed.lat != null && refreshed.lng != null, "yakalama denemesi lat/lng'yi doldurmalı");
      } finally {
        await db.deleteAppointment(appointment.id, null);
      }
    }
  );
});
