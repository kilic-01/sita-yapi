import { app, BrowserWindow, WebContentsView, ipcMain, shell, dialog, powerMonitor, Menu } from "electron";
import electronUpdater from "electron-updater";
const { autoUpdater } = electronUpdater;
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import * as db from "./db.js";
import * as handlers from "./handlers.js";
import * as camera from "./camera.js";
import { IS_DEV_DB } from "./config.js";
import { encryptSecret, decryptSecret } from "./auth.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV === "development";

let mainWindow;

// Electron varsayılan olarak metin seçimi için native bir sağ-tık menüsü
// SAĞLAMAZ — Kopyala/Yapıştır/Kes/Tümünü Seç kendimiz eklemezsek sağ tık
// hiçbir şey yapmaz. "web-contents-created" TÜM webContents'e (ana pencere,
// WhatsApp/Tedarikçi WebContentsView'ları, yazdırma önizleme pencereleri)
// otomatik uygulanır, tek tek her BrowserWindow'a eklemeye gerek kalmaz.
app.on("web-contents-created", (_event, contents) => {
  contents.on("context-menu", (_e, params) => {
    const items = [];
    if (params.isEditable) {
      items.push(
        { label: "Kes", role: "cut", enabled: params.editFlags.canCut },
        { label: "Kopyala", role: "copy", enabled: params.editFlags.canCopy },
        { label: "Yapıştır", role: "paste", enabled: params.editFlags.canPaste },
        { type: "separator" },
        { label: "Tümünü Seç", role: "selectAll", enabled: params.editFlags.canSelectAll }
      );
    } else if (params.selectionText) {
      items.push({ label: "Kopyala", role: "copy" });
    }
    if (items.length === 0) return;
    Menu.buildFromTemplate(items).popup({ window: BrowserWindow.fromWebContents(contents) || undefined });
  });
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Tedarikçi/WhatsApp görünümleri, ana pencereye eklenen AYRI native
  // katmanlar (WebContentsView) — React'in normal "sekme değişti, bileşen
  // kapandı" temizliği (useEffect cleanup) SADECE React ağacı içinde kalan
  // olaylarla tetiklenir. Kullanıcı ana pencereyi TAMAMEN yeniden
  // yüklerse (force reload / Cmd+R), React hiç düzgün kapanmadan JS bağlamı
  // sıfırlanır — bu temizlik hiç çalışmaz ve o native katman ekranda
  // "sahipsiz" kalır. Bu yüzden ana pencerenin kendisi her yeniden
  // yüklendiğinde/gezindiğinde bu görünümleri doğrudan burada, ana
  // süreçte gizliyoruz — React'in devreye girmesini beklemeden.
  mainWindow.webContents.on("did-start-navigation", (_e, _url, _isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    supplierShowGeneration++;
    for (const v of supplierViews.values()) v.setVisible(false);
    activeSupplierId = null;
    whatsappView?.setVisible(false);
  });

  if (isDev) {
    mainWindow.webContents.on("console-message", (_e, _level, message) => {
      console.log(`[renderer] ${message}`);
    });
    await mainWindow.loadURL("http://localhost:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.whenReady().then(async () => {
  // Geliştirme modunda uygulama "electron ." ile çıplak çalıştığı için
  // macOS Dock'ta ve bildirimlerde kendi ikonumuz yerine jenerik Electron
  // logosu görünüyordu — paketlenmiş (build) sürümde electron-builder zaten
  // assets/icon.png'yi kullanıyor, ama dev modunda bunu elle ayarlamak
  // gerekiyor.
  if (isDev && process.platform === "darwin" && app.dock) {
    app.dock.setIcon(path.join(__dirname, "..", "assets", "icon-mac.png"));
  }

  await db.initDb(app.getPath("userData"));

  // Başka bir bilgisayardan (veya aynı bilgisayardaki başka bir örnekten)
  // veri değiştiğinde, hangi tablonun değiştiğini renderer'a iletiyoruz —
  // App.jsx bu tabloyu yeniden çekip ekranı güncel tutuyor.
  db.onChange((table) => {
    mainWindow?.webContents.send("data:changed", { table });
  });

  // Header'daki bağlantı göstergesi için — Supabase Realtime kanalının
  // durumu (bağlandı/koptu/yeniden deniyor) değiştikçe renderer'a iletilir.
  db.onSyncStatusChange((status) => {
    mainWindow?.webContents.send("sync:status", { status });
  });

  await createWindow();

  // Fire-and-forget — hiçbir şekilde açılışı bekletmez, hata olursa
  // (ör. anahtar henüz girilmemiş) sessizce loglanır (bkz. handlers.js).
  handlers.maybeAutoSyncFuelTransactions();

  camera.ensureHttpServer();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (!isDev) {
    // package.json'daki "publish" alanı (GitHub Releases, kilic-01/sita-yapi)
    // sayesinde checkForUpdatesAndNotify() açılışta GitHub'daki en son
    // sürümü kontrol eder; daha yenisi varsa indirir ve OS'in kendi native
    // bildirimini gösterip yeniden başlatınca kurar — ekstra UI kodu
    // gerekmez. Hatalar (ör. internet yok) sessizce loglanır, uygulama
    // açılışını ASLA engellemez.
    autoUpdater.on("error", (err) => console.error("Güncelleme hatası:", err.message));
    autoUpdater.on("update-available", (info) => console.log("Güncelleme mevcut:", info.version));
    autoUpdater.on("update-not-available", () => console.log("Uygulama güncel."));
    autoUpdater.on("update-downloaded", (info) =>
      console.log("Güncelleme indirildi, yeniden başlatılınca kurulacak:", info.version)
    );
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error("Güncelleme kontrolü başarısız:", err.message));
  }
});

app.on("window-all-closed", () => {
  camera.stopAll();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  camera.stopAll();
});

// ---- IPC handlers (mantık electron/handlers.js'te) ----

ipcMain.handle("env:isDevDb", () => IS_DEV_DB);

// Hareketsizlikte ekran koruyucu/otomatik kilit için — bkz. src/App.jsx.
// getSystemIdleTime() TÜM sistemdeki (sadece bu pencere değil) son fare/
// klavye hareketinden bu yana geçen saniyeyi döner.
ipcMain.handle("system:idleSeconds", () => powerMonitor.getSystemIdleTime());
ipcMain.handle("screensaver:image", () => handlers.getScreensaverImage());

ipcMain.handle("appointments:list", () => handlers.listAppointments());
ipcMain.handle("appointments:add", (_e, input) => handlers.addAppointment(input));
ipcMain.handle("appointments:update", (_e, { id, patch }) => handlers.updateAppointment(id, patch));
ipcMain.handle("appointments:delete", (_e, { id, actingUserId }) => handlers.deleteAppointment(id, actingUserId));
ipcMain.handle("appointments:setStatus", (_e, { id, status, actingUserId }) =>
  handlers.setAppointmentStatus(id, status, actingUserId)
);

ipcMain.handle("pendingParts:list", () => handlers.listPendingParts());
ipcMain.handle("pendingParts:add", (_e, input) => handlers.addPendingPart(input));
ipcMain.handle("pendingParts:update", (_e, { id, patch }) => handlers.updatePendingPart(id, patch));
ipcMain.handle("pendingParts:delete", (_e, { id, actingUserId }) => handlers.deletePendingPart(id, actingUserId));
ipcMain.handle("pendingParts:markReminderSent", (_e, { id, userId }) =>
  handlers.markPendingPartReminderSent(id, userId)
);
ipcMain.handle("partCheckouts:list", () => handlers.listPartCheckouts());
ipcMain.handle("partCheckouts:add", (_e, input) => handlers.addPartCheckout(input));
ipcMain.handle("partCheckouts:reconcile", (_e, { id, patch }) => handlers.reconcilePartCheckout(id, patch));
ipcMain.handle("partCheckouts:update", (_e, { id, patch }) => handlers.updatePartCheckout(id, patch));
ipcMain.handle("partCheckouts:delete", (_e, { id, actingUserId }) => handlers.deletePartCheckout(id, actingUserId));
ipcMain.handle("appointments:reassign", (_e, { id, technicianId, actingUserId }) =>
  handlers.reassignAppointment(id, technicianId, actingUserId)
);
ipcMain.handle("appointments:holdForLeave", (_e, { id, actingUserId }) =>
  handlers.holdAppointmentForLeave(id, actingUserId)
);

ipcMain.handle("technicians:list", () => handlers.listTechnicians());
ipcMain.handle("technicians:set", (_e, { list, actingUserId }) => handlers.setTechnicians(list, actingUserId));

ipcMain.handle("officeStaff:list", () => handlers.listOfficeStaff());
ipcMain.handle("officeStaff:set", (_e, { list, actingUserId }) => handlers.setOfficeStaff(list, actingUserId));

ipcMain.handle("holidays:list", () => handlers.listHolidays());
ipcMain.handle("holidays:set", (_e, { list, actingUserId }) => handlers.setHolidays(list, actingUserId));

ipcMain.handle("vehicles:list", () => handlers.listVehicles());
ipcMain.handle("vehicles:set", (_e, { list, actingUserId }) => handlers.setVehicles(list, actingUserId));

ipcMain.handle("settings:get", () => handlers.getSettings());
ipcMain.handle("settings:update", (_e, { patch, actingUserId }) => handlers.updateSettings(patch, actingUserId));

ipcMain.handle("routes:build", (_e, { scheduledDate, actingUserId }) =>
  handlers.buildRoutes(scheduledDate, actingUserId)
);

ipcMain.handle("shop:location", () => handlers.getShopLocation());
ipcMain.handle("sales:add", (_e, input) => handlers.addSale(input));

ipcMain.handle("maps:getApiKey", () => handlers.getGoogleMapsApiKeyForClient());
ipcMain.handle("maps:getUsageCount", () => handlers.getMapUsageCount());
ipcMain.handle("maps:incrementUsageCount", () => handlers.incrementMapUsageCount());

ipcMain.handle("fuel:sync", (_e, { actingUserId }) => handlers.syncFuelTransactions(actingUserId));
ipcMain.handle("fuel:list", () => handlers.listFuelTransactions());
ipcMain.handle("fuel:devices:list", () => handlers.listFuelDevices());

ipcMain.handle("users:list", () => handlers.listUsers());
ipcMain.handle("users:add", (_e, { name, password, role, hiddenTabs, actingUserId }) =>
  handlers.addUser(name, password, role, hiddenTabs, actingUserId)
);
ipcMain.handle("users:update", (_e, { id, patch, actingUserId }) => handlers.updateUser(id, patch, actingUserId));
ipcMain.handle("users:delete", (_e, { id, actingUserId }) => handlers.deleteUser(id, actingUserId));
ipcMain.handle("auth:login", (_e, { name, password }) => handlers.login(name, password));

// "Beni Hatırla" işaretliyken localStorage'a yazılan rememberedUserId,
// Chromium tarafından periyodik/boşta kaldığında diske yazılıyor — kullanıcı
// giriş yaptıktan hemen sonra uygulamayı kapatırsa (özellikle ilk kurulumda
// hemen denerken) bu yazma diske YANSIMADAN kaybolabiliyordu, bir sonraki
// açılışta "beni hatırla" hiç çalışmamış gibi görünüyordu. Renderer, ilgili
// localStorage.setItem'dan HEMEN SONRA bunu çağırıp yazmayı zorla diske
// yazdırıyor.
ipcMain.handle("app:flushStorage", () => mainWindow?.webContents.session.flushStorageData());

ipcMain.handle("activityLog:list", (_e, opts) => handlers.listActivityLog(opts));

// Doğrudan yazıcıya göndermek yerine, önce Chromium'un kendi PDF
// görüntüleyicisinde (kendi yazdırma/yakınlaştırma araç çubuğu dahil) bir
// önizleme penceresi açar — kullanıcı yazdırmadan önce sonucu tam olarak
// görsün diye. İşletim sistemi yazıcı diyalogları (özellikle Windows'ta)
// önizleme göstermeyebiliyor, bu yüzden önizlemeyi kendimiz sağlıyoruz.
ipcMain.handle("print:current", async (_e, opts) => {
  // Yatay (rota) çıktısında içerik artık TEK, doğal akışta uzayan bir kutu
  // (bkz. PrintView.jsx/styles.css'teki notlar) — kutunun kendi padding'i
  // sadece en baştaki/en sondaki fiziksel sayfaya uygulanır, aradaki
  // sayfalara değil. Bu yüzden kenar boşluğunu Chromium'un NATIVE sayfa
  // marjini belirliyor (~15mm ≈ 0.6in), her fiziksel sayfada tutarlı kalsın
  // diye. Diğer (dikey, tek sayfalık) çıktılar hâlâ marginType:"none" +
  // kendi CSS padding'ini kullanıyor — bkz. quotes:generatePdf'teki not.
  const buffer = await mainWindow.webContents.printToPDF({
    pageSize: "A4",
    landscape: Boolean(opts?.landscape),
    margins: opts?.landscape
      ? { marginType: "custom", top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }
      : { marginType: "none" },
    printBackground: true,
  });
  const fs = await import("node:fs/promises");
  const tempPath = path.join(app.getPath("temp"), `sita-yazdirma-onizleme-${Date.now()}.pdf`);
  await fs.writeFile(tempPath, buffer);

  const previewWindow = new BrowserWindow({
    width: 900,
    height: 1000,
    parent: mainWindow,
    title: "Yazdırma Önizleme",
  });
  await previewWindow.loadURL(`file://${tempPath}`);
});

ipcMain.handle("quotes:list", () => handlers.listQuotes());
ipcMain.handle("quotes:add", (_e, input) => handlers.addQuote(input));
ipcMain.handle("quotes:update", (_e, { id, patch }) => handlers.updateQuote(id, patch));
ipcMain.handle("quotes:delete", (_e, { id, actingUserId }) => handlers.deleteQuote(id, actingUserId));

ipcMain.handle("incomingOrders:list", () => handlers.listIncomingOrders());
ipcMain.handle("incomingOrders:add", (_e, input) => handlers.addIncomingOrder(input));
ipcMain.handle("incomingOrders:update", (_e, { id, patch }) => handlers.updateIncomingOrder(id, patch));
ipcMain.handle("incomingOrders:delete", (_e, { id, actingUserId }) =>
  handlers.deleteIncomingOrder(id, actingUserId)
);
ipcMain.handle("incomingOrders:markReminderNotified", (_e, { id, userId }) =>
  handlers.markIncomingOrderReminderNotified(id, userId)
);
ipcMain.handle("incomingOrders:dismissReminder", (_e, { id, userId }) =>
  handlers.dismissIncomingOrderReminder(id, userId)
);

ipcMain.handle("messages:listFor", (_e, userId) => handlers.listMessagesFor(userId));
ipcMain.handle("messages:send", (_e, { senderId, recipientId, body }) =>
  handlers.sendMessage(senderId, recipientId, body)
);
ipcMain.handle("messages:markRead", (_e, { currentUserId, otherUserId }) =>
  handlers.markMessagesRead(currentUserId, otherUserId)
);
ipcMain.handle("messages:delete", (_e, { id, actingUserId }) => handlers.deleteMessage(id, actingUserId));

// O an ekranda gösterilen ".print-page" (teklif önizlemesi) içeriğini,
// gerçek bir yazıcı yerine dosyaya "yazdırır" — printCurrent ile aynı
// @media print CSS kurallarını kullanır, ekstra gizli pencereye gerek yok.
ipcMain.handle("quotes:generatePdf", async (_e, { defaultFileName }) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultFileName || "Teklif.pdf",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (canceled || !filePath) return null;
  // marginType "none" olmadan Chromium kendi varsayılan sayfa kenar
  // boşluğunu bizim ".print-page" içindeki 15mm padding'in ÜSTÜNE ekliyordu
  // — bu da özellikle sayfanın üstünde beklenenden çok daha fazla boşluk
  // olarak görünüyordu. Artık boşluğu tamamen kendi CSS'imiz belirliyor.
  const buffer = await mainWindow.webContents.printToPDF({
    pageSize: "A4",
    margins: { marginType: "none" },
    printBackground: true,
  });
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, buffer);
  return filePath;
});

// Ayarlar > Güvenlik'teki "Tüm Veriyi Yedekle" butonu — Supabase Pro'nun
// kendi otomatik günlük yedeğine ek, admin'in istediği an elinde hazır
// ikinci bir güvenlik ağı. Tüm tabloları tek bir zaman damgalı JSON
// dosyası olarak indirir.
ipcMain.handle("backup:export", async () => {
  const defaultName = `sita-yapi-yedek-${new Date().toISOString().slice(0, 10)}.json`;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (canceled || !filePath) return null;
  const backup = await handlers.exportAllTables();
  const fs = await import("node:fs/promises");
  await fs.writeFile(filePath, JSON.stringify(backup, null, 2));
  return filePath;
});

// Bilgisayarın varsayılan mail programını, müşterinin adresi ve hazır
// konu/metinle açar; PDF'i de Finder'da/Gezgin'de gösterir ki kullanıcı
// sürükleyip eke ekleyebilsin (gerçek SMTP bağlantısı olmadan otomatik
// dosya eklemek mümkün değil).
ipcMain.handle("quotes:openMailClient", (_e, { email, subject, body, pdfPath }) => {
  const params = new URLSearchParams({ subject: subject || "", body: body || "" });
  shell.openExternal(`mailto:${encodeURIComponent(email || "")}?${params.toString()}`);
  if (pdfPath) shell.showItemInFolder(pdfPath);
});

// wa.me linkiyle müşterinin WhatsApp sohbetini hazır bir metinle açar;
// PDF eki (WhatsApp'ın dosya-ekleme API'si olmadığı için) yine Finder'da
// gösterilir, kullanıcı elle sürükleyip ekler.
ipcMain.handle("quotes:openWhatsapp", (_e, { phone, text, pdfPath }) => {
  const digits = String(phone || "").replace(/\D/g, "");
  const withCountryCode = digits.startsWith("90") ? digits : `90${digits.replace(/^0/, "")}`;
  shell.openExternal(`https://wa.me/${withCountryCode}?text=${encodeURIComponent(text || "")}`);
  if (pdfPath) shell.showItemInFolder(pdfPath);
});

// ---------- Kameralar (birden çok DVR/konum) ----------

ipcMain.handle("cameras:getSettings", () => handlers.getCameraSettings());

ipcMain.handle("cameras:updateSettings", (_e, { list, actingUserId }) => {
  const prepared = list.map((dvr) => {
    const { password, hasCredentials, ...rest } = dvr;
    if (!rest.id) rest.id = crypto.randomUUID();
    if (password) {
      rest.passwordEncryptedNew = encryptSecret(password);
    }
    return rest;
  });
  return handlers.updateCameraSettings(prepared, actingUserId);
});

// RTSP URL'si (kullanıcı adı/şifre dahil) hiçbir zaman renderer'a gitmez —
// sadece burada, main process içinde oluşturulup ffmpeg'e verilir; renderer
// yalnızca yerel HLS adresini (127.0.0.1) alır. Aynı kanal numarası birden
// çok DVR'da tekrar edebileceği için dvrId+channelId birleşik anahtar olarak
// kullanılır (camera.js'e opak bir dize olarak geçer).
ipcMain.handle("cameras:start", async (_e, { dvrId, channelId }) => {
  const list = await db.getCameraList();
  const dvr = list.find((d) => d.id === dvrId);
  const rtspUrl = buildCameraRtspUrl(dvr, channelId);
  if (!rtspUrl) throw new Error("Kamera ayarları henüz yapılandırılmadı (Ayarlar > Kameralar).");
  return camera.startChannel(`${dvrId}:${channelId}`, rtspUrl);
});

ipcMain.handle("cameras:stop", (_e, { dvrId, channelId }) => {
  camera.stopChannel(`${dvrId}:${channelId}`);
});

// tel: linkini işletim sistemine devreder — macOS'ta Continuity Calls
// (bağlı iPhone) üzerinden, Windows'ta Phone Link üzerinden arama başlatır.
ipcMain.handle("system:callPhone", (_e, phoneNumber) => {
  const digits = String(phoneNumber || "").replace(/[^\d+]/g, "");
  if (!digits) throw new Error("Geçerli bir telefon numarası yok");
  return shell.openExternal(`tel:${digits}`);
});

ipcMain.handle("depots:list", () => handlers.listDepots());
ipcMain.handle("depots:set", (_e, { list, actingUserId }) => handlers.setDepots(list, actingUserId));

ipcMain.handle("stock:list", () => handlers.listStockItems());
ipcMain.handle("stock:set", (_e, { list, actingUserId }) => handlers.setStockItems(list, actingUserId));
ipcMain.handle("stock:add", (_e, { item, actingUserId }) => handlers.addStockItem(item, actingUserId));
ipcMain.handle("stock:update", (_e, { id, patch, actingUserId }) =>
  handlers.updateStockItem(id, patch, actingUserId)
);
ipcMain.handle("stock:delete", (_e, { id, actingUserId }) => handlers.deleteStockItem(id, actingUserId));

ipcMain.handle("suppliers:list", () => handlers.listSuppliers());

// Renderer, kaydedilecek satırlarda düz metin "password" alanı gönderirse
// (kullanıcı yeni bir şifre yazdıysa) burada, veritabanına yazılmadan ÖNCE
// paylaşılan sabit anahtarla (bkz. electron/auth.js encryptSecret) şifreleriz
// — böylece herhangi bir şirket bilgisayarında girilen kimlik bilgisi,
// senkronlandığı diğer TÜM bilgisayarlarda da çözülüp kullanılabilir. Düz
// metin şifre hiçbir zaman veritabanına yazılmaz.
ipcMain.handle("suppliers:set", (_e, { list, actingUserId }) => {
  const prepared = list.map((s) => {
    const { password, hasCredentials, ...rest } = s;
    if (password) {
      rest.passwordEncryptedNew = encryptSecret(password);
    }
    return rest;
  });
  return handlers.setSuppliers(prepared, actingUserId);
});

// Tedarikçi B2B sitelerini ayrı bir tarayıcı açmadan, pencerenin içine gömülü
// görünümler olarak gösterir (WebContentsView) — kullanıcı kendi hesabıyla
// normal şekilde giriş yapıp sipariş verir, biz şifreye hiç erişmeyiz.
//
// Eskiden TEK paylaşılan bir görünüm vardı; her arama isteğinde sıfırdan
// giriş yapılıp beklenirdi. Artık tedarikçi başına KALICI bir görünüm var —
// uygulama girişinde arka planda önceden giriş yapılıp (bkz. "suppliers:warmAll")
// açık bırakılıyor, arama anında sadece hedef adrese geçiliyor (anında).
const supplierViews = new Map(); // supplierId -> WebContentsView
const supplierInfoById = new Map(); // supplierId -> { url, username, passwordEncrypted }
let activeSupplierId = null; // o an EKRANDA gösterilen tedarikçi

function attemptAutofillFor(supplierId) {
  const view = supplierViews.get(supplierId);
  const info = supplierInfoById.get(supplierId);
  if (!view || !info?.username || !info?.passwordEncrypted) return;
  let password;
  try {
    password = decryptSecret(info.passwordEncrypted);
  } catch {
    // Kayıtlı şifre çözülemiyor — artık paylaşılan sabit anahtar kullanıldığı
    // için bu SADECE bozulmuş/eski (eski safeStorage döneminden kalma)
    // veride olur. KURTARILAMAZ — kullanıcının o tedarikçi için şifreyi
    // Ayarlar > Tedarikçiler'den YENİDEN girmesi gerekiyor. Sadece o an
    // EKRANDA GÖSTERİLEN tedarikçi içinse bildiriyoruz — arka planda
    // ısıtılan/canlı tutulan görünmeyen bir tedarikçi için sessiz kalıyoruz,
    // kullanıcı bakmadığı bir şey için hata görmesin.
    if (supplierId === activeSupplierId) {
      mainWindow?.webContents.send("suppliers:autofillFailed", { supplierId, reason: "undecryptable" });
    }
    return;
  }
  const script = buildAutofillScript(info.username, password);
  const run = () => view.webContents.executeJavaScript(script).catch(() => {});
  run();
  setTimeout(run, 500);
}

async function ensureSupplierWarmView(supplierId) {
  if (supplierViews.has(supplierId)) return supplierViews.get(supplierId);
  const supplier = await db.getSupplierById(supplierId);
  if (!supplier) return null;
  supplierInfoById.set(supplierId, {
    url: supplier.url,
    username: supplier.username,
    passwordEncrypted: supplier.passwordEncrypted,
  });

  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.contentView.addChildView(view);
  view.setVisible(false);
  supplierViews.set(supplierId, view);

  view.webContents.on("did-finish-load", () => attemptAutofillFor(supplierId));
  // Otomatik giriş script'i, alan bulamadığında (ör. sitenin formu JS ile
  // sonradan render ettiği/işaretleyicilerin uymadığı durumlarda) bunu
  // console.log ile bildirir. Sadece o an EKRANDA GÖSTERİLEN tedarikçi için
  // arayüze iletiyoruz — arka plan ısıtma/canlı-tutma yenilemelerinde bu
  // normal (zaten girişliyken form aranmaz) durum YANLIŞ ALARM olmasın.
  view.webContents.on("console-message", (_event, _level, message) => {
    if (message === "SITA_AUTOFILL_NOFIELD" && supplierId === activeSupplierId) {
      mainWindow?.webContents.send("suppliers:autofillFailed", { supplierId });
    }
  });

  if (supplier.url) {
    await view.webContents.loadURL(supplier.url).catch(() => {});
    attemptAutofillFor(supplierId);
    await waitForLoginSettle(view.webContents, 7000);
  }
  return view;
}

// Bir kullanıcı adı/şifre alanı bulup dolduran, sonra formu göndermeye
// çalışan basit bir otomatik-giriş denemesi (parola yöneticilerinin
// yaptığına benzer). Sitede zaten dolu bir şifre alanı varsa dokunmaz.
// Giriş formu sayfa yüklendiğinde hemen DOM'da olmayabilir (SPA siteler
// formu JS ile sonradan render eder) — bu yüzden ilk denemeden sonra bir
// MutationObserver ile DOM değişikliklerini izleyip alan belirdiği an
// tekrar dener (en fazla 10 saniye). Hâlâ alan bulunamazsa (ör. site
// gerçekten değişmiş/2FA istiyor) sessizce pes etmek yerine bunu
// console.log ile bildirir ki ana süreç kullanıcıya haber verebilsin.
function buildAutofillScript(username, password) {
  return `(function(){
    try {
      if (window.__sitaAutofillStarted) return;
      window.__sitaAutofillStarted = true;

      var USERNAME = ${JSON.stringify(username)};
      var PASSWORD = ${JSON.stringify(password)};

      function setValue(el, value) {
        var proto = Object.getPrototypeOf(el);
        var setter = Object.getOwnPropertyDescriptor(proto, "value").set;
        setter.call(el, value);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }

      function findPasswordField() {
        return document.querySelector(
          'input[type="password"], input[name*="sifre" i], input[name*="pass" i], input[id*="sifre" i], input[id*="pass" i]'
        );
      }

      function findUsernameField(scope) {
        return scope.querySelector(
          'input[type="email"], input[type="text"], input[type="tel"], ' +
          'input[name*="user" i], input[name*="mail" i], input[name*="kullanici" i], input[name*="login" i], ' +
          'input[id*="user" i], input[id*="mail" i], input[id*="kullanici" i], input[id*="login" i]'
        );
      }

      function findSubmit(scope) {
        var btn = scope.querySelector('button[type="submit"], input[type="submit"]');
        if (btn) return btn;
        var candidates = scope.querySelectorAll('button, [role="button"], a.btn, input[type="button"]');
        for (var i = 0; i < candidates.length; i++) {
          var text = (candidates[i].textContent || candidates[i].value || "").trim().toLowerCase();
          if (/giri\\u015f|login|oturum a\\u00e7|g\\u00f6nder|sign in/.test(text)) return candidates[i];
        }
        return null;
      }

      function attempt() {
        var passField = findPasswordField();
        if (!passField || passField.value) return false;
        var form = passField.closest("form");
        var userField = findUsernameField(form || document);
        if (userField) setValue(userField, USERNAME);
        setValue(passField, PASSWORD);
        setTimeout(function () {
          var submitBtn = findSubmit(form || document);
          if (submitBtn) submitBtn.click();
          else if (form) form.submit();
          else passField.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
        }, 300);
        return true;
      }

      if (attempt()) {
        console.log("SITA_AUTOFILL_OK");
        return;
      }

      var done = false;
      var observer = new MutationObserver(function () {
        if (done) return;
        if (attempt()) {
          done = true;
          observer.disconnect();
          console.log("SITA_AUTOFILL_OK");
        }
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(function () {
        if (done) return;
        observer.disconnect();
        console.log("SITA_AUTOFILL_NOFIELD");
      }, 6000);
    } catch (e) {
      console.log("SITA_AUTOFILL_ERROR " + (e && e.message));
    }
  })();`;
}

// Bir "webContents"in gerçekten başka bir sayfaya geçmesini (örn. giriş
// formu gönderildikten sonra oturum açılmış sayfaya yönlenme) ya da en
// fazla `timeoutMs` süre geçmesini bekler — hangisi önce olursa. Sabit,
// yetersiz bir bekleme (eskiden 1.5sn) yüzünden giriş henüz tamamlanmadan
// arama adresine geçiliyor, bu da kullanıcının giriş sayfasında "takılı
// kalmış" görmesine yol açıyordu.
function waitForLoginSettle(webContents, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    function finish() {
      if (done) return;
      done = true;
      webContents.removeListener("did-navigate", onNav);
      webContents.removeListener("did-navigate-in-page", onNav);
      resolve();
    }
    function onNav() {
      finish();
    }
    webContents.once("did-navigate", onNav);
    webContents.once("did-navigate-in-page", onNav);
    setTimeout(finish, timeoutMs);
  });
}

// "suppliers:show" akışı (fallback durumunda ana sayfada giriş bekleme +
// hedefe geçiş + gerekirse tekrar deneme) birkaç saniye sürebilir. Kullanıcı
// bu sürede BAŞKA bir sekmeye geçip görüntüleyiciyi kapatırsa (hideSupplier),
// bu numarayı artırıyoruz — böylece o an hâlâ devam eden ESKİ bir "show"
// işleminin geç gelen adımları (ör. tekrar loadURL) hiçbir şey yapmadan
// sessizce iptal olur, görüntüleyici ekranda "takılı" kalmaz.
let supplierShowGeneration = 0;

// Uygulamaya giriş yapıldıktan sonra RENDERER tarafından çağrılır — kayıtlı
// kullanıcı adı/şifresi olan tüm tedarikçiler için arka planda görünüm
// oluşturup önceden giriş yapar, kullanıcı hiçbir şey aramadan ÖNCE siteler
// zaten hazır olsun diye. Zaten ısınmış (supplierViews'ta olan) tedarikçilere
// dokunmaz — bu yüzden ekran koruyucudan çıkıp tekrar giriş yapıldığında
// (günde onlarca kez olabilir) tekrar çağrılsa bile ucuz/zararsızdır.
// Handler ısıtmanın BİTMESİNİ beklemez (fire-and-forget) — renderer'ı
// bloklamadan arka planda devam eder.
ipcMain.handle("suppliers:warmAll", async () => {
  const suppliers = await db.getSuppliers();
  const targets = suppliers.filter((s) => s.hasCredentials && s.url && !supplierViews.has(s.id));
  Promise.all(targets.map((s) => ensureSupplierWarmView(s.id).catch(() => {})));
  return true;
});

// Tedarikçi panellerinin sunucu tarafı hareketsizlik zaman aşımıyla
// kendiliğinden çıkış yapmasını önlemek için, o an EKRANDA GÖSTERİLMEYEN
// (arka planda bekleyen) her ısınmış tedarikçi görünümünü belirli
// aralıklarla kendi ana sayfasına yeniden yükler — bu "did-finish-load"
// üzerinden otomatik autofill'i tetikler: oturum hâlâ açıksa giriş formu
// bulunamaz (normal/beklenen), oturum gerçekten düşmüşse otomatik olarak
// yeniden giriş yapılır. 8 dakika, tipik bayi paneli oturum sürelerine
// (genelde 15-30 dk hareketsizlik) güvenli bir pay bırakır.
const SUPPLIER_KEEPALIVE_INTERVAL_MS = 8 * 60 * 1000;
setInterval(() => {
  for (const [supplierId, view] of supplierViews) {
    if (supplierId === activeSupplierId) continue;
    const info = supplierInfoById.get(supplierId);
    if (!info?.url) continue;
    view.webContents.loadURL(info.url).catch(() => {});
  }
}, SUPPLIER_KEEPALIVE_INTERVAL_MS);

ipcMain.handle("suppliers:show", async (_e, { url, bounds, supplierId }) => {
  if (!/^https?:\/\//i.test(url)) throw new Error("Geçersiz adres");
  const myGeneration = ++supplierShowGeneration;
  activeSupplierId = supplierId;

  // Aynı anda sadece bir tedarikçi görünsün diye diğer tüm (arka planda
  // ısınmış) görünümleri gizliyoruz.
  for (const [id, v] of supplierViews) {
    if (id !== supplierId) v.setVisible(false);
  }

  // Normalde bu tedarikçi zaten "warmAll" ile önceden ısıtılmış/giriş
  // yapılmıştır. Henüz ısınmamışsa (ör. ısıtma bitmeden arama yapıldıysa)
  // burada anlık oluşturup giriş turunu bekleriz — eski temkinli davranış.
  const view = await ensureSupplierWarmView(supplierId);
  if (!view) throw new Error("Tedarikçi bulunamadı");
  if (myGeneration !== supplierShowGeneration) return;

  view.setBounds(bounds);
  view.setVisible(true);

  const info = supplierInfoById.get(supplierId);
  const hasCreds = !!(info?.username && info?.passwordEncrypted);

  if (view.webContents.getURL() === url) {
    attemptAutofillFor(supplierId);
    return;
  }

  await view.webContents.loadURL(url).catch(() => {});
  if (myGeneration !== supplierShowGeneration) return;

  // Hedef (arama) sayfası da oturum istiyorsa — ör. arka planda ısıtılan
  // oturum bu sırada düşmüşse — "did-finish-load" otomatik autofill'i
  // orada da dener, ama giriş sonrası site kendi iç yönlendirmesine
  // (genelde panelin ana sayfası) gider, ARADIĞIMIZ ARAMA SONUCUNA DEĞİL.
  // Kısa bir "yerleş" bekleyip URL hâlâ hedef değilse tek seferlik bir daha
  // deniyoruz — bu noktada oturum gerçekten açılmış olacağı için ikinci
  // deneme hedefte kalıcı olur.
  if (hasCreds) {
    await waitForLoginSettle(view.webContents, 4000);
    if (myGeneration !== supplierShowGeneration) return;
    if (view.webContents.getURL() !== url) {
      view.webContents.loadURL(url).catch(() => {});
    }
  }
});

ipcMain.handle("suppliers:setBounds", (_e, bounds) => {
  supplierViews.get(activeSupplierId)?.setBounds(bounds);
});

ipcMain.handle("suppliers:hide", () => {
  supplierShowGeneration++;
  supplierViews.get(activeSupplierId)?.setVisible(false);
  activeSupplierId = null;
});

ipcMain.handle("suppliers:reload", () => {
  supplierViews.get(activeSupplierId)?.webContents.reload();
});

// WhatsApp Web'i uygulama içinde göstermek için — tedarikçi görüntüleyicisiyle
// (supplierView) AYNI mantık: tek, yeniden kullanılan bir WebContentsView,
// dock açıldığında görünür/konumlandırılır, kapatıldığında gizlenir. Varsayılan
// (kalıcı) oturum kullanılır, bu sayede QR kod ile bir kez giriş yapıldıktan
// sonra oturum uygulama yeniden başlatılsa da açık kalır (tıpkı gerçek bir
// tarayıcıdaki WhatsApp Web gibi).
let whatsappView = null;

function ensureWhatsAppView() {
  if (!whatsappView) {
    whatsappView = new WebContentsView({
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    mainWindow.contentView.addChildView(whatsappView);
    // WhatsApp Web, varsayılan Electron User-Agent'ındaki "Electron/x.y.z"
    // imzasını görünce "desteklenmeyen tarayıcı" hatası gösteriyor — bu
    // yüzden aynı Chromium sürümüne sahip standart bir Chrome UA'sıyla
    // taklit ediyoruz (bkz. process.versions.chrome).
    whatsappView.webContents.setUserAgent(
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`
    );
    whatsappView.webContents.on("did-fail-load", (_e, code, description) => {
      console.error("WhatsApp Web yüklenemedi:", code, description);
    });
    whatsappView.webContents.loadURL("https://web.whatsapp.com");
  }
  return whatsappView;
}

ipcMain.handle("whatsapp:show", (_e, bounds) => {
  const view = ensureWhatsAppView();
  view.setBounds(bounds);
  view.setVisible(true);
});

ipcMain.handle("whatsapp:setBounds", (_e, bounds) => {
  whatsappView?.setBounds(bounds);
});

ipcMain.handle("whatsapp:hide", () => {
  whatsappView?.setVisible(false);
});

// WhatsApp Web'in kendi PWA/service-worker tabanlı "çıkış yap" akışı,
// gömülü bir görünümde bazen tamamlanmadan (QR ekranına dönmeden) takılı
// kalabiliyor — bu WhatsApp'ın kendi istemci koduyla ilgili, bizim
// tarafımızdan düzeltilemiyor. Kullanıcıya elle bir "Yenile" seçeneği
// vererek bu durumu kolayca aşmasını sağlıyoruz.
ipcMain.handle("whatsapp:reload", () => {
  whatsappView?.webContents.reload();
});

function buildSearchUrl(rawUrl, code) {
  let url = rawUrl.trim().replace("{kod}", encodeURIComponent(code));
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  return url;
}

function decryptSupplierPassword(supplier) {
  if (!supplier?.passwordEncrypted) return null;
  try {
    return decryptSecret(supplier.passwordEncrypted);
  } catch {
    return null;
  }
}

// DVR'ın XMEye-uyumlu RTSP yolu: Hikvision tarzı /h264/ch{N}/main/av_stream
// (depoda gerçek cihaz üzerinde denenip doğrulanmış URL kalıbı).
function buildCameraRtspUrl(config, channelId) {
  if (!config?.host) return null;
  const password = config.passwordEncrypted
    ? (() => {
        try {
          return decryptSecret(config.passwordEncrypted);
        } catch {
          return null;
        }
      })()
    : null;
  const auth = config.username ? `${encodeURIComponent(config.username)}:${encodeURIComponent(password || "")}@` : "";
  const port = config.port || 554;
  return `rtsp://${auth}${config.host}:${port}/h264/ch${channelId}/main/av_stream`;
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

// Bir arama sonucu sayfasında ürün bulunup bulunmadığını, adını ve fiyatını
// tahmin etmeye çalışan basit bir sezgisel okuyucu. Kesin değil — sitenin
// yapısına göre yanlış/eksik sonuç verebilir. Kullanıcı bu riski bilerek kabul
// etti (bkz. konuşma), bu yüzden burada gerçek bir "scraping" yapıyoruz.
const EXTRACTION_SCRIPT = `(function () {
  try {
    var text = document.body ? document.body.innerText : "";
    var lower = text.toLocaleLowerCase("tr");
    var notFoundPatterns = [
      "sonuç bulunamadı", "sonuc bulunamadi", "ürün bulunamadı", "urun bulunamadi",
      "kayıt bulunamadı", "no results", "hiçbir sonuç", "sonuç yok", "aramanızla eşleşen"
    ];
    var notFound = notFoundPatterns.some(function (p) { return lower.indexOf(p) !== -1; });
    if (notFound) return { found: false };

    var priceMatch = text.match(/(\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d{2})?)\\s*(?:₺|TL|TRY)/i);
    var selectors = [
      '[class*="product" i]', '[class*="urun" i]', '[class*="ürün" i]',
      '[class*="item" i]', '[class*="card" i]', '[class*="result" i]', '[class*="sonuc" i]'
    ];
    var title = null;
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.innerText && el.innerText.trim().length > 2) {
        title = el.innerText.trim().slice(0, 140);
        break;
      }
    }
    return { found: true, title: title, price: priceMatch ? priceMatch[0] : null };
  } catch (e) {
    return { found: null };
  }
})();`;

async function checkSupplierForCode(supplier, code) {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const searchUrl = buildSearchUrl(supplier.searchUrlTemplate, code);

  try {
    const password = decryptSupplierPassword(supplier);
    if (supplier.username && password) {
      await withTimeout(win.loadURL(buildSearchUrl(supplier.url, "")), 10000).catch(() => {});
      await win.webContents.executeJavaScript(buildAutofillScript(supplier.username, password)).catch(() => {});
      await waitForLoginSettle(win.webContents, 7000);
    }

    await withTimeout(win.loadURL(searchUrl), 10000);
    await new Promise((r) => setTimeout(r, 1200));
    const result = await withTimeout(win.webContents.executeJavaScript(EXTRACTION_SCRIPT), 8000);
    return { supplierId: supplier.id, supplierName: supplier.name, url: searchUrl, ...result };
  } catch {
    return { supplierId: supplier.id, supplierName: supplier.name, url: searchUrl, found: null };
  } finally {
    win.destroy();
  }
}

ipcMain.handle("suppliers:searchAll", async (_e, { code }) => {
  const allSuppliers = await db.getSuppliers();
  const targets = allSuppliers.filter((s) => s.url && s.searchUrlTemplate);
  const withCreds = await Promise.all(targets.map(async (s) => (await db.getSupplierById(s.id)) || s));
  return Promise.all(withCreds.map((s) => checkSupplierForCode(s, code)));
});
