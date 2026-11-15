// Telefon/tarayıcıdan test amaçlı erişim için küçük bir HTTP sunucusu.
// Electron masaüstü uygulamasıyla AYNI iş mantığını (electron/handlers.js)
// kullanır ama BİLEREK AYRI bir Supabase projesine ("dev") bağlanır —
// electron/config.js NODE_ENV=development kontrolüyle bunu otomatik yapar.
// Böylece masaüstü uygulaması ve gerçek işletme verisi hiç etkilenmez,
// telefon testleri tamamen izole kalır.

import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as config from "../electron/config.js";
import * as db from "../electron/db.js";
import * as handlers from "../electron/handlers.js";
import { requireAuth, issueToken, loginBlocked, recordLoginResult, securityHeaders } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IS_PRODUCTION = process.env.NODE_ENV === "production";
// Güvenlik kilidi: canlı mod YALNIZ kapsayıcıdaki ortam değişkenli yapılandırmayla
// (server/config.production.js) açılır. Bir geliştiricinin bilgisayarında
// yanlışlıkla NODE_ENV=production verilirse yerel config.js ile PROD'a bağlanmak
// yerine sunucu hiç açılmaz.
if (IS_PRODUCTION && config.CONFIG_KIND !== "production-env") {
  console.error("NODE_ENV=production yalnız canlı kapsayıcıda kullanılır (server/config.production.js). Sunucu başlatılmadı.");
  process.exit(1);
}
// Barındırma hizmeti portu PORT ile verir; yerelde 4173.
const PORT = Number(process.env.PORT) || 4173;

await db.initDb();

const app = express();
app.disable("x-powered-by");
// Canlıda HTTPS'i barındırma hizmetinin vekili (proxy) sonlandırır: gerçek
// istemci IP'si X-Forwarded-For'dan okunur (giriş denemesi sınırı IP'ye bakar).
if (IS_PRODUCTION) app.set("trust proxy", 1);
// Sağlık kontrolü (barındırma hizmeti için) — oturum gerektirmez, veri döndürmez.
app.get("/healthz", (_req, res) => res.json({ ok: true }));
app.use(securityHeaders);
// Varsayılan limit 100kb — profil fotoğrafı gibi base64 gövdeler (mobil
// profil ekranı, PUT /api/users/:id) bunu kolayca aşıp 413 ile reddediliyordu.
// Masaüstü bu sınırı hiç görmüyordu çünkü IPC üzerinden direkt çalışıyor,
// sadece HTTP'den geçen mobil istemciler etkileniyordu.
app.use(express.json({ limit: "5mb" }));
// Giriş hariç bütün /api istekleri imzalı oturum anahtarı ister (bkz. auth.js).
app.use("/api", requireAuth);

app.get("/api/appointments", async (req, res, next) => {
  try {
    res.json(await handlers.listAppointments());
  } catch (err) {
    next(err);
  }
});
// Mobil Randevular ekranı için — tüm tabloyu değil, tek bir günü çeker.
app.get("/api/appointments/by-date/:date", async (req, res, next) => {
  try {
    res.json(await handlers.listAppointmentsByDate(req.params.date));
  } catch (err) {
    next(err);
  }
});
// Mobil Randevular ekranındaki arama kutusu — müşteri adı/telefonu, tarihten bağımsız.
app.get("/api/appointments/search", async (req, res, next) => {
  try {
    res.json(await handlers.searchAppointments(req.query.q));
  } catch (err) {
    next(err);
  }
});
// Mobil "Müşteri Geçmişi" ekranı için — tüm tabloyu değil, aynı müşteriye
// (telefon veya isimle) ait küçük bir sonuç çeker.
app.get("/api/appointments/by-customer", async (req, res, next) => {
  try {
    const { name, phone, excludeId } = req.query;
    res.json(await handlers.listAppointmentsByCustomer(name, phone, excludeId));
  } catch (err) {
    next(err);
  }
});
app.post("/api/appointments", async (req, res, next) => {
  try {
    res.json(await handlers.addAppointment(req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/appointments/:id", async (req, res, next) => {
  try {
    res.json(await handlers.updateAppointment(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/appointments/:id", async (req, res, next) => {
  try {
    await handlers.deleteAppointment(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
app.put("/api/appointments/:id/status", async (req, res, next) => {
  try {
    const { status, actingUserId } = req.body;
    res.json(await handlers.setAppointmentStatus(req.params.id, status, actingUserId));
  } catch (err) {
    next(err);
  }
});
app.put("/api/appointments/:id/hold-for-leave", async (req, res, next) => {
  try {
    const { actingUserId } = req.body;
    res.json(await handlers.holdAppointmentForLeave(req.params.id, actingUserId));
  } catch (err) {
    next(err);
  }
});
app.put("/api/appointments/:id/reassign", async (req, res, next) => {
  try {
    const { technicianId, actingUserId } = req.body;
    res.json(await handlers.reassignAppointment(req.params.id, technicianId, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/technicians", async (req, res, next) => {
  try {
    res.json(await handlers.listTechnicians());
  } catch (err) {
    next(err);
  }
});
app.put("/api/technicians", async (req, res, next) => {
  try {
    const { list, actingUserId } = req.body;
    res.json(await handlers.setTechnicians(list, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/office-staff", async (req, res, next) => {
  try {
    res.json(await handlers.listOfficeStaff());
  } catch (err) {
    next(err);
  }
});
app.put("/api/office-staff", async (req, res, next) => {
  try {
    const { list, actingUserId } = req.body;
    res.json(await handlers.setOfficeStaff(list, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/vehicles", async (req, res, next) => {
  try {
    res.json(await handlers.listVehicles());
  } catch (err) {
    next(err);
  }
});
app.put("/api/vehicles", async (req, res, next) => {
  try {
    res.json(await handlers.setVehicles(req.body));
  } catch (err) {
    next(err);
  }
});

app.get("/api/settings", async (req, res, next) => {
  try {
    res.json(await handlers.getSettings(req.authUserId));
  } catch (err) {
    next(err);
  }
});
app.put("/api/settings", async (req, res, next) => {
  try {
    const { patch, actingUserId } = req.body;
    res.json(await handlers.updateSettings(patch, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.post("/api/routes", async (req, res, next) => {
  try {
    const { scheduledDate, actingUserId } = req.body;
    res.json(await handlers.buildRoutes(scheduledDate, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/shop-location", (req, res) => res.json(handlers.getShopLocation()));
app.post("/api/sales", async (req, res, next) => {
  try {
    res.json(await handlers.addSale(req.body));
  } catch (err) {
    next(err);
  }
});

app.get("/api/maps/api-key", async (req, res, next) => {
  try {
    res.json(await handlers.getGoogleMapsApiKeyForClient());
  } catch (err) {
    next(err);
  }
});
app.get("/api/settings/idle-lock-config", async (req, res, next) => {
  try {
    res.json(await handlers.getIdleLockConfig());
  } catch (err) {
    next(err);
  }
});
app.get("/api/maps/usage-count", async (req, res, next) => {
  try {
    res.json(await handlers.getMapUsageCount());
  } catch (err) {
    next(err);
  }
});
app.post("/api/maps/usage-count/increment", async (req, res, next) => {
  try {
    res.json(await handlers.incrementMapUsageCount());
  } catch (err) {
    next(err);
  }
});

app.post("/api/fuel/sync", async (req, res, next) => {
  try {
    res.json(await handlers.syncFuelTransactions(req.body.actingUserId));
  } catch (err) {
    next(err);
  }
});
app.get("/api/fuel", async (req, res, next) => {
  try {
    res.json(await handlers.listFuelTransactions());
  } catch (err) {
    next(err);
  }
});
app.get("/api/fuel/devices", async (req, res, next) => {
  try {
    res.json(await handlers.listFuelDevices());
  } catch (err) {
    next(err);
  }
});

app.get("/api/activity-log", async (req, res, next) => {
  try {
    res.json(await handlers.listActivityLog(undefined, req.authUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/depots", async (req, res, next) => {
  try {
    res.json(await handlers.listDepots());
  } catch (err) {
    next(err);
  }
});
app.put("/api/depots", async (req, res, next) => {
  try {
    res.json(await handlers.setDepots(req.body));
  } catch (err) {
    next(err);
  }
});

app.get("/api/stock", async (req, res, next) => {
  try {
    res.json(await handlers.listStockItems());
  } catch (err) {
    next(err);
  }
});
// Barkod aracı için — ~10 binlik listeyi telefona çekmeden tek kalemi bulur.
app.get("/api/stock/by-barcode/:barcode", async (req, res, next) => {
  try {
    res.json(await handlers.getStockItemByBarcode(req.params.barcode));
  } catch (err) {
    next(err);
  }
});
app.put("/api/stock", async (req, res, next) => {
  try {
    res.json(await handlers.setStockItems(req.body));
  } catch (err) {
    next(err);
  }
});
app.post("/api/stock", async (req, res, next) => {
  try {
    // Electron IPC tarafı (main.js "stock:add") actingUserId'yi ayrı
    // geçiriyordu, bu HTTP ucu unutmuştu — yeni stok kalemleri aktivite
    // kaydında kimliksiz (createdBy boş) görünüyordu.
    const { actingUserId, ...item } = req.body;
    // Mobil uygulamalardan (bu HTTP ucu SADECE onlar tarafından kullanılıyor
    // — masaüstü IPC üzerinden doğrudan handlers.addStockItem'ı çağırıyor)
    // depo seçimi olmadan ürün eklenmesin diye bilerek SADECE burada
    // zorunlu kılındı; masaüstündeki Stok sayfası hâlâ depo opsiyonel.
    // Çoklu depo desteğiyle "depots" (dizi) ile de gelebilir.
    const hasDepots = Array.isArray(item.depots) && item.depots.length > 0;
    if (!item.depotId && !hasDepots) {
      return res.status(400).json({ message: "Depo seçimi zorunlu." });
    }
    res.json(await handlers.addStockItem(item, actingUserId));
  } catch (err) {
    next(err);
  }
});
app.put("/api/stock/:id", async (req, res, next) => {
  try {
    // İstek gövdesinde "actingUserId" varsa (bkz. barkod aracı) aktivite
    // kaydına doğru kullanıcı yazılsın diye ayrıştırılıp ayrı geçiriliyor —
    // önceden burada hiç geçirilmiyordu, güncellemeler kimliksiz görünüyordu.
    const { actingUserId, ...patch } = req.body;
    res.json(await handlers.updateStockItem(req.params.id, patch, actingUserId));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/stock/:id", async (req, res, next) => {
  try {
    await handlers.deleteStockItem(req.params.id, req.body?.actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
app.get("/api/stock/:id/depots", async (req, res, next) => {
  try {
    res.json(await handlers.getStockItemDepots(req.params.id));
  } catch (err) {
    next(err);
  }
});
app.put("/api/stock/:id/depots/:depotId", async (req, res, next) => {
  try {
    const { quantity, actingUserId } = req.body;
    await handlers.setStockItemDepotQuantity(req.params.id, req.params.depotId, quantity, actingUserId);
    res.json(await handlers.getStockItemDepots(req.params.id));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/stock/:id/depots/:depotId", async (req, res, next) => {
  try {
    await handlers.removeStockItemDepot(req.params.id, req.params.depotId, req.body?.actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
// Ürün sayfasındaki "info" butonu için — bu ürüne ait depo/miktar
// değişikliklerinin detaylı geçmişi.
app.get("/api/stock/:id/activity", async (req, res, next) => {
  try {
    res.json(await handlers.getStockItemActivity(req.params.id));
  } catch (err) {
    next(err);
  }
});
// Depo Transferi (stok kaydırma) — ör. depodaki bir ürünü dükkana getirme.
app.post("/api/stock/:id/transfer", async (req, res, next) => {
  try {
    const { fromDepotId, toDepotId, qty, actingUserId } = req.body;
    res.json(await handlers.transferStockItemDepot(req.params.id, fromDepotId, toDepotId, qty, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/suppliers", async (req, res, next) => {
  try {
    res.json(await handlers.listSuppliers());
  } catch (err) {
    next(err);
  }
});
app.put("/api/suppliers", async (req, res, next) => {
  try {
    // Telefon/tarayıcı test sunucusunda şifreleme (Electron safeStorage)
    // yok — düz metin şifrenin diske yazılmasını önlemek için burada atarız.
    // Mevcut kayıtlı kimlik bilgisi (varsa) db.js'teki birleştirme mantığıyla
    // korunur.
    const { list, actingUserId } = req.body || {};
    const sanitized = (list || []).map(({ password, hasCredentials, ...rest }) => rest);
    res.json(await handlers.setSuppliers(sanitized, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/users", async (req, res, next) => {
  try {
    res.json(await handlers.listUsers());
  } catch (err) {
    next(err);
  }
});
app.post("/api/users", async (req, res, next) => {
  try {
    const { name, password, role, hiddenTabs, settingsSections, actingUserId } = req.body;
    res.json(await handlers.addUser(name, password, role, hiddenTabs, settingsSections, actingUserId));
  } catch (err) {
    next(err);
  }
});
app.put("/api/users/:id", async (req, res, next) => {
  try {
    const { patch, actingUserId } = req.body;
    res.json(await handlers.updateUser(req.params.id, patch, actingUserId));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/users/:id", async (req, res, next) => {
  try {
    await handlers.deleteUser(req.params.id, req.body?.actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
app.post("/api/login", async (req, res, next) => {
  try {
    const { name, password } = req.body;
    if (loginBlocked(req, name)) {
      return res.status(429).json({ message: "Çok fazla hatalı deneme. Lütfen 15 dakika sonra tekrar deneyin." });
    }
    const user = await handlers.login(name, password);
    recordLoginResult(req, name, Boolean(user));
    // Başarılı girişte kullanıcıyla birlikte oturum anahtarı döner; hatalıysa null (eskisi gibi).
    res.json(user ? { ...user, token: issueToken(user.id) } : null);
  } catch (err) {
    next(err);
  }
});

app.get("/api/quotes", async (req, res, next) => {
  try {
    res.json(await handlers.listQuotes());
  } catch (err) {
    next(err);
  }
});
app.post("/api/quotes", async (req, res, next) => {
  try {
    res.json(await handlers.addQuote(req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/quotes/:id", async (req, res, next) => {
  try {
    res.json(await handlers.updateQuote(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/quotes/:id", async (req, res, next) => {
  try {
    await handlers.deleteQuote(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/fee-entries", async (req, res, next) => {
  try {
    res.json(await handlers.listFeeEntries());
  } catch (err) {
    next(err);
  }
});
app.post("/api/fee-entries", async (req, res, next) => {
  try {
    res.json(await handlers.addFeeEntry(req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/fee-entries/:id", async (req, res, next) => {
  try {
    res.json(await handlers.updateFeeEntry(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/fee-entries/:id", async (req, res, next) => {
  try {
    await handlers.deleteFeeEntry(req.params.id, req.body?.actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/holidays", async (req, res, next) => {
  try {
    res.json(await handlers.listHolidays());
  } catch (err) {
    next(err);
  }
});
app.put("/api/holidays", async (req, res, next) => {
  try {
    const { list, actingUserId } = req.body;
    res.json(await handlers.setHolidays(list, actingUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/pending-parts", async (req, res, next) => {
  try {
    res.json(await handlers.listPendingParts());
  } catch (err) {
    next(err);
  }
});
app.post("/api/pending-parts", async (req, res, next) => {
  try {
    res.json(await handlers.addPendingPart(req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/pending-parts/:id", async (req, res, next) => {
  try {
    res.json(await handlers.updatePendingPart(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/pending-parts/:id", async (req, res, next) => {
  try {
    const { actingUserId } = req.body;
    await handlers.deletePendingPart(req.params.id, actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
app.put("/api/pending-parts/:id/mark-reminder-sent", async (req, res, next) => {
  try {
    // Hatırlatma, oturum sahibinin kendisi için işaretlenir.
    res.json(await handlers.markPendingPartReminderSent(req.params.id, req.authUserId));
  } catch (err) {
    next(err);
  }
});

app.get("/api/part-checkouts", async (req, res, next) => {
  try {
    res.json(await handlers.listPartCheckouts());
  } catch (err) {
    next(err);
  }
});
app.post("/api/part-checkouts", async (req, res, next) => {
  try {
    res.json(await handlers.addPartCheckout(req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/part-checkouts/:id/reconcile", async (req, res, next) => {
  try {
    res.json(await handlers.reconcilePartCheckout(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/part-checkouts/:id", async (req, res, next) => {
  try {
    res.json(await handlers.updatePartCheckout(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/part-checkouts/:id", async (req, res, next) => {
  try {
    const { actingUserId } = req.body;
    await handlers.deletePartCheckout(req.params.id, actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.get("/api/incoming-orders", async (req, res, next) => {
  try {
    res.json(await handlers.listIncomingOrders());
  } catch (err) {
    next(err);
  }
});
app.post("/api/incoming-orders", async (req, res, next) => {
  try {
    res.json(await handlers.addIncomingOrder(req.body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/incoming-orders/:id", async (req, res, next) => {
  try {
    res.json(await handlers.updateIncomingOrder(req.params.id, req.body));
  } catch (err) {
    next(err);
  }
});
app.delete("/api/incoming-orders/:id", async (req, res, next) => {
  try {
    const { actingUserId } = req.body;
    await handlers.deleteIncomingOrder(req.params.id, actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
app.put("/api/incoming-orders/:id/mark-reminder-notified", async (req, res, next) => {
  try {
    res.json(await handlers.markIncomingOrderReminderNotified(req.params.id, req.authUserId));
  } catch (err) {
    next(err);
  }
});
app.put("/api/incoming-orders/:id/dismiss-reminder", async (req, res, next) => {
  try {
    res.json(await handlers.dismissIncomingOrderReminder(req.params.id, req.authUserId));
  } catch (err) {
    next(err);
  }
});

// iOS/Android native uygulamalarının giriş sonrası kaydettiği push bildirim
// cihaz token'ı (bkz. electron/db.js registerDeviceToken, platform alanına
// göre electron/handlers.js'teki notifyUserPush APNs/FCM'e yönlendirir).
// Mobil stok detayındaki "TV'de Göster" — masaüstündeki "Yayınla" ile aynı iş
// (VitrA görselleri, özellikler); TV'de yayınlayan olarak telefonun adı görünür.
app.post("/api/tv/broadcast", async (req, res, next) => {
  try {
    const { item, actingUserId, deviceName } = req.body;
    res.json(await handlers.broadcastToTv(item, actingUserId, String(deviceName || "").slice(0, 40) || null));
  } catch (err) {
    next(err);
  }
});
// Mobil teklif detayındaki "TV'de Göster" — toplamlar masaüstüyle aynı hesapla (computeTotals).
app.post("/api/tv/broadcast-quote", async (req, res, next) => {
  try {
    const { quoteId, actingUserId, deviceName } = req.body;
    const quote = (await handlers.listQuotes()).find((q) => q.id === quoteId);
    if (!quote) return res.status(404).json({ message: "Teklif bulunamadı." });
    const { computeTotals } = await import("../src/lib/orderTotals.js");
    const totals = computeTotals(quote.items || [], quote.discountRate);
    res.json(await handlers.broadcastQuoteToTv(quote, totals, actingUserId, String(deviceName || "").slice(0, 40) || null));
  } catch (err) {
    next(err);
  }
});
// Mobil "TV'de yayında" şeridi: bu sunucunun (telefonların) son yayını; başka bir
// bilgisayar yayın yapınca ya da durdurulunca null olur (bkz. electron/db.js TV Yayını).
app.get("/api/tv/current", (req, res) => res.json(handlers.getCurrentTvPayload() || null));
app.post("/api/tv/clear", async (req, res, next) => {
  try {
    await handlers.clearTv();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

app.post("/api/device-tokens", async (req, res, next) => {
  try {
    const { token, platform, actingUserId } = req.body;
    // Bildirim anahtarı yalnız oturum sahibinin kendisine kaydedilebilir.
    await handlers.registerDeviceToken(req.authUserId, token, platform, actingUserId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Mesajlar yalnız oturum sahibine aittir: adresteki :userId yok sayılır
// (eskiden herkes başkasının mesajlarını okuyabilirdi).
app.get("/api/messages/:userId", async (req, res, next) => {
  try {
    res.json(await handlers.listMessagesFor(req.authUserId));
  } catch (err) {
    next(err);
  }
});
app.post("/api/messages", async (req, res, next) => {
  try {
    const { recipientId, body } = req.body;
    // Gönderen her zaman oturum sahibi (başkası adına mesaj gönderilemez).
    res.json(await handlers.sendMessage(req.authUserId, recipientId, body));
  } catch (err) {
    next(err);
  }
});
app.put("/api/messages/read", async (req, res, next) => {
  try {
    const { otherUserId } = req.body;
    // Yalnız oturum sahibine gelen mesajlar okundu işaretlenebilir.
    res.json(await handlers.markMessagesRead(req.authUserId, otherUserId));
  } catch (err) {
    next(err);
  }
});

// Hata olursa JSON döndür, düz metin HTML sayfası değil.
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(400).json({ message: err.message || "Bilinmeyen hata" });
});

// Barkod okuma PWA'sı — ana React uygulamasından bağımsız, tek başına
// yüklenebilen küçük bir araç (bkz. server/public-barkod/index.html).
// Aynı /api/* uçlarını kullanır, ayrı bir backend gerektirmez.
app.use("/barkod", express.static(path.join(__dirname, "public-barkod")));

// Masaüstünün web derlemesi yalnız yerelde (Electron dışında işlevsiz; canlıda
// uygulama kodunu gereksiz yere dışarı açmasın).
if (!IS_PRODUCTION) app.use(express.static(path.join(__dirname, "..", "dist")));

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    IS_PRODUCTION
      ? `Sita Yapı API (canlı) ${PORT} portunda çalışıyor.`
      : `Telefon/tarayıcı test sunucusu: http://<bu-bilgisayarın-IP-adresi>:${PORT}`
  );
});
