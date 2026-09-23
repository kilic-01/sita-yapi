const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  isDevDb: () => ipcRenderer.invoke("env:isDevDb"),
  getSystemIdleSeconds: () => ipcRenderer.invoke("system:idleSeconds"),
  getScreensaverImage: () => ipcRenderer.invoke("screensaver:image"),

  listAppointments: () => ipcRenderer.invoke("appointments:list"),
  addAppointment: (input) => ipcRenderer.invoke("appointments:add", input),
  updateAppointment: (id, patch) =>
    ipcRenderer.invoke("appointments:update", { id, patch }),
  deleteAppointment: (id, actingUserId) => ipcRenderer.invoke("appointments:delete", { id, actingUserId }),
  setAppointmentStatus: (id, status, actingUserId) =>
    ipcRenderer.invoke("appointments:setStatus", { id, status, actingUserId }),
  reassignAppointment: (id, technicianId, actingUserId) =>
    ipcRenderer.invoke("appointments:reassign", { id, technicianId, actingUserId }),
  holdAppointmentForLeave: (id, actingUserId) =>
    ipcRenderer.invoke("appointments:holdForLeave", { id, actingUserId }),

  listPendingParts: () => ipcRenderer.invoke("pendingParts:list"),
  addPendingPart: (input) => ipcRenderer.invoke("pendingParts:add", input),
  updatePendingPart: (id, patch) => ipcRenderer.invoke("pendingParts:update", { id, patch }),
  deletePendingPart: (id, actingUserId) => ipcRenderer.invoke("pendingParts:delete", { id, actingUserId }),
  markPendingPartReminderSent: (id, userId) =>
    ipcRenderer.invoke("pendingParts:markReminderSent", { id, userId }),

  listPartCheckouts: () => ipcRenderer.invoke("partCheckouts:list"),
  addPartCheckout: (input) => ipcRenderer.invoke("partCheckouts:add", input),
  reconcilePartCheckout: (id, patch) => ipcRenderer.invoke("partCheckouts:reconcile", { id, patch }),
  updatePartCheckout: (id, patch) => ipcRenderer.invoke("partCheckouts:update", { id, patch }),
  deletePartCheckout: (id, actingUserId) => ipcRenderer.invoke("partCheckouts:delete", { id, actingUserId }),

  listTechnicians: () => ipcRenderer.invoke("technicians:list"),
  setTechnicians: (list, actingUserId) => ipcRenderer.invoke("technicians:set", { list, actingUserId }),

  listOfficeStaff: () => ipcRenderer.invoke("officeStaff:list"),
  setOfficeStaff: (list, actingUserId) => ipcRenderer.invoke("officeStaff:set", { list, actingUserId }),

  listHolidays: () => ipcRenderer.invoke("holidays:list"),
  setHolidays: (list, actingUserId) => ipcRenderer.invoke("holidays:set", { list, actingUserId }),

  listVehicles: () => ipcRenderer.invoke("vehicles:list"),
  setVehicles: (list, actingUserId) => ipcRenderer.invoke("vehicles:set", { list, actingUserId }),

  getSettings: (actingUserId) => ipcRenderer.invoke("settings:get", actingUserId),
  updateSettings: (patch, actingUserId) => ipcRenderer.invoke("settings:update", { patch, actingUserId }),

  buildRoutes: (scheduledDate, actingUserId) =>
    ipcRenderer.invoke("routes:build", { scheduledDate, actingUserId }),

  getShopLocation: () => ipcRenderer.invoke("shop:location"),
  addSale: (input) => ipcRenderer.invoke("sales:add", input),
  getGoogleMapsApiKey: () => ipcRenderer.invoke("maps:getApiKey"),
  getIdleLockConfig: () => ipcRenderer.invoke("settings:getIdleLockConfig"),
  getMapUsageCount: () => ipcRenderer.invoke("maps:getUsageCount"),
  incrementMapUsageCount: () => ipcRenderer.invoke("maps:incrementUsageCount"),

  syncFuelTransactions: (actingUserId) => ipcRenderer.invoke("fuel:sync", { actingUserId }),
  listFuelTransactions: () => ipcRenderer.invoke("fuel:list"),
  listFuelDevices: () => ipcRenderer.invoke("fuel:devices:list"),

  listUsers: () => ipcRenderer.invoke("users:list"),
  addUser: (name, password, role, hiddenTabs, settingsSections, actingUserId) =>
    ipcRenderer.invoke("users:add", { name, password, role, hiddenTabs, settingsSections, actingUserId }),
  updateUser: (id, patch, actingUserId) => ipcRenderer.invoke("users:update", { id, patch, actingUserId }),
  deleteUser: (id, actingUserId) => ipcRenderer.invoke("users:delete", { id, actingUserId }),
  login: (name, password) => ipcRenderer.invoke("auth:login", { name, password }),
  flushStorage: () => ipcRenderer.invoke("app:flushStorage"),

  listActivityLog: (opts, actingUserId) => ipcRenderer.invoke("activityLog:list", opts, actingUserId),

  printCurrent: (opts) => ipcRenderer.invoke("print:current", opts),

  callPhone: (phoneNumber) => ipcRenderer.invoke("system:callPhone", phoneNumber),

  listDepots: () => ipcRenderer.invoke("depots:list"),
  setDepots: (list, actingUserId) => ipcRenderer.invoke("depots:set", { list, actingUserId }),

  listStockItems: () => ipcRenderer.invoke("stock:list"),
  setStockItems: (list, actingUserId) => ipcRenderer.invoke("stock:set", { list, actingUserId }),
  addStockItem: (item, actingUserId) => ipcRenderer.invoke("stock:add", { item, actingUserId }),
  updateStockItem: (id, patch, actingUserId) => ipcRenderer.invoke("stock:update", { id, patch, actingUserId }),
  deleteStockItem: (id, actingUserId) => ipcRenderer.invoke("stock:delete", { id, actingUserId }),

  listSuppliers: () => ipcRenderer.invoke("suppliers:list"),
  setSuppliers: (list, actingUserId) => ipcRenderer.invoke("suppliers:set", { list, actingUserId }),
  showSupplier: (url, bounds, supplierId) =>
    ipcRenderer.invoke("suppliers:show", { url, bounds, supplierId }),
  setSupplierBounds: (bounds) => ipcRenderer.invoke("suppliers:setBounds", bounds),
  hideSupplier: () => ipcRenderer.invoke("suppliers:hide"),
  reloadSupplierView: () => ipcRenderer.invoke("suppliers:reload"),
  searchAllSuppliers: (code) => ipcRenderer.invoke("suppliers:searchAll", { code }),
  warmSuppliers: () => ipcRenderer.invoke("suppliers:warmAll"),

  showWhatsApp: (bounds) => ipcRenderer.invoke("whatsapp:show", bounds),
  setWhatsAppBounds: (bounds) => ipcRenderer.invoke("whatsapp:setBounds", bounds),
  hideWhatsApp: () => ipcRenderer.invoke("whatsapp:hide"),
  reloadWhatsApp: () => ipcRenderer.invoke("whatsapp:reload"),

  listQuotes: () => ipcRenderer.invoke("quotes:list"),
  addQuote: (input) => ipcRenderer.invoke("quotes:add", input),
  updateQuote: (id, patch) => ipcRenderer.invoke("quotes:update", { id, patch }),
  deleteQuote: (id, actingUserId) => ipcRenderer.invoke("quotes:delete", { id, actingUserId }),
  generateQuotePdf: (defaultFileName) => ipcRenderer.invoke("quotes:generatePdf", { defaultFileName }),
  openQuoteMailClient: (email, subject, body, pdfPath) =>
    ipcRenderer.invoke("quotes:openMailClient", { email, subject, body, pdfPath }),
  openQuoteWhatsapp: (phone, text, pdfPath) =>
    ipcRenderer.invoke("quotes:openWhatsapp", { phone, text, pdfPath }),

  listIncomingOrders: () => ipcRenderer.invoke("incomingOrders:list"),
  addIncomingOrder: (input) => ipcRenderer.invoke("incomingOrders:add", input),
  updateIncomingOrder: (id, patch) => ipcRenderer.invoke("incomingOrders:update", { id, patch }),
  deleteIncomingOrder: (id, actingUserId) =>
    ipcRenderer.invoke("incomingOrders:delete", { id, actingUserId }),
  markIncomingOrderReminderNotified: (id, userId) =>
    ipcRenderer.invoke("incomingOrders:markReminderNotified", { id, userId }),
  dismissIncomingOrderReminder: (id, userId) =>
    ipcRenderer.invoke("incomingOrders:dismissReminder", { id, userId }),

  listMessagesFor: (userId) => ipcRenderer.invoke("messages:listFor", userId),
  sendMessage: (senderId, recipientId, body) =>
    ipcRenderer.invoke("messages:send", { senderId, recipientId, body }),
  markMessagesRead: (currentUserId, otherUserId) =>
    ipcRenderer.invoke("messages:markRead", { currentUserId, otherUserId }),
  deleteMessage: (id, actingUserId) => ipcRenderer.invoke("messages:delete", { id, actingUserId }),

  getCameraSettings: () => ipcRenderer.invoke("cameras:getSettings"),
  updateCameraSettings: (list, actingUserId) => ipcRenderer.invoke("cameras:updateSettings", { list, actingUserId }),
  startCamera: (dvrId, channelId) => ipcRenderer.invoke("cameras:start", { dvrId, channelId }),
  stopCamera: (dvrId, channelId) => ipcRenderer.invoke("cameras:stop", { dvrId, channelId }),

  // Başka bir bilgisayardan veri değiştiğinde (Supabase Realtime) çağrılır —
  // callback({ table }) alır. Aboneliği iptal eden bir fonksiyon döner.
  onDataChanged: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("data:changed", listener);
    return () => ipcRenderer.removeListener("data:changed", listener);
  },

  // Supabase Realtime bağlantı durumu değiştiğinde çağrılır —
  // callback({ status }) alır ("SUBSCRIBED"/"TIMED_OUT"/"CHANNEL_ERROR"/"CLOSED").
  onSyncStatusChange: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("sync:status", listener);
    return () => ipcRenderer.removeListener("sync:status", listener);
  },

  exportBackup: (actingUserId) => ipcRenderer.invoke("backup:export", actingUserId),

  // Tedarikçi sitesinde otomatik giriş için kullanıcı adı/şifre alanı
  // bulunamadığında (site değişmiş, 2FA vb.) çağrılır — callback({ supplierId }) alır.
  onSupplierAutofillFailed: (callback) => {
    const listener = (_e, payload) => callback(payload);
    ipcRenderer.on("suppliers:autofillFailed", listener);
    return () => ipcRenderer.removeListener("suppliers:autofillFailed", listener);
  },

  platform: "electron",
});
