// Uygulamanın tüm iş mantığı burada toplanır. Electron (main.js, IPC ile) ve
// telefon/tarayıcı testi için çalışan web sunucusu (server/index.js, HTTP ile)
// aynı fonksiyonları çağırır — mantık tek yerde, iki farklı taşıma katmanı var.

import * as db from "./db.js";
import { geocodeAddress } from "./googleMaps.js";
import { buildGeocodeAttempts } from "./geocodeQuery.js";
import { estimateJobDurationMinutes } from "./gemini.js";
import { getRandomFeaturedImage } from "./wikimedia.js";
import { assignToTechnicians, orderTechnicianStops, isOnLeave, haversineDistance } from "./routing.js";
import { GOOGLE_MAPS_API_KEY, GEMINI_API_KEY, FILOTIM_API_KEY, SHOP_LOCATION } from "./config.js";
import { fetchFuelPurchases, fetchFuelDevices, fetchFleetSummary } from "./filotimSync.js";

// API anahtarları önce Ayarlar'dan yönetici tarafından girilmiş bir
// değer var mı diye kontrol eder, yoksa electron/config.js'teki varsayılana
// döner. Böylece anahtarlar uygulama yeniden başlatılmadan Ayarlar'dan
// güncellenebilir.
async function currentApiKeys() {
  const settings = await db.getSettings();
  return {
    googleMapsApiKey: settings.googleMapsApiKey || GOOGLE_MAPS_API_KEY || "",
    geminiApiKey: settings.geminiApiKey || GEMINI_API_KEY || "",
    filotimApiKey: settings.filotimApiKey || FILOTIM_API_KEY || "",
  };
}

// Google'ın bulduğu adres, kullanıcının seçtiği ilçeyi içermiyorsa (aynı isimli
// sokak başka bir ilçede bulunmuş olabilir) veya sonuç eksik/kaba bir eşleşmeyse
// bunu kullanıcıya açıklayan bir uyarı metni üretir.
function checkGeocodeQuality(result, addressDetail) {
  if (result.approximate) {
    return `Google bu adresin tam sokak/bina konumunu bulamadı, sadece mahalle/ilçe merkezine yakın bir tahmini konum kullandı (bulduğu: "${result.formattedAddress}"). Sokak/bina bilgisini kontrol edin.`;
  }
  // partial_match TEK BAŞINA güvenilmezlik anlamına gelmiyor — Google,
  // adresinizdeki "Kat:7"/"D:15"/"21/A Blok" gibi ek tanımlayıcı detayları
  // kendi standart formatında birebir tekrar edemediğinde de bu bayrağı
  // koyuyor, konumun kendisi ROOFTOP (bina bazında tam isabet) olsa bile.
  // Bu yüzden partial_match'i sadece hassasiyet DÜŞÜKSE (bina/adres aralığı
  // net değilse) gerçek bir uyarı sayıyoruz.
  const highPrecision = result.locationType === "ROOFTOP" || result.locationType === "RANGE_INTERPOLATED";
  if (result.partialMatch && !highPrecision) {
    return `Google adresi eksik/kısmi eşleştirdi (bulduğu: "${result.formattedAddress}") — konum yanlış olabilir. Adresi kontrol edin.`;
  }
  const expectedIlce = addressDetail?.ilce;
  if (
    expectedIlce &&
    !result.formattedAddress.toLocaleUpperCase("tr").includes(expectedIlce.toLocaleUpperCase("tr"))
  ) {
    return `Google bu adresi "${expectedIlce}" ilçesinde bulamadı, bunun yerine "${result.formattedAddress}" konumunu buldu — aynı isimli sokak başka bir ilçede olabilir. Lütfen adresi kontrol edin.`;
  }
  return null;
}

// buildRoutes'ta konumu belirsiz/hiç bulunamamış (geocodeProblem) bir randevuyu
// hangi teknisyenin rotasına ekleyeceğimize karar verir. Konumu (yaklaşık da
// olsa) varsa, o gün GERÇEKTEN konumlanmış duraklara (referencePoints) en
// yakın olanın teknisyenini seçer — açı/kümeleme hesabına hiç dahil edilmez,
// sadece son eklenen ekstra durak olarak iliştirilir. Konumu hiç yoksa (Google
// adresi tamamen bulamadı) coğrafi mesafe hesaplanamaz; bunun yerine aynı
// ilçede başka bir durağı olan teknisyen aranır. Hiçbir referans/eşleşme
// yoksa (o gün kimsenin rotası yok, ya da hiç aynı ilçede iş yok) null döner
// — randevu eskisi gibi "pending" kalıp dispatcher'ın elle müdahalesini bekler.
function pickNearestTechnicianId(problem, referencePoints) {
  if (referencePoints.length === 0) return null;
  if (problem.lat != null && problem.lng != null) {
    let bestId = null;
    let bestDist = Infinity;
    for (const ref of referencePoints) {
      const d = haversineDistance(problem, ref);
      if (d < bestDist) {
        bestDist = d;
        bestId = ref.technicianId;
      }
    }
    return bestId;
  }
  const ilce = problem.addressDetail?.ilce?.trim().toLocaleUpperCase("tr");
  if (!ilce) return null;
  const match = referencePoints.find(
    (ref) => ref.addressDetail?.ilce?.trim().toLocaleUpperCase("tr") === ilce
  );
  return match ? match.technicianId : null;
}

// Geocoding artık randevu kaydını BEKLETMİYOR (bkz. addAppointment/
// updateAppointment) — kayıt önce lat/lng boş şekilde oluşturulur/güncellenir,
// bu fonksiyon arkaplanda (fire-and-forget) çalışıp sonucu ayrıca yazar. Bu
// güncelleme zaten var olan Supabase Realtime mekanizmasıyla tüm açık
// pencerelere otomatik yayılır — "Adres sorunları" uyarısı (bkz.
// src/lib/useHeaderAlerts.js, appointments.geocodeIssue'a bakıyor) ekstra
// hiçbir kod eklenmeden kendiliğinden güncellenir.
async function runBackgroundGeocode(appointmentId, addressDetail, googleMapsApiKey) {
  try {
    const attempts = buildGeocodeAttempts(addressDetail || {});
    if (attempts.length === 0) {
      await db.updateAppointment(appointmentId, {
        geocodeIssue: "Konum kontrolü gerekli — adres bilgisi (mahalle/ilçe) eksik.",
      });
      return;
    }
    const result = await geocodeAddress(null, googleMapsApiKey, attempts);
    if (result.ok) {
      const geocodeWarning = checkGeocodeQuality(result, addressDetail);
      await db.updateAppointment(appointmentId, {
        lat: result.lat,
        lng: result.lng,
        geocodeIssue: geocodeWarning,
      });
      // placeId/geocodePrecision opsiyonel kolonlar — SQL migrasyonu henüz
      // çalıştırılmamışsa bu tablo satırı hiç yoktur, o durumda sessizce
      // atlanır (asıl lat/lng/geocodeIssue güncellemesi zaten yukarıda
      // tamamlanmış oldu, bu ayrı/best-effort bir ek).
      if (result.placeId || result.locationType) {
        try {
          await db.updateAppointment(appointmentId, {
            placeId: result.placeId ?? null,
            geocodePrecision: result.locationType ?? null,
          });
        } catch {
          // kolonlar henüz eklenmemiş olabilir — yoksay
        }
      }
    } else {
      await db.updateAppointment(appointmentId, {
        geocodeIssue: "Konum kontrolü gerekli — adres bulunamadı, lütfen kontrol edin.",
      });
    }
  } catch (err) {
    // Arkaplan işi — kullanıcıya gösterecek bir yer yok, sadece logla ki
    // gerçek bir hata (ör. kod hatası) sessizce kaybolmasın.
    console.error("Arkaplan geocoding hatası:", err);
  }
}

export function listAppointments() {
  return db.getAppointments();
}

export async function addAppointment(input) {
  const { googleMapsApiKey, geminiApiKey } = await currentApiKeys();

  const estimatedDurationMinutes = await estimateJobDurationMinutes(
    input.complaint,
    geminiApiKey
  );

  // Dispatcher oluştururken bilerek bir teknisyen seçtiyse (ör. bilgi zaten
  // o teknisyen üzerinden geldiyse), randevu doğrudan ona atanmış olarak
  // oluşturulur ve `manuallyAssigned` ile otomatik rotalama (buildRoutes)
  // havuzunun dışında tutulur — reassignAppointment'taki aynı
  // doğrulama/sıra numarası deseni burada da uygulanır.
  let status = "pending";
  let assignedTechnicianId = null;
  let stopOrder = null;
  let manuallyAssigned = false;

  if (input.assignedTechnicianId) {
    const technicians = await db.getTechnicians();
    const technician = technicians.find((t) => t.id === input.assignedTechnicianId);
    if (!technician) throw new Error("Teknisyen bulunamadı");
    if (technician.assignable === false) {
      throw new Error(`${technician.name} adlı çalışana iş atanamaz ("İş Atanabilir" işaretli değil).`);
    }
    if (isOnLeave(technician, input.scheduledDate)) {
      throw new Error(`${technician.name}, ${input.scheduledDate} tarihinde izinli — randevu atanamaz.`);
    }

    const siblings = await db.getRoutedStopOrders(technician.id, input.scheduledDate);
    const maxOrder = siblings.reduce((max, a) => Math.max(max, a.stopOrder ?? -1), -1);

    status = "routed";
    assignedTechnicianId = technician.id;
    stopOrder = maxOrder + 1;
    manuallyAssigned = true;
  }

  const appointment = await db.addAppointment({
    ...input,
    lat: null,
    lng: null,
    geocodeIssue: null,
    estimatedDurationMinutes,
    status,
    assignedTechnicianId,
    stopOrder,
    manuallyAssigned,
  });

  // Kayıt zaten oluşturuldu — geocoding'in bitmesini BEKLEMEDEN dönüyoruz.
  // Sonuç (bulunsa da bulunamasa da) arkaplanda appointments satırına
  // yazılır ve mevcut realtime akışıyla tüm ekranlara kendiliğinden yayılır.
  if (googleMapsApiKey) {
    runBackgroundGeocode(appointment.id, input.addressDetail, googleMapsApiKey);
  }

  return { appointment, geocodeError: null, geocodeWarning: null };
}

export async function updateAppointment(id, patch) {
  const { googleMapsApiKey, geminiApiKey } = await currentApiKeys();
  const existing = await db.getAppointmentById(id);
  const finalPatch = { ...patch };

  // AppointmentForm.jsx her kaydetmede TÜM alanları (dolayısıyla address'i
  // de) gönderir — kullanıcı sadece bir ücret/not eklemiş olsa bile. Bu
  // yüzden "adres alanı dolu mu" değil, "adres GERÇEKTEN değişti mi" bakılır;
  // yoksa her kayıtta gereksiz yere yeniden geocode edilir VE (aşağıda)
  // teknisyen ataması/rota boşuna sıfırlanır.
  const addressChanged = patch.address && patch.address !== existing?.address;
  const scheduleChanged = patch.scheduledDate && patch.scheduledDate !== existing?.scheduledDate;

  if (patch.complaint !== undefined) {
    finalPatch.estimatedDurationMinutes = await estimateJobDurationMinutes(
      patch.complaint,
      geminiApiKey
    );
  }

  // Not: adres ya da tarih değişse bile durum/teknisyen ataması/rota sırası
  // artık OTOMATİK sıfırlanmıyor — kullanıcı isteği üzerine kaldırıldı,
  // randevu en son ne durumdaysa (ör. "routed"/"completed") düzenlemeden
  // sonra da öyle kalıyor. Adres büyük ölçüde değiştiyse rotanın artık
  // coğrafi olarak anlamlı olmayabileceğini unutmayın — gerekirse dispatcher
  // aşağıdaki teknisyen seçimini elle değiştirip yeniden atayabilir.

  // Dispatcher düzenleme formunda teknisyen seçimini değiştirdiyse (yeni
  // bir teknisyen seçti ya da "Otomatik rota" ile temizledi) — addAppointment
  // ile aynı doğrulama/sıra numarası deseni burada da uygulanır.
  const technicianSelectionChanged =
    patch.assignedTechnicianId !== undefined && patch.assignedTechnicianId !== (existing?.assignedTechnicianId || null);

  if (technicianSelectionChanged) {
    if (patch.assignedTechnicianId) {
      const technicians = await db.getTechnicians();
      const technician = technicians.find((t) => t.id === patch.assignedTechnicianId);
      if (!technician) throw new Error("Teknisyen bulunamadı");
      if (technician.assignable === false) {
        throw new Error(`${technician.name} adlı çalışana iş atanamaz ("İş Atanabilir" işaretli değil).`);
      }
      const targetDate = finalPatch.scheduledDate || existing?.scheduledDate;
      if (isOnLeave(technician, targetDate)) {
        throw new Error(`${technician.name}, ${targetDate} tarihinde izinli — randevu atanamaz.`);
      }

      const siblings = (await db.getRoutedStopOrders(technician.id, targetDate)).filter((a) => a.id !== id);
      const maxOrder = siblings.reduce((max, a) => Math.max(max, a.stopOrder ?? -1), -1);

      finalPatch.status = "routed";
      finalPatch.stopOrder = maxOrder + 1;
      finalPatch.manuallyAssigned = true;
    } else {
      // Dispatcher "Otomatik rota" seçti — mevcut atamaya (status/
      // assignedTechnicianId/stopOrder) DOKUNMADAN sadece elle-atama
      // bayrağını kaldırıyoruz ki bir sonraki buildRoutes çalıştırmasında
      // normal şekilde yeniden dağıtılabilsin. Adres/tarih AYRICA
      // değiştiyse bu, dispatcher'ın "atamayı bilerek boşalt" isteğidir —
      // o durumda assignedTechnicianId'yi patch'te bırakıp gerçekten
      // temizliyoruz.
      if (!addressChanged && !scheduleChanged) {
        delete finalPatch.assignedTechnicianId;
      }
      finalPatch.manuallyAssigned = false;
    }
  }

  const appointment = await db.updateAppointment(id, finalPatch);
  await db.logActivity(patch.actingUserId, "appointment", `randevu bilgilerini güncelledi: ${appointment.customerName}`);

  // Adres değiştiyse, geocoding'i beklemeden dönüyoruz — eski konum
  // (varsa) arkaplan sonucu gelene kadar ekranda kalır, kayıt engellenmez.
  if (addressChanged && googleMapsApiKey) {
    runBackgroundGeocode(id, patch.addressDetail, googleMapsApiKey);
  }

  return { appointment, geocodeError: null, geocodeWarning: null };
}

export function deleteAppointment(id, actingUserId) {
  return db.deleteAppointment(id, actingUserId);
}

export function listPendingParts() {
  return db.getPendingParts();
}

export function addPendingPart(input) {
  return db.addPendingPart(input);
}

export function updatePendingPart(id, patch) {
  return db.updatePendingPart(id, patch);
}

export function deletePendingPart(id, actingUserId) {
  return db.deletePendingPart(id, actingUserId);
}

export function markPendingPartReminderSent(id, userId) {
  return db.markPendingPartReminderSent(id, userId);
}

export function listPartCheckouts() {
  return db.getPartCheckouts();
}

export function addPartCheckout(input) {
  return db.addPartCheckout(input);
}

export function reconcilePartCheckout(id, patch) {
  return db.reconcilePartCheckout(id, patch);
}

export function updatePartCheckout(id, patch) {
  return db.updatePartCheckout(id, patch);
}

export function deletePartCheckout(id, actingUserId) {
  return db.deletePartCheckout(id, actingUserId);
}

const STATUS_LABELS_TR = {
  pending: "Bekliyor",
  routed: "Rotalandı",
  completed: "Tamamlandı",
  cancelled: "İptal Edildi",
};

export async function setAppointmentStatus(id, status, actingUserId) {
  const appointment = await db.updateAppointment(id, { status, actingUserId });
  await db.logActivity(
    actingUserId,
    "appointment",
    `randevu durumunu değiştirdi: ${STATUS_LABELS_TR[status] || status} (${appointment.customerName})`
  );
  return appointment;
}

export async function reassignAppointment(id, technicianId, actingUserId) {
  // ÖNEMLİ: burada bilerek db.getAppointments() (tüm ~20 bin+ randevuyu
  // sayfalayarak çeken fonksiyon) KULLANILMIYOR — sadece tek bir randevuyu
  // bulmak ve bir teknisyenin bir gündeki sıradaki son durağını hesaplamak
  // için tüm tabloyu çekmek her atama değişikliğini birkaç saniyeye
  // uzatıyordu; kullanıcı işlemin başarısız olduğunu sanıp aynı teknisyeni
  // tekrar tekrar seçiyordu. Bunun yerine tek randevuyu id'den, "kardeş"
  // durakları da sunucu tarafında filtrelenmiş küçük bir sorguyla çekiyoruz.
  const appointment = await db.getAppointmentById(id);
  if (!appointment) throw new Error("Randevu bulunamadı");

  // Arayüzdeki dropdown zaten izinli/atanamaz teknisyenleri gizliyor, ama
  // bu kontrol SADECE orada olursa başka bir yoldan (ör. eski/stale bir
  // ekran durumu) bu kısıtlama atlanabilir — o yüzden asıl garanti burada,
  // sunucu tarafında olmalı.
  const technicians = await db.getTechnicians();
  const technician = technicians.find((t) => t.id === technicianId);
  if (!technician) throw new Error("Teknisyen bulunamadı");
  if (technician.assignable === false) {
    throw new Error(`${technician.name} adlı çalışana iş atanamaz ("İş Atanabilir" işaretli değil).`);
  }
  if (isOnLeave(technician, appointment.scheduledDate)) {
    throw new Error(`${technician.name}, ${appointment.scheduledDate} tarihinde izinli — randevu atanamaz.`);
  }

  const siblings = await db.getRoutedStopOrders(technicianId, appointment.scheduledDate);
  const maxOrder = siblings.reduce((max, a) => Math.max(max, a.stopOrder ?? -1), -1);

  const updated = await db.updateAppointment(id, {
    assignedTechnicianId: technicianId,
    stopOrder: maxOrder + 1,
    status: "routed",
    // Dispatcher elle yeniden atadı — daha önce "izinde beklet"
    // işaretlenmişse bu bayrak artık geçersiz.
    heldForLeave: false,
    actingUserId,
  });

  await db.logActivity(
    actingUserId,
    "appointment",
    `randevuyu ${technician?.name || "bir teknisyene"} adlı teknisyene atadı: ${appointment.customerName}`
  );
  return updated;
}

// Dispatcher, izinli bir teknisyene zaten atanmış bir randevuyu bilerek o
// teknisyende bırakmayı ("beklet") seçtiğinde çağrılır. Randevu, teknisyen
// izinden dönene kadar otomatik rota dağıtımına dahil edilmez; dönünce de
// Anasayfa'daki hatırlatma widget'ında tekrar görünür.
export async function holdAppointmentForLeave(id, actingUserId) {
  const updated = await db.updateAppointment(id, { heldForLeave: true, actingUserId });
  await db.logActivity(
    actingUserId,
    "appointment",
    `randevuyu teknisyen izinden dönene kadar beklemeye aldı: ${updated.customerName}`
  );
  return updated;
}

export function listTechnicians() {
  return db.getTechnicians();
}

export function setTechnicians(list, actingUserId) {
  return db.setTechnicians(list, actingUserId);
}

export function exportAllTables() {
  return db.exportAllTables();
}

export function getScreensaverImage() {
  return getRandomFeaturedImage();
}

export function listOfficeStaff() {
  return db.getOfficeStaff();
}

export function setOfficeStaff(list, actingUserId) {
  return db.setOfficeStaff(list, actingUserId);
}

export function listHolidays() {
  return db.getHolidays();
}

export function setHolidays(list, actingUserId) {
  return db.setHolidays(list, actingUserId);
}

export function listVehicles() {
  return db.getVehicles();
}

export function setVehicles(list, actingUserId) {
  return db.setVehicles(list, actingUserId);
}

// API anahtarları burada döndüğü için (Gemini/Filotim dahil) SADECE admin
// çağırabilir — canlı trafik haritası gibi tek bir anahtara ihtiyaç duyan
// admin-olmayan akışlar bunun yerine getGoogleMapsApiKeyForClient()
// kullanır (bkz. o fonksiyonun üstündeki not).
export async function getSettings(actingUserId) {
  await db.requireAdmin(actingUserId, "Ayarları görüntüleme");
  const [settings, apiKeys] = await Promise.all([db.getSettings(), currentApiKeys()]);
  return { ...settings, ...apiKeys };
}

export async function updateSettings(patch, actingUserId) {
  await db.requireAdmin(actingUserId, "Ayarları güncelleme");
  await db.updateSettings(patch, actingUserId);
  return getSettings(actingUserId);
}

export async function buildRoutes(scheduledDate, actingUserId) {
  const { googleMapsApiKey } = await currentApiKeys();
  if (!googleMapsApiKey) {
    throw new Error("Google Maps API anahtarı tanımlı değil (Ayarlar > API Anahtarları).");
  }

  const allTechnicians = await db.getTechnicians();
  const technicians = allTechnicians.filter((t) => !isOnLeave(t, scheduledDate) && t.assignable !== false);
  const shopCoord = SHOP_LOCATION;

  const allAppointments = await db.getAppointments();

  // Tamamlanmamış (pending + routed) tüm işleri baştan dengeli dağıtmak için
  // havuza alıyoruz; "completed" ve "cancelled" işaretli işler dokunulmadan
  // kalır (iptal edilen bir işe teknisyen gönderilmemeli).
  const todaysAppointments = allAppointments.filter(
    (a) => a.scheduledDate === scheduledDate && a.status !== "completed" && a.status !== "cancelled"
  );
  // Geocoding artık randevu kaydedilirken arkaplanda (asenkron) çalışıyor
  // (bkz. runBackgroundGeocode) — normalde birkaç saniye içinde biter, ama
  // bir randevu eklenip HEMEN ardından "Rota Oluştur"a basılırsa, o iş henüz
  // konumsuz (lat: null) olabilir ve adres tamamen doğru olsa bile
  // yanlışlıkla "atlandı" listesine düşerdi. Bunu önlemek için, rota
  // hesaplamadan hemen önce konumu hâlâ boş olanlar için tek seferlik bir
  // "yakalama" denemesi yapılır — çoğu zaman (geocoding zaten bitmiş
  // olacağı için) burada yapılacak bir şey çıkmaz, ekstra gecikme olmaz.
  const stillMissingLocation = todaysAppointments.filter((a) => a.lat == null && !a.geocodeIssue);
  if (stillMissingLocation.length > 0) {
    await Promise.all(
      stillMissingLocation.map(async (a) => {
        const attempts = buildGeocodeAttempts(a.addressDetail || {});
        if (attempts.length === 0) return;
        const result = await geocodeAddress(null, googleMapsApiKey, attempts);
        if (result.ok) {
          const geocodeWarning = checkGeocodeQuality(result, a.addressDetail);
          await db.updateAppointment(a.id, { lat: result.lat, lng: result.lng, geocodeIssue: geocodeWarning });
          a.lat = result.lat;
          a.lng = result.lng;
          a.geocodeIssue = geocodeWarning;
        }
      })
    );
  }

  // "İzinde beklet" denilen işler (heldForLeave) yeniden dağıtım
  // havuzuna hiç girmez — dispatcher bilerek o teknisyende bırakmıştı.
  // manuallyAssigned işler de girmez — randevu OLUŞTURULURKEN bilerek belirli
  // bir teknisyene sabitlenmiş, otomatik rotalama bunu değiştirmemeli.
  const pending = todaysAppointments.filter(
    (a) => a.lat != null && !a.geocodeIssue && !a.heldForLeave && !a.manuallyAssigned
  );
  // Adresi hiç bulunamamış (lat==null) VEYA güvenilirliği şüpheli
  // (geocodeIssue — Google'ın yanlış ilçede bulduğu ya da sadece kaba/mahalle
  // merkezi bir tahmin yaptığı adresler) randevular açı/kümeleme hesabına HİÇ
  // dahil edilmiyor — konumu güvenilir olmayan bir işi bu hesaba katmak, işi
  // (ve dolayısıyla teknisyeni) tamamen alakasız bir bölgeye savurabiliyordu.
  // Ama artık tamamen dışarıda da bırakılmıyorlar: aşağıda ana dağıtım/
  // sıralama bittikten SONRA, o gün gerçekten konumlanmış duraklardan
  // coğrafi olarak en yakınının teknisyenine "ekstra durak" olarak
  // iliştiriliyorlar (bkz. pickNearestTechnicianId) — geocodeIssue alanı
  // silinmiyor, dispatcher hangi durağın konumunun doğrulanması gerektiğini
  // rota içinde de görüyor. Hiçbir referans/eşleşme yoksa (o gün kimsenin
  // rotası yoksa, ya da konumu tamamen yoksa ve aynı ilçede iş de yoksa)
  // eskisi gibi "pending" kalıp dispatcher'ın elle müdahalesini bekler.
  const geocodeProblem = todaysAppointments.filter(
    (a) => (a.lat == null || a.geocodeIssue) && !a.heldForLeave && !a.manuallyAssigned
  );
  // heldForLeave/manuallyAssigned işler zaten sabit bir teknisyene bağlı ve
  // güvenilir bir konuma sahipse (kendileri de bir geocodeIssue TAŞIMIYORSA),
  // bunlar da referencePoints'e katkı sağlamalı — dispatcher'ın elle attığı
  // ya da izinde beklettiği bir iş de o bölgede "gerçek" bir referans.
  const alreadyFixedWithLocation = todaysAppointments.filter(
    (a) => (a.heldForLeave || a.manuallyAssigned) && a.lat != null && !a.geocodeIssue && a.assignedTechnicianId
  );

  // Tamamlanmış işler sabit kalıp sıra numaralarını korur; yeni rotalanan
  // işler onların ARDINDAN numaralanmalı, yoksa aynı teknisyende iki iş
  // aynı sıra numarasını (örn. ikisi de "1") alabilir.
  const completedToday = allAppointments.filter(
    (a) => a.scheduledDate === scheduledDate && a.status === "completed"
  );

  const buckets = assignToTechnicians(pending, technicians, shopCoord);

  const results = [];
  const nextStopOrder = new Map();
  const referencePoints = [];
  for (let i = 0; i < technicians.length; i++) {
    const technician = technicians[i];
    const completedCount = completedToday.filter(
      (a) => a.assignedTechnicianId === technician.id
    ).length;

    const ordered = await orderTechnicianStops(buckets[i], shopCoord, googleMapsApiKey);

    for (let j = 0; j < ordered.length; j++) {
      const stopOrder = completedCount + j;
      await db.updateAppointment(ordered[j].id, {
        status: "routed",
        assignedTechnicianId: technician.id,
        stopOrder,
        actingUserId,
      });
    }

    const stops = ordered.map((s, idx) => ({ ...s, stopOrder: completedCount + idx }));
    results.push({ technician, stops });
    nextStopOrder.set(technician.id, completedCount + stops.length);
    for (const s of stops) {
      referencePoints.push({ technicianId: technician.id, lat: s.lat, lng: s.lng, addressDetail: s.addressDetail });
    }
  }
  for (const a of completedToday) {
    if (a.lat != null && a.assignedTechnicianId) {
      referencePoints.push({ technicianId: a.assignedTechnicianId, lat: a.lat, lng: a.lng, addressDetail: a.addressDetail });
    }
  }
  for (const a of alreadyFixedWithLocation) {
    referencePoints.push({ technicianId: a.assignedTechnicianId, lat: a.lat, lng: a.lng, addressDetail: a.addressDetail });
  }

  const stillUnassigned = [];
  for (const problem of geocodeProblem) {
    const technicianId = pickNearestTechnicianId(problem, referencePoints);
    if (!technicianId) {
      stillUnassigned.push(problem);
      continue;
    }
    const stopOrder = nextStopOrder.get(technicianId) ?? 0;
    nextStopOrder.set(technicianId, stopOrder + 1);
    await db.updateAppointment(problem.id, {
      status: "routed",
      assignedTechnicianId: technicianId,
      stopOrder,
      actingUserId,
    });
    const result = results.find((r) => r.technician.id === technicianId);
    result?.stops.push({ ...problem, assignedTechnicianId: technicianId, status: "routed", stopOrder });
    if (problem.lat != null) {
      referencePoints.push({ technicianId, lat: problem.lat, lng: problem.lng, addressDetail: problem.addressDetail });
    }
  }

  const routedCount = pending.length + (geocodeProblem.length - stillUnassigned.length);
  if (routedCount > 0) {
    await db.logActivity(actingUserId, "appointment", `rota oluşturdu: ${scheduledDate}, ${routedCount} randevu`);
  }

  return {
    routes: results,
    skippedCount: stillUnassigned.length,
    skippedCustomers: stillUnassigned.map((a) => a.customerName),
  };
}

export function getShopLocation() {
  return SHOP_LOCATION;
}

// Anasayfadaki "Satış" popup'ı — deductedFromStock true ise, satılan her
// kalem için stok miktarı düşülür (IncomingOrderForm.jsx'teki deductFromStock
// ile AYNI oku-değiştir-yaz deseni, atomik değil — bu küçük, tek-ofis bir
// araç için mevcut kabul edilmiş risk düzeyi). false ise stoğa hiç
// dokunulmadan sadece satış kaydı tutulur (dispatcher "gerçekleşti ama
// stoktan düşmeyelim" dediğinde).
export async function addSale(input) {
  if (input.deductedFromStock) {
    for (const item of input.items) {
      if (!item.stockItemId) continue;
      const stockItem = await db.getStockItemById(item.stockItemId);
      if (!stockItem) continue;
      const newQty = Math.max(0, Number(stockItem.quantity) - Number(item.qty));
      await db.updateStockItem(item.stockItemId, { quantity: newQty }, input.actingUserId);
    }
  }
  return db.addSale(input);
}

// Harita sekmesindeki Google Maps (canlı trafik) görünümü için — SADECE bu
// anahtar döner, currentApiKeys()'in döndürdüğü diğer anahtarlar (Gemini vb.)
// dahil edilmez ve admin olmayan kullanıcılar da çağırabilir (App.jsx'teki
// "settings" state'i hâlâ sadece admin'e özel kalıyor, bkz. o dosyadaki not).
export async function getGoogleMapsApiKeyForClient() {
  const { googleMapsApiKey } = await currentApiKeys();
  return googleMapsApiKey;
}

// Hareketsizlik ekran koruyucusu (bkz. App.jsx'teki idle-lock efekti) TÜM
// giriş yapmış kullanıcılarda çalışmalı, sadece admin oturumunda değil —
// ama tam `settings` (API anahtarları dahil) sadece admin'e özel. Bu yüzden
// getGoogleMapsApiKeyForClient ile AYNI desen: sadece bu iki alanı, hassas
// olmayan haliyle, herkese açık döndürüyoruz.
export async function getIdleLockConfig() {
  const settings = await db.getSettings();
  return {
    // "settings" tablosu her değeri metin olarak saklıyor (bkz. db.js
    // updateSettings) — bu yüzden false bile geri "false" string'i olarak
    // gelir ve Boolean("false") === true olurdu. Sadece gerçek boolean
    // true/gerçek string "true" ise etkin sayılır.
    idleLockEnabled: settings.idleLockEnabled === true || settings.idleLockEnabled === "true",
    idleTimeoutMinutes: Number(settings.idleTimeoutMinutes) || 5,
  };
}

export function getMapUsageCount() {
  return db.getMapUsageCount();
}

export function incrementMapUsageCount() {
  return db.incrementMapUsageCount();
}

// Filotim (akaryakıt kartı) senkronizasyonu — API'den TÜM işlem geçmişini,
// araç/kart limit-kullanım durumunu ve filo hesap özetini çekip yazar.
// İşlem geçmişi kendi id'lerine göre upsert edilir (kayıt sayısı küçük
// kaldığı sürece — bugün ~9 araç/766 işlem — artımlı senkron karmaşıklığına
// gerek yok; aynı işlem tekrar geldiğinde üzerine yazar, yinelenmez). Limit
// durumu ise ANLIK bir görüntü olduğu için her seferinde tamamen yenilenir.
export async function syncFuelTransactions(actingUserId) {
  const { filotimApiKey } = await currentApiKeys();
  if (!filotimApiKey) {
    throw new Error("Filotim API anahtarı ayarlanmamış.");
  }
  const transactions = await fetchFuelPurchases(filotimApiKey);
  const { count } = await db.upsertFuelTransactions(transactions);
  const devices = await fetchFuelDevices(filotimApiKey);
  await db.replaceFuelDevices(devices);
  const fleetSummary = await fetchFleetSummary(filotimApiKey);
  const syncedAt = new Date().toISOString();
  await db.updateSettings(
    {
      filotimLastSyncAt: syncedAt,
      filotimFleetSummary: fleetSummary ? JSON.stringify(fleetSummary) : null,
    },
    actingUserId
  );
  return { count, syncedAt };
}

export function listFuelTransactions() {
  return db.getFuelTransactions();
}

export function listFuelDevices() {
  return db.getFuelDevices();
}

// Uygulama her açıldığında bir kez, ama günde bir defadan fazla değil —
// dispatcher'ın "Şimdi Senkronize Et" butonuna hiç basmasa bile veri
// tamamen güncel olmasa da makul ölçüde taze kalsın diye (bkz. main.js
// app.whenReady). Hata olursa (ör. anahtar henüz girilmemiş) sessizce
// loglanır, uygulama açılışını ASLA engellemez.
export async function maybeAutoSyncFuelTransactions() {
  try {
    const settings = await db.getSettings();
    const today = new Date().toISOString().slice(0, 10);
    const lastSyncDay = settings.filotimLastSyncAt ? settings.filotimLastSyncAt.slice(0, 10) : null;
    if (lastSyncDay === today) return;
    await syncFuelTransactions(null);
  } catch (err) {
    console.error("Filotim otomatik senkronizasyonu başarısız:", err.message);
  }
}

export function listSuppliers() {
  return db.getSuppliers();
}

export function setSuppliers(list, actingUserId) {
  return db.setSuppliers(list, actingUserId);
}

export function getCameraSettings() {
  return db.getCameraListSettings();
}

export function updateCameraSettings(list, actingUserId) {
  return db.setCameraList(list, actingUserId);
}

export function listDepots() {
  return db.getDepots();
}

export function setDepots(list, actingUserId) {
  return db.setDepots(list, actingUserId);
}

export function listStockItems() {
  return db.getStockItems();
}

export function setStockItems(list, actingUserId) {
  return db.setStockItems(list, actingUserId);
}

export function addStockItem(item, actingUserId) {
  return db.addStockItem(item, actingUserId);
}

export function updateStockItem(id, patch, actingUserId) {
  return db.updateStockItem(id, patch, actingUserId);
}

export function deleteStockItem(id, actingUserId) {
  return db.deleteStockItemRow(id, actingUserId);
}

export function listUsers() {
  return db.getUsers();
}

export function addUser(name, password, role, hiddenTabs, settingsSections, actingUserId) {
  return db.addUser({ name, password, role, hiddenTabs, settingsSections, actingUserId });
}

export function updateUser(id, patch, actingUserId) {
  return db.updateUser(id, { ...patch, actingUserId });
}

export function deleteUser(id, actingUserId) {
  return db.deleteUser(id, actingUserId);
}

export function login(name, password) {
  return db.verifyLogin(name, password);
}

export function listQuotes() {
  return db.getQuotes();
}

export function addQuote(input) {
  return db.addQuote(input);
}

export function updateQuote(id, patch) {
  return db.updateQuote(id, patch);
}

export function deleteQuote(id, actingUserId) {
  return db.deleteQuote(id, actingUserId);
}

export function listIncomingOrders() {
  return db.getIncomingOrders();
}

export function addIncomingOrder(input) {
  return db.addIncomingOrder(input);
}

export function updateIncomingOrder(id, patch) {
  return db.updateIncomingOrder(id, patch);
}

export function deleteIncomingOrder(id, actingUserId) {
  return db.deleteIncomingOrder(id, actingUserId);
}

export function markIncomingOrderReminderNotified(id, userId) {
  return db.markIncomingOrderReminderNotified(id, userId);
}

export function dismissIncomingOrderReminder(id, userId) {
  return db.dismissIncomingOrderReminder(id, userId);
}

export function listActivityLog(opts, actingUserId) {
  return db.getActivityLog(opts, actingUserId);
}

export function listMessagesFor(userId) {
  return db.getMessagesFor(userId);
}

export function sendMessage(senderId, recipientId, body) {
  return db.sendMessage(senderId, recipientId, body);
}

export function markMessagesRead(currentUserId, otherUserId) {
  return db.markMessagesRead(currentUserId, otherUserId);
}

export function deleteMessage(id, actingUserId) {
  return db.deleteMessage(id, actingUserId);
}
