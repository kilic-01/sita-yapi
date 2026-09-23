import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { v4 as uuid } from "uuid";
import { SUPABASE_URL, SUPABASE_SERVICE_KEY } from "./config.js";
import { hashPassword, verifyPassword } from "./auth.js";

// Electron'un Ana Süreci (main process) daha eski bir Node.js sürümü
// paketler ve global bir "WebSocket" tanımlamaz — Supabase Realtime (anlık
// değişiklik akışı) buna ihtiyaç duyuyor. "ws" paketiyle dolduruyoruz.
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}

let supabase;
let onChangeCallback = null;
let onSyncStatusCallback = null;

// `userDataPath` artık kullanılmıyor (veri yerel dosya yerine Supabase'de
// tutuluyor) — main.js/server/index.js ile aynı çağrı imzasını korumak için
// parametre olarak duruyor.
export async function initDb(_userDataPath) {
  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  subscribeToRealtime();
}

// Herhangi bir tabloda (başka bir bilgisayardan dahil) değişiklik olduğunda
// çağrılacak fonksiyonu kaydeder — main.js bunu renderer'a iletmek için kullanır.
export function onChange(callback) {
  onChangeCallback = callback;
}

// Realtime kanalının bağlantı durumu değiştiğinde ("SUBSCRIBED",
// "TIMED_OUT", "CHANNEL_ERROR", "CLOSED") çağrılacak fonksiyonu kaydeder —
// header'daki bağlantı göstergesi (bkz. src/components/Header.jsx) için.
export function onSyncStatusChange(callback) {
  onSyncStatusCallback = callback;
}

const REALTIME_TABLES = [
  "appointments",
  "technicians",
  "officeStaff",
  "holidays",
  "vehicles",
  "suppliers",
  "depots",
  "stockItems",
  "settings",
  "users",
  "quotes",
  "messages",
  "activityLog",
  "incomingOrders",
  "pendingParts",
  "partCheckouts",
];

let realtimeChannel = null;
let reconnectTimer = null;

// Supabase Realtime kanalının kendi "rejoin" mekanizması (Phoenix
// kanallarının standart davranışı) var, ama pratikte laptop uyku/uyanma,
// ofis Wi-Fi'ının kısa kesintileri ya da NAT/firewall'ın boşta duran bir
// TCP bağlantısını sessizce düşürmesi gibi durumlarda bu kendi kendine
// toparlanma ya ÇOK GEÇ tetikleniyor ya da hiç tetiklenmiyor — dispatcher
// diğer bilgisayarlarda yeni/değişen randevuları göremeyip elle "reload"
// atmak zorunda kalıyordu (bkz. Header.jsx'teki "Bağlantı sorunu — yeniden
// deneniyor" göstergesi: UI zaten otomatik toparlanmayı VAAT EDİYORDU ama
// bunu gerçekten yapan kod hiç yoktu). Bu yüzden durum CHANNEL_ERROR/
// TIMED_OUT/CLOSED olduğunda kütüphaneyi beklemek yerine kanalı KENDİMİZ
// birkaç saniye sonra sıfırdan kurup yeniden abone oluyoruz.
function subscribeToRealtime() {
  clearTimeout(reconnectTimer);
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel);
  }
  const channel = supabase.channel("db-changes");
  for (const table of REALTIME_TABLES) {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
      onChangeCallback?.(table);
    });
  }
  channel.subscribe((status) => {
    onSyncStatusCallback?.(status);
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      reconnectTimer = setTimeout(subscribeToRealtime, 5000);
    }
  });
  realtimeChannel = channel;
}

// Sistem uykudan uyandığında (ör. laptop kapağı açıldığında) mevcut
// WebSocket bağlantısı sunucu tarafında çoktan zaman aşımına uğramış
// olabilir ama işletim sistemi bunu henüz "kapandı" olarak bildirmemiş
// olabilir — bu durumda yukarıdaki hata tabanlı otomatik yeniden bağlanma
// hiç tetiklenmeyebilir. main.js'teki powerMonitor "resume" olayı bunu
// beklemeden bağlantıyı hemen tazeler.
export function forceReconnectRealtime() {
  if (supabase) subscribeToRealtime();
}

// Ayarlar > Güvenlik'teki "Tüm Veriyi Yedekle" butonu için — Supabase
// Pro'nun kendi otomatik günlük yedeğine EK olarak, admin'in istediği an
// kendi bilgisayarına indirebileceği bir anlık görüntü. Şifre/hassas alan
// içeren tablolar (users, suppliers) burada da diğer public API'lerdeki
// gibi temizlenmiş haliyle döner — getUsers()/getSuppliers() zaten bunu
// yapıyor, diğer tablolar için ham selectAll yeterli.
export async function exportAllTables(actingUserId) {
  await requireAdmin(actingUserId, "Tüm veriyi yedekleme");
  const tables = {};
  for (const table of REALTIME_TABLES) {
    if (table === "users") {
      tables[table] = await getUsers();
    } else if (table === "suppliers") {
      tables[table] = await getSuppliers();
    } else {
      tables[table] = await selectAll(table);
    }
  }
  return { exportedAt: new Date().toISOString(), tables };
}

// ---------- Yardımcılar ----------

// Supabase/PostgREST, açık bir .range() verilmezse tek sorguda en fazla
// "db-max-rows" (varsayılan 1000) satır döndürür — üstü sessizce kırpılır,
// hata FIRLATMAZ. stockItems tablosu 1000'i aştığında bu yüzden listenin
// büyük kısmı uygulamada hiç görünmüyordu. Tüm satırları almak için
// sayfa sayfa (PAGE_SIZE'lık bloklar halinde) çekip birleştiriyoruz.
const PAGE_SIZE = 1000;

async function selectAll(table, orderBy) {
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select("*").range(from, from + PAGE_SIZE - 1);
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

// "Tüm listeyi gönder" deseni (teknisyen/araç/tedarikçi/depo listeleri gibi
// hep küçük kalan koleksiyonlar için) — gelen listede olmayan kayıtları
// siler, geri kalanını upsert eder. lowdb'deki "db.data.X = list" davranışının
// aynısı.
async function replaceTable(table, list) {
  // selectAll() sayfalama yapar — 1000 satırı aşan tablolarda (ör.
  // stockItems) doğrudan .select("id") kullanmak PostgREST'in varsayılan
  // satır limitine takılıp mevcut id kümesini eksik döndürürdü, bu da
  // artık kullanılmayan eski kayıtların silinmemesine yol açardı.
  const existing = await selectAll(table);
  const existingIds = new Set(existing.map((r) => r.id));
  const newIds = new Set(list.map((r) => r.id));
  const toDelete = [...existingIds].filter((id) => !newIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }
  if (list.length) {
    const { error } = await supabase.from(table).upsert(list, { onConflict: "id" });
    if (error) throw new Error(error.message);
  }
  return selectAll(table);
}

function stampCreatedPatch(actingUserId) {
  return {
    createdBy: actingUserId || null,
    createdAt: new Date().toISOString(),
    updatedBy: null,
    updatedAt: null,
  };
}

function stampUpdatedPatch(actingUserId) {
  return actingUserId
    ? { updatedBy: actingUserId, updatedAt: new Date().toISOString() }
    : {};
}

// ---------- Aktivite Kaydı ----------

async function actorDisplayName(actorUserId) {
  if (!actorUserId) return "Sistem";
  const { data } = await supabase.from("users").select("name").eq("id", actorUserId).maybeSingle();
  return data?.name || "Bilinmeyen kullanıcı";
}

// Ayarlar sekmesindeki admin-only bölümlerin (Kullanıcılar, API Anahtarları,
// Güvenlik, Çalışanlar, Tatiller, Tedarikçiler, Aktivite Kaydı) arkasındaki
// yazma/okuma işlemleri için ortak yetki kontrolü — arayüzde buton
// gizlenmesi TEK BAŞINA bir güvenlik sınırı değil, çünkü preload'daki
// window.api.* fonksiyonları renderer'dan doğrudan çağrılabilir
// (deleteStockItemRow'daki mevcut desenle aynı, tek yerde toplanmış hali).
// PostgREST bir sütun bulunamadığında "Could not find the 'X' column of 'Y'
// in the schema cache" şeklinde bir hata döndürüyor — "settingsSections"
// gibi henüz SQL migrasyonu çalıştırılmamış opsiyonel sütunlar için bunu
// yakalayıp o alan olmadan tekrar denemek üzere kullanılıyor (bkz. addUser/
// updateUser). Böylece migrasyon çalıştırılana kadar özellik sessizce
// devre dışı kalır ama kullanıcı ekleme/güncelleme tamamen bloke olmaz.
function isMissingColumnError(error, columnName) {
  return Boolean(error?.message?.includes(`'${columnName}'`) && error.message.includes("schema cache"));
}

export async function requireAdmin(actingUserId, actionLabel) {
  const { data: actingUser } = await supabase
    .from("users")
    .select("role")
    .eq("id", actingUserId)
    .maybeSingle();
  if (actingUser?.role !== "admin") {
    throw new Error(`${actionLabel} yetkisi sadece yönetici hesaplarında.`);
  }
}

// Aksiyonu yapan kullanıcının GÜNCEL adını bulup tam cümleyi oluşturur ve
// "activityLog" tablosuna ekler. actionText SADECE fiil+nesne kısmıdır
// (örn. "randevu oluşturdu: Ahmet Yılmaz") — özne (kullanıcı adı) burada
// eklenir. Bu fonksiyonun başarısız olması asıl iş işlemini ASLA
// bozmamalı — hata burada yutulur, sadece konsola yazılır.
export async function logActivity(actorUserId, entityType, actionText) {
  try {
    const actorName = await actorDisplayName(actorUserId);
    const { error } = await supabase
      .from("activityLog")
      .insert({ actorUserId: actorUserId || null, entityType, description: `${actorName} ${actionText}` });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("Aktivite kaydı yazılamadı:", err);
  }
}

export async function getActivityLog({ limit = 200 } = {}, actingUserId) {
  await requireAdmin(actingUserId, "Aktivite kaydını görüntüleme");
  const { data, error } = await supabase
    .from("activityLog")
    .select("*")
    .order("createdAt", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

// ---------- Randevular ----------

export function getAppointments() {
  return selectAll("appointments");
}

export async function getAppointmentById(id) {
  const { data, error } = await supabase.from("appointments").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// reassignAppointment/updateAppointment'taki "bu teknisyenin o günkü sıradaki
// son durağı nedir" hesabı için — tablo 20 binin üzerinde satıra ulaştığında
// (bkz. selectAll'un neden sayfalama yaptığını açıklayan not) her atama
// değişikliğinde TÜM randevuları çekmek yerine sunucu tarafında filtrelenmiş,
// küçük (tek gün/tek teknisyen) bir sonuç istiyoruz.
export async function getRoutedStopOrders(technicianId, scheduledDate) {
  const { data, error } = await supabase
    .from("appointments")
    .select("id,stopOrder")
    .eq("assignedTechnicianId", technicianId)
    .eq("scheduledDate", scheduledDate)
    .eq("status", "routed");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function addAppointment(input) {
  const appointment = {
    id: uuid(),
    customerName: input.customerName,
    contactName: input.contactName || "",
    customerPhone: input.customerPhone || "",
    address: input.address,
    addressDetail: input.addressDetail || null,
    geocodeIssue: input.geocodeIssue || null,
    estimatedDurationMinutes: input.estimatedDurationMinutes ?? null,
    complaint: input.complaint || "",
    internalNote: input.internalNote || "",
    urgency: input.urgency === "acil" ? "acil" : "normal",
    scheduledDate: input.scheduledDate,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    status: input.status || "pending",
    assignedTechnicianId: input.assignedTechnicianId ?? null,
    stopOrder: input.stopOrder ?? null,
    manuallyAssigned: Boolean(input.manuallyAssigned),
    feeAmount: input.feeAmount != null && input.feeAmount !== "" ? Number(input.feeAmount) : null,
    feeItems: input.feeItems || [],
    feePaid: Boolean(input.feePaid),
    ...stampCreatedPatch(input.actingUserId),
  };
  const { data, error } = await supabase.from("appointments").insert(appointment).select().single();
  if (error) throw new Error(error.message);
  await logActivity(input.actingUserId, "appointment", `randevu oluşturdu: ${data.customerName}`);
  return data;
}

export async function updateAppointment(id, patch) {
  const { actingUserId, ...rest } = patch;
  const finalPatch = { ...rest, ...stampUpdatedPatch(actingUserId) };
  const { data, error } = await supabase
    .from("appointments")
    .update(finalPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message || "Randevu bulunamadı");
  return data;
}

export async function deleteAppointment(id, actingUserId) {
  const { data: existing } = await supabase
    .from("appointments")
    .select("customerName")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("appointments").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(actingUserId, "appointment", `randevu sildi: ${existing?.customerName || ""}`);
}

// ---------- Bekleyen Parçalar (müşteriye özel, fabrikadan sipariş edilen parçalar) ----------

// Belirli bir RANDEVUYA değil, MÜŞTERİYE bağlı (customerName + customerPhone)
// — aynı müşteri farklı ziyaretlerde birden çok kez parça bekleyebilir, ve
// parça bir ziyarette fark edilip sipariş edildikten sonra gelmesi haftalar
// sürebilir; bu yüzden tek bir randevu kaydına gömülmek yerine ayrı bir
// tabloda, Müşteri Profili popup'ından yönetiliyor.
export function getPendingParts() {
  return selectAll("pendingParts", "createdAt");
}

export async function addPendingPart(input) {
  const row = {
    id: uuid(),
    customerName: input.customerName,
    customerPhone: input.customerPhone || "",
    description: input.description,
    status: input.status || "bekleniyor",
    orderedAt: input.orderedAt || null,
    reminderIntervalDays:
      input.reminderIntervalDays != null && input.reminderIntervalDays !== ""
        ? Number(input.reminderIntervalDays)
        : null,
    reminderUserIds: input.reminderUserIds || [],
    reminderNote: input.reminderNote || "",
    reminderLastSentAt: {},
    ...stampCreatedPatch(input.actingUserId),
  };
  const { data, error } = await supabase.from("pendingParts").insert(row).select().single();
  if (error) throw new Error(error.message);
  await logActivity(input.actingUserId, "pendingPart", `bekleyen parça ekledi: ${data.description} (${data.customerName})`);
  return data;
}

export async function updatePendingPart(id, patch) {
  const { actingUserId, ...rest } = patch;
  const finalPatch = { ...rest, ...stampUpdatedPatch(actingUserId) };
  const { data, error } = await supabase
    .from("pendingParts")
    .update(finalPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("Bekleyen parça kaydı bulunamadı");
  await logActivity(actingUserId, "pendingPart", `bekleyen parçayı güncelledi: ${data.description} (${data.customerName})`);
  return data;
}

export async function deletePendingPart(id, actingUserId) {
  const { data: existing } = await supabase
    .from("pendingParts")
    .select("description, customerName")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("pendingParts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(
    actingUserId,
    "pendingPart",
    `bekleyen parçayı sildi: ${existing?.description || ""} (${existing?.customerName || ""})`
  );
}

// Hatırlatma dönem dönem (parça "Geldi" işaretlenene kadar) tekrarlandığı
// için, tek bir "gönderildi" tarihi yerine KULLANICI BAŞINA bir "son
// gönderilme" zamanı tutuluyor — birden fazla kullanıcı hatırlatılıyorsa,
// biri görüp işaretlediğinde diğerinin süresi sıfırlanmasın diye.
export async function markPendingPartReminderSent(id, userId) {
  const { data: existing, error: selErr } = await supabase
    .from("pendingParts")
    .select("reminderLastSentAt")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  const current = existing?.reminderLastSentAt || {};
  const { error } = await supabase
    .from("pendingParts")
    .update({ reminderLastSentAt: { ...current, [userId]: new Date().toISOString() } })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Yedek Parça Zimmeti (teknisyenlerin sabah aldığı parçalar) ----------

// pendingParts'tan farklı: müşteriye değil TEKNİSYENE ve GÜNE bağlı.
// NOT: şimdilik SADECE kayıt tutuyor (kim, ne zaman, ne aldı, mutabakatta
// ne kullanıldı/iade etti) — stok miktarını OTOMATİK düşürme/geri ekleme
// bilerek devre dışı bırakıldı, ilerideki bir aşamada eklenecek.
export function getPartCheckouts() {
  return selectAll("partCheckouts", "createdAt");
}

// Yanlış girilen bir zimmeti düzeltmek için genel amaçlı patch — updatePendingPart
// ile aynı desen. Ürün/miktar düzeltilirken çağıran taraf (handlers.js)
// mutabakatı sıfırlar (status:"outstanding", qtyUsed/qtyReturned: null) ki
// eski (artık geçersiz) kullanılan/iade bölünmesi yanlışlıkla kalmasın.
export async function updatePartCheckout(id, patch) {
  const { actingUserId, ...rest } = patch;
  const finalPatch = { ...rest, ...stampUpdatedPatch(actingUserId) };
  const { data, error } = await supabase
    .from("partCheckouts")
    .update(finalPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message || "Zimmet kaydı bulunamadı");
  await logActivity(actingUserId, "partCheckout", "zimmet kaydını düzenledi");
  return data;
}

export async function addPartCheckout(input) {
  const item = await getStockItemById(input.stockItemId);
  if (!item) throw new Error("Stok kalemi bulunamadı");
  const qty = Number(input.qtyTaken) || 0;
  if (qty <= 0) throw new Error("Miktar 0'dan büyük olmalı");

  const row = {
    id: uuid(),
    technicianId: input.technicianId,
    stockItemId: input.stockItemId,
    date: input.date,
    qtyTaken: qty,
    status: "outstanding",
    qtyUsed: null,
    qtyReturned: null,
    appointmentId: null,
    note: input.note || "",
    ...stampCreatedPatch(input.actingUserId),
  };
  const { data, error } = await supabase.from("partCheckouts").insert(row).select().single();
  if (error) throw new Error(error.message);
  await logActivity(
    input.actingUserId,
    "partCheckout",
    `yedek parça zimmetledi: ${item.code} — ${item.name} x${qty}`
  );
  return data;
}

export async function reconcilePartCheckout(id, patch) {
  const { data: existing, error: selErr } = await supabase
    .from("partCheckouts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (!existing) throw new Error("Zimmet kaydı bulunamadı");

  const qtyUsed = Number(patch.qtyUsed) || 0;
  const qtyReturned = Number(patch.qtyReturned) || 0;
  if (qtyUsed + qtyReturned !== existing.qtyTaken) {
    throw new Error("Kullanılan + iade edilen miktar, alınan miktara eşit olmalı");
  }

  const { data, error } = await supabase
    .from("partCheckouts")
    .update({
      status: "reconciled",
      qtyUsed,
      qtyReturned,
      appointmentId: patch.appointmentId || null,
      ...stampUpdatedPatch(patch.actingUserId),
    })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  await logActivity(
    patch.actingUserId,
    "partCheckout",
    `zimmet mutabakatı yaptı (kullanılan: ${qtyUsed}, iade: ${qtyReturned})`
  );
  return data;
}

export async function deletePartCheckout(id, actingUserId) {
  const { error } = await supabase.from("partCheckouts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(actingUserId, "partCheckout", "yedek parça zimmet kaydını sildi");
}

// ---------- Teknisyenler / Araçlar ----------

export function getTechnicians() {
  return selectAll("technicians");
}

export async function setTechnicians(list, actingUserId) {
  await requireAdmin(actingUserId, "Çalışan listesini güncelleme");
  const result = await replaceTable("technicians", list);
  await logActivity(actingUserId, "technician", "teknisyen listesini güncelledi");
  return result;
}

// ---------- Ofis Çalışanları ----------
// Teknisyenlerden farklı olarak randevu/rota ile ilişkisi yok — sadece
// yıllık izin takibi için ayrı bir personel listesi (uygulamaya giriş
// yapmayan ofis çalışanları da buraya eklenebilir).

export function getOfficeStaff() {
  return selectAll("officeStaff");
}

export async function setOfficeStaff(list, actingUserId) {
  await requireAdmin(actingUserId, "Çalışan listesini güncelleme");
  const result = await replaceTable("officeStaff", list);
  await logActivity(actingUserId, "officeStaff", "ofis çalışanı listesini güncelledi");
  return result;
}

// ---------- Resmi ve Dini Tatiller ----------
// Yıllık izin hesaplarında (bkz. src/lib/format.js) hafta tatili gibi
// düşülmemesi gereken günler — dini bayramlar her yıl değiştiği için
// admin tarafından Ayarlar'dan elle güncellenir.

export function getHolidays() {
  return selectAll("holidays");
}

export async function setHolidays(list, actingUserId) {
  await requireAdmin(actingUserId, "Tatil listesini güncelleme");
  const result = await replaceTable("holidays", list);
  await logActivity(actingUserId, "holidays", "resmi/dini tatil listesini güncelledi");
  return result;
}

export function getVehicles() {
  return selectAll("vehicles");
}

export async function setVehicles(list, actingUserId) {
  const saved = await replaceTable("vehicles", list);
  const validIds = new Set(saved.map((v) => v.id));
  const technicians = await selectAll("technicians");
  for (const tech of technicians) {
    if (tech.vehicleId && !validIds.has(tech.vehicleId)) {
      await supabase.from("technicians").update({ vehicleId: null }).eq("id", tech.id);
    }
  }
  await logActivity(actingUserId, "vehicle", "araç listesini güncelledi");
  return saved;
}

// ---------- Tedarikçiler ----------

// Renderer'a şifrelenmiş şifre bloğunu ASLA göndermeyiz — sadece kayıtlı
// olup olmadığını (hasCredentials) gönderiyoruz. Gerçek değer sadece
// main.js içinde, otomatik giriş anında, getSupplierById ile okunur.
export async function getSuppliers() {
  const rows = await selectAll("suppliers");
  return rows.map((s) => {
    const { passwordEncrypted, ...rest } = s;
    return { ...rest, hasCredentials: !!passwordEncrypted };
  });
}

export async function getSupplierById(id) {
  const { data, error } = await supabase.from("suppliers").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function setSuppliers(list, actingUserId) {
  await requireAdmin(actingUserId, "Tedarikçi listesini güncelleme");
  const { data: existingRows, error } = await supabase.from("suppliers").select("*");
  if (error) throw new Error(error.message);
  const existingById = new Map((existingRows || []).map((s) => [s.id, s]));

  const prepared = list.map((incoming) => {
    const { passwordEncryptedNew, clearCredentials, hasCredentials, ...clean } = incoming;
    const existing = existingById.get(incoming.id);
    if (clearCredentials) {
      delete clean.username;
      clean.passwordEncrypted = null;
      return clean;
    }
    if (passwordEncryptedNew) {
      clean.passwordEncrypted = passwordEncryptedNew;
    } else if (existing?.passwordEncrypted) {
      clean.passwordEncrypted = existing.passwordEncrypted;
    }
    return clean;
  });

  await replaceTable("suppliers", prepared);
  await logActivity(actingUserId, "supplier", "tedarikçi listesini güncelledi");
  return getSuppliers();
}

// ---------- Depolar ----------

export function getDepots() {
  return selectAll("depots");
}

export async function setDepots(list, actingUserId) {
  const result = await replaceTable("depots", list);
  await logActivity(actingUserId, "depot", "depo listesini güncelledi");
  return result;
}

// ---------- Stok ----------

export function getStockItems() {
  return selectAll("stockItems");
}

export async function getStockItemById(id) {
  const { data, error } = await supabase.from("stockItems").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

// Toplu CSV içe aktarma için — küçük listelerde olduğu gibi "tüm listeyi
// gönder" davranışı. Sık kullanılan tekil işlemler (ekle/güncelle/sil) için
// aşağıdaki satır bazlı fonksiyonlar kullanılır — binlerce kayıtlı bir
// tabloda her tıklamada tüm listeyi göndermemek için.
export async function setStockItems(list, actingUserId) {
  const result = await replaceTable("stockItems", list);
  await logActivity(actingUserId, "stock", `stok listesini CSV ile güncelledi (${list.length} kalem)`);
  return result;
}

export async function addStockItem(item, actingUserId) {
  const row = { id: uuid(), ...item };
  const { data, error } = await supabase.from("stockItems").insert(row).select().single();
  if (error) throw new Error(error.message);
  await logActivity(actingUserId, "stock", `stok kalemi ekledi: ${data.code} — ${data.name}`);
  return data;
}

export async function updateStockItem(id, patch, actingUserId) {
  const { data, error } = await supabase
    .from("stockItems")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("Ürün bulunamadı");
  await logActivity(actingUserId, "stock", `stok güncelledi: ${data.code} — ${data.name}`);
  return data;
}

// Stok silme SADECE yönetici hesaplarında — buton zaten arayüzde admin
// olmayanlara gösterilmiyor, ama bu kontrol olmadan biri IPC/HTTP çağrısını
// doğrudan tetikleyerek bunu atlatabilirdi (bkz. StockPage.jsx'teki not).
export async function deleteStockItemRow(id, actingUserId) {
  await requireAdmin(actingUserId, "Stok kalemi silme");
  const { data: existing } = await supabase.from("stockItems").select("code, name").eq("id", id).maybeSingle();
  const { error } = await supabase.from("stockItems").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(actingUserId, "stock", `stok kalemi sildi: ${existing?.code || ""} — ${existing?.name || ""}`);
}

// ---------- Hızlı Satış (Anasayfa "Satış" popup'ı) ----------

export async function addSale(input) {
  const row = {
    id: uuid(),
    items: input.items,
    generalDiscountRate: input.generalDiscountRate ?? null,
    subtotal: input.subtotal,
    vatTotal: input.vatTotal,
    total: input.total,
    deductedFromStock: Boolean(input.deductedFromStock),
    createdBy: input.actingUserId || null,
    createdAt: new Date().toISOString(),
  };
  const { data, error } = await supabase.from("sales").insert(row).select().single();
  if (error) throw new Error(error.message);
  await logActivity(
    input.actingUserId,
    "sale",
    `satış kaydetti: ${Number(data.total).toLocaleString("tr-TR")} TL${
      data.deductedFromStock ? " (stoktan düşüldü)" : " (stoktan düşülmedi)"
    }`
  );
  return data;
}

// ---------- Yakıt (Filotim akaryakıt kartı senkronizasyonu) ----------

// Filotim'in kendi işlem id'si birincil anahtar olarak kullanılıyor —
// aynı işlem tekrar senkronize edildiğinde (her senkronda TÜM geçmiş yeniden
// çekiliyor, bkz. handlers.js) üzerine yazar, yinelenen kayıt oluşmaz.
export async function upsertFuelTransactions(list) {
  if (!list.length) return { count: 0 };
  const rows = list.map((t) => ({ ...t, syncedAt: new Date().toISOString() }));
  const { error } = await supabase.from("fuelTransactions").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(error.message);
  return { count: rows.length };
}

export async function getFuelTransactions() {
  return selectAll("fuelTransactions");
}

// Araç/kart limit-kullanım durumu — TARİHÇE değil, ANLIK durumun bir
// görüntüsü (bkz. filotimSync.js'teki not: sadece hâlâ aktif kartlar).
// Bu yüzden fuelTransactions'ın aksine her senkronda TAMAMEN yenilenir
// (replaceTable ile) — satılan/iptal edilen bir aracın eski limit satırı
// bir sonraki senkronda kendiliğinden kaybolur.
export async function replaceFuelDevices(list) {
  return replaceTable("fuelDevices", list);
}

export async function getFuelDevices() {
  return selectAll("fuelDevices");
}

// ---------- Ayarlar (anahtar/değer) ----------

export async function getSettings() {
  const { data, error } = await supabase.from("settings").select("key, value");
  if (error) throw new Error(error.message);
  const settings = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function updateSettings(patch, actingUserId) {
  const rows = Object.entries(patch).map(([key, value]) => ({ key, value }));
  if (rows.length) {
    const { error } = await supabase.from("settings").upsert(rows, { onConflict: "key" });
    if (error) throw new Error(error.message);
    // Değer ASLA loglanmaz (API anahtarı olabilir) — sadece hangi ayarın
    // değiştiği (anahtar adı) kaydedilir.
    await logActivity(actingUserId, "settings", `ayar güncelledi: ${Object.keys(patch).join(", ")}`);
  }
  return getSettings();
}

// ---------- Google Maps kullanım sayacı (Harita sekmesi) ----------

// Google Maps Platform ücretsiz kotası (ayda 10.000 harita açılışı) aşılırsa
// ücretlendirme başlıyor — Harita sekmesini açan HERKESİN (tüm bilgisayarlar)
// toplam açılış sayısını izlemek için "settings" tablosunu ay bazlı bir
// sayaç anahtarıyla (mapsLoads_YYYY-MM) kullanıyoruz; ayrı bir tablo/migrasyon
// gerekmiyor. Yeni ay başlayınca otomatik olarak sıfırdan başlar (yeni anahtar).
function currentMonthKey() {
  return new Date().toISOString().slice(0, 7);
}

export async function getMapUsageCount() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", `mapsLoads_${currentMonthKey()}`)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return { count: data ? Number(data.value) || 0 : 0, month: currentMonthKey() };
}

export async function incrementMapUsageCount() {
  const monthKey = currentMonthKey();
  const { count } = await getMapUsageCount();
  const next = count + 1;
  const { error } = await supabase
    .from("settings")
    .upsert({ key: `mapsLoads_${monthKey}`, value: String(next) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
  return { count: next, month: monthKey };
}

// ---------- Kameralar (birden çok DVR/konum — settings.cameras altında) ----------
// Ham okuma — passwordEncrypted dahil. Sadece main.js (RTSP URL oluşturmak için) kullanır,
// renderer'a asla gönderilmez.

async function readCameraList() {
  const { data, error } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "cameras")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data?.value) {
    try {
      return JSON.parse(data.value);
    } catch {
      return [];
    }
  }

  // Eski tekil-DVR formatından ("cameraConfig") bir kerelik otomatik geçiş —
  // depoda zaten girilmiş DVR ayarları kaybolmasın diye.
  const { data: oldRow, error: oldErr } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "cameraConfig")
    .maybeSingle();
  if (oldErr) throw new Error(oldErr.message);
  if (oldRow?.value) {
    let old;
    try {
      old = JSON.parse(oldRow.value);
    } catch {
      old = null;
    }
    if (old) {
      const migrated = [{ id: uuid(), ...old }];
      await writeCameraList(migrated);
      return migrated;
    }
  }
  return [];
}

async function writeCameraList(list) {
  const { error } = await supabase
    .from("settings")
    .upsert({ key: "cameras", value: JSON.stringify(list) }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export async function getCameraList() {
  return readCameraList();
}

// Renderer'a giden sürüm — passwordEncrypted asla dışarı çıkmaz.
export async function getCameraListSettings() {
  const list = await readCameraList();
  return list.map(({ passwordEncrypted, ...rest }) => ({ ...rest, hasCredentials: !!passwordEncrypted }));
}

export async function setCameraList(incomingList, actingUserId) {
  const existing = await readCameraList();
  const existingById = new Map(existing.map((d) => [d.id, d]));
  const prepared = incomingList.map((incoming) => {
    const { passwordEncryptedNew, clearCredentials, hasCredentials, password, ...clean } = incoming;
    const prior = existingById.get(incoming.id);
    if (clearCredentials) {
      clean.passwordEncrypted = null;
    } else if (passwordEncryptedNew) {
      clean.passwordEncrypted = passwordEncryptedNew;
    } else if (prior?.passwordEncrypted) {
      clean.passwordEncrypted = prior.passwordEncrypted;
    }
    return clean;
  });
  await writeCameraList(prepared);
  // Host/kullanıcı adı/şifre/RTSP ASLA loglanmaz — sadece DVR sayısı.
  await logActivity(actingUserId, "camera", `kamera ayarlarını güncelledi (${prepared.length} DVR)`);
  return getCameraListSettings();
}

// ---------- Kullanıcılar ----------

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
    hiddenTabs: user.hiddenTabs || [],
    settingsSections: user.settingsSections || [],
    photo: user.photo || "",
    photoPosition: user.photoPosition || { x: 50, y: 50 },
  };
}

export async function getUsers() {
  const rows = await selectAll("users");
  return rows.map(sanitizeUser);
}

export async function addUser({ name, password, role, hiddenTabs, settingsSections, photo, photoPosition, actingUserId }) {
  // İlk kurulum: hiç kullanıcı yokken (LoginGate.jsx'in "İlk kullanıcıyı
  // oluştur" akışı) henüz kimse giriş yapmamış olduğu için actingUserId de
  // yok — bu durumda admin kontrolü ATLANIR, aksi halde uygulama hiçbir
  // zaman ilk kez kurulamazdı. Sonraki her addUser çağrısı (en az bir
  // kullanıcı zaten varken) admin gerektirir.
  const { count } = await supabase.from("users").select("id", { count: "exact", head: true });
  if (count > 0) {
    await requireAdmin(actingUserId, "Kullanıcı ekleme");
  }
  const user = {
    id: uuid(),
    name,
    passwordHash: hashPassword(password),
    role: role === "admin" ? "admin" : "staff",
    hiddenTabs: hiddenTabs || [],
    settingsSections: settingsSections || [],
    photo: photo || "",
    photoPosition: photoPosition || { x: 50, y: 50 },
  };
  let { data, error } = await supabase.from("users").insert(user).select().single();
  if (error && isMissingColumnError(error, "settingsSections")) {
    // "settingsSections" sütunu (Ayarlar sekmesi bölüm izinleri için) henüz
    // eklenmemiş olabilir — SQL migrasyonu çalıştırılana kadar kullanıcı
    // eklemeyi tamamen bloke etmemek için o alan olmadan tekrar deneriz.
    delete user.settingsSections;
    ({ data, error } = await supabase.from("users").insert(user).select().single());
  }
  if (error) throw new Error(error.message);
  await logActivity(
    actingUserId,
    "user",
    `kullanıcı ekledi: ${user.name} (${user.role === "admin" ? "Yönetici" : "Personel"})`
  );
  return sanitizeUser(data);
}

// Ayarlar sekmesi artık personele de açık olduğu için buraya iki farklı
// çağıran ulaşabiliyor: (1) admin, Kullanıcılar bölümünden BAŞKA birini
// (veya kendini) her alanla güncelliyor — mevcut davranış; (2) personel,
// YENİ "Profilim" bölümünden SADECE KENDİ kaydını, sadece ad/şifre/fotoğraf
// alanlarıyla güncelliyor. Rol/izin alanları (role/hiddenTabs/
// settingsSections) admin olmayan bir çağrıda patch'te gelse bile sessizce
// yok sayılır — aksi halde personel kendi kendine yetki yükseltebilirdi.
// Başka bir kullanıcının id'siyle admin olmayan bir çağrı gelirse tamamen
// reddedilir.
export async function updateUser(id, { name, password, role, hiddenTabs, settingsSections, photo, photoPosition, actingUserId }) {
  const { data: actingUser } = await supabase.from("users").select("role").eq("id", actingUserId).maybeSingle();
  const isAdmin = actingUser?.role === "admin";
  if (!isAdmin && id !== actingUserId) {
    throw new Error("Bu kullanıcıyı güncelleme yetkiniz yok.");
  }

  const { data: user, error: fetchErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !user) throw new Error("Kullanıcı bulunamadı");

  const patch = {};
  const changedLabels = [];
  if (name) {
    patch.name = name;
    if (name !== user.name) changedLabels.push("ad");
  }
  if (password) {
    patch.passwordHash = hashPassword(password);
    changedLabels.push("şifre");
  }
  if (photo !== undefined) {
    patch.photo = photo;
    if (photo !== (user.photo || "")) changedLabels.push("fotoğraf");
  }
  if (photoPosition !== undefined) patch.photoPosition = photoPosition;

  // Rol/izin alanları SADECE admin çağrılarında işlenir.
  if (isAdmin) {
    if (Array.isArray(hiddenTabs)) {
      patch.hiddenTabs = hiddenTabs;
      if (JSON.stringify(hiddenTabs) !== JSON.stringify(user.hiddenTabs || [])) changedLabels.push("izinler");
    }
    if (Array.isArray(settingsSections)) {
      patch.settingsSections = settingsSections;
      if (JSON.stringify(settingsSections) !== JSON.stringify(user.settingsSections || [])) {
        changedLabels.push("ayarlar izinleri");
      }
    }
    if (role === "admin" || role === "staff") {
      if (user.role === "admin" && role === "staff") {
        const { data: admins } = await supabase
          .from("users")
          .select("id")
          .eq("role", "admin")
          .neq("id", id);
        if (!admins || admins.length === 0) {
          throw new Error("Son kalan yönetici personel yapılamaz.");
        }
      }
      patch.role = role;
      if (role !== user.role) changedLabels.push("rol");
    }
  }

  // Admin olmayan bir çağrıda role/hiddenTabs/settingsSections yok
  // sayıldığı için (yukarıda), SADECE bu alanları göndermeye çalışan bir
  // istek patch'i tamamen boş bırakabilir — boş bir .update({}) PostgREST'te
  // anlamsız/hatalı bir sorguya yol açıyordu, bu yüzden burada no-op olarak
  // erken dönüyoruz.
  if (Object.keys(patch).length === 0) {
    return sanitizeUser(user);
  }

  let { data, error } = await supabase.from("users").update(patch).eq("id", id).select().single();
  if (error && isMissingColumnError(error, "settingsSections")) {
    delete patch.settingsSections;
    if (Object.keys(patch).length === 0) return sanitizeUser(user);
    ({ data, error } = await supabase.from("users").update(patch).eq("id", id).select().single());
  }
  if (error) throw new Error(error.message);
  if (changedLabels.length) {
    await logActivity(actingUserId, "user", `kullanıcı güncelledi: ${data.name} (${changedLabels.join(", ")})`);
  }
  return sanitizeUser(data);
}

// createdBy/updatedBy damgası taşıyan tablolar — kullanıcı silinince bu
// referanslar bırakılırsa "users" tablosundaki yabancı anahtar kısıtlaması
// silmeyi engelliyordu (bkz. deleteUser). Kaydın kendisi kalır, sadece "kim
// oluşturdu/güncelledi" bilgisi boşa düşer.
const CREATED_UPDATED_BY_TABLES = ["appointments", "pendingParts", "partCheckouts", "quotes", "incomingOrders"];

export async function deleteUser(id, actingUserId) {
  await requireAdmin(actingUserId, "Kullanıcı silme");
  const { data: allUsers, error } = await supabase.from("users").select("id, role, name");
  if (error) throw new Error(error.message);
  if (allUsers.length <= 1) {
    throw new Error("Son kalan kullanıcı silinemez.");
  }
  const target = allUsers.find((u) => u.id === id);
  const remainingAdmins = allUsers.filter((u) => u.role === "admin" && u.id !== id);
  if (target?.role === "admin" && remainingAdmins.length === 0) {
    throw new Error("Son kalan yönetici silinemez.");
  }

  // Kullanıcının gönderdiği/aldığı mesajlar tamamen silinir (mesaj tek
  // başına iki tarafın kimliğiyle anlamlı — biri silinince saklamanın
  // faydası yok), diğer tablolardaki "kim yaptı" referansları ise sadece
  // null'lanır (asıl kayıt — randevu/teklif/sipariş — silinmez).
  const { error: msgErr } = await supabase
    .from("messages")
    .delete()
    .or(`senderId.eq.${id},recipientId.eq.${id}`);
  if (msgErr) throw new Error(msgErr.message);

  for (const table of CREATED_UPDATED_BY_TABLES) {
    const { error: createdErr } = await supabase.from(table).update({ createdBy: null }).eq("createdBy", id);
    if (createdErr) throw new Error(createdErr.message);
    const { error: updatedErr } = await supabase.from(table).update({ updatedBy: null }).eq("updatedBy", id);
    if (updatedErr) throw new Error(updatedErr.message);
  }

  const { error: activityErr } = await supabase.from("activityLog").update({ actorUserId: null }).eq("actorUserId", id);
  if (activityErr) throw new Error(activityErr.message);

  const { error: delErr } = await supabase.from("users").delete().eq("id", id);
  if (delErr) throw new Error(delErr.message);
  await logActivity(actingUserId, "user", `kullanıcı sildi: ${target?.name || ""}`);
}

export async function verifyLogin(name, password) {
  const { data: users, error } = await supabase.from("users").select("*");
  if (error) throw new Error(error.message);
  const user = (users || []).find((u) => u.name.toLowerCase() === name.toLowerCase());
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;
  await logActivity(user.id, "auth", "giriş yaptı");
  return sanitizeUser(user);
}

// ---------- Fiyat Teklifleri ----------

// "{yıl}-{sıradaki 3 haneli sayı}" — o yıl içindeki en yüksek sıra
// numarasının bir fazlası. Aynı anda iki teklif oluşturulursa (nadir)
// aynı numara üretilebilir; bu, kapsam dışı bırakılan bir yarış durumu.
async function nextQuoteNo() {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const { data, error } = await supabase.from("quotes").select("quoteNo").ilike("quoteNo", `${prefix}%`);
  if (error) throw new Error(error.message);
  const maxSeq = (data || []).reduce((max, r) => {
    const n = parseInt((r.quoteNo || "").slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export function getQuotes() {
  return selectAll("quotes", "createdAt");
}

export async function addQuote(input) {
  const quoteNo = await nextQuoteNo();
  const quote = {
    id: uuid(),
    quoteNo,
    customerName: input.customerName,
    contactName: input.contactName || "",
    customerPhone: input.customerPhone || "",
    customerEmail: input.customerEmail || "",
    customerAddress: input.customerAddress || "",
    quoteDate: input.quoteDate,
    validityDays: input.validityDays ?? 15,
    preparedBy: input.preparedBy || "",
    currency: input.currency || "TRY",
    items: input.items || [],
    paymentTerms: input.paymentTerms || "Nakit · Anlaşmalı Kredi ve Banka Kartları · Havale/EFT",
    warranty: input.warranty || "2 Yıl",
    notes: input.notes || "Fiyatlara aksi belirtilmedikçe nakliye ve montaj dahil değildir.",
    iban: input.iban || "",
    discountRate:
      input.discountRate != null && input.discountRate !== "" ? Number(input.discountRate) : 0,
    ...stampCreatedPatch(input.actingUserId),
  };
  const { data, error } = await supabase.from("quotes").insert(quote).select().single();
  if (error) throw new Error(error.message);
  await logActivity(input.actingUserId, "quote", `teklif oluşturdu: ${data.quoteNo} (${data.customerName})`);
  return data;
}

export async function updateQuote(id, patch) {
  const { actingUserId, ...rest } = patch;
  const finalPatch = { ...rest, ...stampUpdatedPatch(actingUserId) };
  const { data, error } = await supabase
    .from("quotes")
    .update(finalPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("Teklif bulunamadı");
  await logActivity(actingUserId, "quote", `teklif güncelledi: ${data.quoteNo} (${data.customerName})`);
  return data;
}

export async function deleteQuote(id, actingUserId) {
  const { data: existing } = await supabase
    .from("quotes")
    .select("quoteNo, customerName")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(
    actingUserId,
    "quote",
    `teklif sildi: ${existing?.quoteNo || ""} (${existing?.customerName || ""})`
  );
}

// ---------- Gelen Siparişler (Vitra bayisi olarak diğer firmalardan alınan siparişler) ----------

// "{yıl}-{sıradaki 3 haneli sayı}" — nextQuoteNo() ile aynı desen, ayrı
// tablo/kolon üzerinde.
async function nextOrderNo() {
  const year = new Date().getFullYear();
  const prefix = `${year}-`;
  const { data, error } = await supabase
    .from("incomingOrders")
    .select("orderNo")
    .ilike("orderNo", `${prefix}%`);
  if (error) throw new Error(error.message);
  const maxSeq = (data || []).reduce((max, r) => {
    const n = parseInt((r.orderNo || "").slice(prefix.length), 10);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export function getIncomingOrders() {
  return selectAll("incomingOrders", "createdAt");
}

export async function addIncomingOrder(input) {
  const orderNo = await nextOrderNo();
  const order = {
    id: uuid(),
    orderNo,
    customerName: input.customerName,
    contactName: input.contactName || "",
    customerPhone: input.customerPhone || "",
    customerEmail: input.customerEmail || "",
    customerAddress: input.customerAddress || "",
    orderDate: input.orderDate,
    items: input.items || [],
    currency: input.currency || "TRY",
    discountRate:
      input.discountRate != null && input.discountRate !== "" ? Number(input.discountRate) : 0,
    status: input.status || "yeni",
    statusUpdatedAt: new Date().toISOString(),
    deliveryType: input.deliveryType || "kendi_aracimiz",
    deliveryNote: input.deliveryNote || "",
    notes: input.notes || "",
    reminderAt: input.reminderAt || null,
    reminderNote: input.reminderNote || "",
    reminderUserIds: input.reminderUserIds || [],
    reminderNotifiedUserIds: [],
    reminderDismissedUserIds: [],
    ...stampCreatedPatch(input.actingUserId),
  };
  const { data, error } = await supabase.from("incomingOrders").insert(order).select().single();
  if (error) throw new Error(error.message);
  await logActivity(
    input.actingUserId,
    "incomingOrder",
    `gelen sipariş oluşturdu: ${data.orderNo} (${data.customerName})`
  );
  return data;
}

export async function updateIncomingOrder(id, patch) {
  const { actingUserId, ...rest } = patch;
  // "status" değişiyorsa statusUpdatedAt'i biz damgalıyoruz — istemci
  // saatine/unutkanlığına güvenmemek için önce mevcut durumu okuyup
  // karşılaştırıyoruz.
  if (rest.status || "reminderAt" in rest) {
    const { data: existing } = await supabase
      .from("incomingOrders")
      .select("status, reminderAt")
      .eq("id", id)
      .maybeSingle();
    if (existing && rest.status && existing.status !== rest.status) {
      rest.statusUpdatedAt = new Date().toISOString();
    }
    // Hatırlatma tarihi değiştiyse bu YENİ bir hatırlatmadır — eski
    // hatırlatmayı görüp kapatmış/bildirilmiş kullanıcılar için de baştan
    // sayılmalı, yoksa yeni hatırlatma onlara hiç gösterilmez.
    if (existing && "reminderAt" in rest && existing.reminderAt !== rest.reminderAt) {
      rest.reminderNotifiedUserIds = [];
      rest.reminderDismissedUserIds = [];
    }
  }
  const finalPatch = { ...rest, ...stampUpdatedPatch(actingUserId) };
  const { data, error } = await supabase
    .from("incomingOrders")
    .update(finalPatch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error("Sipariş bulunamadı");
  await logActivity(
    actingUserId,
    "incomingOrder",
    `gelen sipariş güncelledi: ${data.orderNo} (${data.customerName})`
  );
  return data;
}

export async function deleteIncomingOrder(id, actingUserId) {
  const { data: existing } = await supabase
    .from("incomingOrders")
    .select("orderNo, customerName")
    .eq("id", id)
    .maybeSingle();
  const { error } = await supabase.from("incomingOrders").delete().eq("id", id);
  if (error) throw new Error(error.message);
  await logActivity(
    actingUserId,
    "incomingOrder",
    `gelen sipariş sildi: ${existing?.orderNo || ""} (${existing?.customerName || ""})`
  );
}

// Bir hatırlatma zamanı geldiğinde her hedef kullanıcının istemcisi kendi
// bildirimini gösterir gösterir göstermez burayı çağırır — aynı kullanıcıya
// başka bir bilgisayarda/yeniden başlatmada TEKRAR bildirim gitmesin diye
// "kime zaten bildirildi" listesi sunucuda (bu satırda) tutulur. Küçük ofis
// ekibi ve düşük yazma sıklığı nedeniyle oku-değiştir-yaz burada yeterli
// (updateUser'ın hiddenTabs alanıyla aynı yarış-durumu profili).
export async function markIncomingOrderReminderNotified(id, userId) {
  const { data: existing, error: selErr } = await supabase
    .from("incomingOrders")
    .select("reminderNotifiedUserIds")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  const current = existing?.reminderNotifiedUserIds || [];
  if (current.includes(userId)) return;
  const { error } = await supabase
    .from("incomingOrders")
    .update({ reminderNotifiedUserIds: [...current, userId] })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// "reminderNotifiedUserIds"'den AYRI, bilinçli bir alan — o, native OS
// bildiriminin bir kullanıcıya sadece bir kez gitmesini sağlar (hatırlatma
// süresi geçer geçmez otomatik işaretlenir), bu ise header'daki hatırlatma
// listesinden kullanıcının kendi isteğiyle (çöp kutusu ikonuna basarak)
// kaldırmasını sağlar. İkisini aynı alanda tutsaydık, bildirim ateşlenir
// ateşlenmez header'daki kayıt da anında (kullanıcı hiç görmeden) kaybolurdu.
export async function dismissIncomingOrderReminder(id, userId) {
  const { data: existing, error: selErr } = await supabase
    .from("incomingOrders")
    .select("reminderDismissedUserIds")
    .eq("id", id)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  const current = existing?.reminderDismissedUserIds || [];
  if (current.includes(userId)) return;
  const { error } = await supabase
    .from("incomingOrders")
    .update({ reminderDismissedUserIds: [...current, userId] })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ---------- Mesajlar (ofis çalışanları arası birebir) ----------

// Bir kullanıcının taraf olduğu TÜM mesajları (gönderdiği + aldığı) tek
// seferde çekip renderer'da kişiye göre gruplandırıyoruz — ofis ekibi küçük
// olduğu için ayrı bir "conversations" tablosuna gerek yok.
export async function getMessagesFor(userId) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`senderId.eq.${userId},recipientId.eq.${userId}`)
    .order("createdAt", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function sendMessage(senderId, recipientId, body) {
  const message = {
    id: uuid(),
    senderId,
    recipientId,
    body,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  const { data, error } = await supabase.from("messages").insert(message).select().single();
  if (error) throw new Error(error.message);
  return data;
}

// currentUserId'nin otherUserId'den aldığı, henüz okunmamış mesajları
// "okundu" olarak işaretler (sohbet açıldığında çağrılır).
export async function markMessagesRead(currentUserId, otherUserId) {
  const { error } = await supabase
    .from("messages")
    .update({ readAt: new Date().toISOString() })
    .eq("recipientId", currentUserId)
    .eq("senderId", otherUserId)
    .is("readAt", null);
  if (error) throw new Error(error.message);
}

export async function deleteMessage(id, actingUserId) {
  // Sadece kendi gönderdiği mesajı silebilir.
  const { error } = await supabase.from("messages").delete().eq("id", id).eq("senderId", actingUserId);
  if (error) throw new Error(error.message);
}
