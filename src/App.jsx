import { useEffect, useRef, useState } from "react";
import { Calendar, List, PackageSearch } from "lucide-react";
import Splash from "./components/Splash.jsx";
import LoginGate from "./components/LoginGate.jsx";
import ScreensaverLock from "./components/ScreensaverLock.jsx";
import CustomerProfilePage from "./components/CustomerProfilePage.jsx";
import PendingPartsCustomersModal from "./components/PendingPartsCustomersModal.jsx";
import Header from "./components/Header.jsx";
import Sidebar from "./components/Sidebar.jsx";
import AppointmentForm from "./components/AppointmentForm.jsx";
import AppointmentList from "./components/AppointmentList.jsx";
import Modal from "./components/Modal.jsx";
import RouteBuilder from "./components/RouteBuilder.jsx";
import HistoryPage from "./components/HistoryPage.jsx";
import HomePage from "./components/HomePage.jsx";
import DayEndSummaryPage from "./components/DayEndSummaryPage.jsx";
import MapPage from "./components/MapPage.jsx";
import OrdersPage from "./components/OrdersPage.jsx";
import StockPage from "./components/StockPage.jsx";
import PartCheckoutsPage from "./components/PartCheckoutsPage.jsx";
import CalendarPage from "./components/CalendarPage.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import OtherPage from "./components/OtherPage.jsx";
import QuotesPage from "./components/QuotesPage.jsx";
import IncomingOrdersPage from "./components/IncomingOrdersPage.jsx";
import MessagesDock from "./components/MessagesDock.jsx";
import WhatsAppDock from "./components/WhatsAppDock.jsx";
import CamerasPage from "./components/CamerasPage.jsx";
import PipPlayer from "./components/PipPlayer.jsx";
import Toast from "./components/Toast.jsx";

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [users, setUsers] = useState(null);
  const [technicians, setTechnicians] = useState([]);
  const [officeStaff, setOfficeStaff] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [fuelTransactions, setFuelTransactions] = useState([]);
  const [fuelDevices, setFuelDevices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [depots, setDepots] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [incomingOrders, setIncomingOrders] = useState([]);
  const [pendingParts, setPendingParts] = useState([]);
  const [partCheckouts, setPartCheckouts] = useState([]);
  const [messages, setMessages] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  const [settings, setSettings] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [shopLocation, setShopLocation] = useState(null);
  const [activeTab, setActiveTab] = useState("home");
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [prefillCustomer, setPrefillCustomer] = useState(null);
  const [showAppointmentsCalendar, setShowAppointmentsCalendar] = useState(false);
  const [pendingStockSearch, setPendingStockSearch] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("theme"));
  // Kullanıcının kendi cihazında seçtiği gezinme düzeni — theme gibi sadece
  // localStorage'da, Supabase'e senkronize edilmiyor (kişisel bir tercih,
  // ekip genelinde paylaşılan bir ayar değil).
  const [navStyle, setNavStyleState] = useState(() => localStorage.getItem("navStyle") || "top");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("sidebarCollapsed") === "true"
  );
  const [toast, setToast] = useState(null); // { type: "success" | "error", text }
  const [locked, setLocked] = useState(false);
  const [customerProfileAppointment, setCustomerProfileAppointment] = useState(null);
  const [customerProfileInitialTab, setCustomerProfileInitialTab] = useState("gecmis");
  const [showPendingPartsCustomers, setShowPendingPartsCustomers] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const pipPlayerRef = useRef(null);
  const toastTimerRef = useRef(null);
  const seenMessageIdsRef = useRef(new Set());

  function showToast(type, text) {
    setToast({ type, text });
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1400);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (theme) {
      document.documentElement.setAttribute("data-theme", theme);
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [theme]);

  const systemPrefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  const isDark = theme ? theme === "dark" : systemPrefersDark;

  function toggleTheme() {
    const next = isDark ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
  }

  function setNavStyle(next) {
    setNavStyleState(next);
    localStorage.setItem("navStyle", next);
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebarCollapsed", String(next));
      return next;
    });
  }

  useEffect(() => {
    window.api.listUsers().then(setUsers);
    window.api.listTechnicians().then(setTechnicians);
    window.api.listOfficeStaff().then(setOfficeStaff);
    window.api.listHolidays().then(setHolidays);
    window.api.listVehicles().then(setVehicles);
    window.api.listFuelTransactions().then(setFuelTransactions);
    window.api.listFuelDevices().then(setFuelDevices);
    window.api.listSuppliers().then(setSuppliers);
    window.api.listStockItems().then(setStockItems);
    window.api.listDepots().then(setDepots);
    window.api.getShopLocation().then(setShopLocation);
  }, []);

  useEffect(() => {
    if (currentUser) {
      window.api.listAppointments().then(setAppointments);
      window.api.listQuotes().then(setQuotes);
      window.api.listIncomingOrders().then(setIncomingOrders);
      window.api.listPendingParts().then(setPendingParts);
      window.api.listPartCheckouts().then(setPartCheckouts);
      window.api.getCameraSettings().then(setCameras);
      window.api
        .listMessagesFor(currentUser.id)
        .then((list) => {
          // Girişte gelen tüm eski/okunmamış mesajlar için bildirim
          // göstermeyelim — "görülmüş" kümesini burada, state'i güncellemeden
          // ÖNCE dolduruyoruz ki aşağıdaki bildirim efekti sadece BUNDAN
          // SONRA gelen gerçekten yeni mesajları yeni sayıp bildirsin.
          seenMessageIdsRef.current = new Set(list.map((m) => m.id));
          setMessages(list);
        })
        .catch((err) => {
          console.error("Mesajlar yüklenemedi:", err);
        });
    }
  }, [currentUser]);

  // Tedarikçi B2B sitelerine önceden, arka planda giriş yapıp "ısıtır" —
  // kullanıcı Sipariş sayfasında bir ürün aradığında site zaten hazır olsun.
  // Zaten ısınmış tedarikçilere dokunmaz (ana süreçte idempotent), bu yüzden
  // ekran koruyucudan çıkıp tekrar giriş yapıldığında tekrar tetiklense bile
  // zararsızdır.
  useEffect(() => {
    if (currentUser) window.api.warmSuppliers();
  }, [currentUser]);

  // Başka bir bilgisayarda veri değiştiğinde (Supabase Realtime), sadece
  // etkilenen koleksiyonu yeniden çekip ekranı güncel tutar.
  useEffect(() => {
    const refreshByTable = {
      appointments: () => currentUser && window.api.listAppointments().then(setAppointments),
      technicians: () => window.api.listTechnicians().then(setTechnicians),
      officeStaff: () => window.api.listOfficeStaff().then(setOfficeStaff),
      holidays: () => window.api.listHolidays().then(setHolidays),
      vehicles: () => window.api.listVehicles().then(setVehicles),
      suppliers: () => window.api.listSuppliers().then(setSuppliers),
      stockItems: () => window.api.listStockItems().then(setStockItems),
      depots: () => window.api.listDepots().then(setDepots),
      settings: () => {
        if (currentUser?.role === "admin") window.api.getSettings().then(setSettings);
        if (currentUser) window.api.getCameraSettings().then(setCameras);
      },
      users: () => window.api.listUsers().then(setUsers),
      quotes: () => currentUser && window.api.listQuotes().then(setQuotes),
      incomingOrders: () => currentUser && window.api.listIncomingOrders().then(setIncomingOrders),
      pendingParts: () => currentUser && window.api.listPendingParts().then(setPendingParts),
      partCheckouts: () => currentUser && window.api.listPartCheckouts().then(setPartCheckouts),
      messages: () =>
        currentUser &&
        window.api
          .listMessagesFor(currentUser.id)
          .then(setMessages)
          .catch((err) => console.error("Mesajlar yüklenemedi:", err)),
      activityLog: () => {
        if (currentUser?.role === "admin") window.api.listActivityLog().then(setActivityLog);
      },
    };
    const unsubscribe = window.api.onDataChanged(({ table }) => {
      refreshByTable[table]?.();
    });
    return unsubscribe;
  }, [currentUser]);

  // Yeni gelen mesaj için macOS'un sağ üstte gösterdiği sistem bildirimi
  // gibi bir bildirim gösterir — "görülmüş" kümesinde olmayan (yani daha
  // önce ekranda hiç görülmemiş) ve bana gelen mesajlar için tetiklenir.
  useEffect(() => {
    if (!currentUser || !users) return;
    const newIncoming = messages.filter(
      (m) =>
        !seenMessageIdsRef.current.has(m.id) &&
        m.recipientId === currentUser.id &&
        m.senderId !== currentUser.id
    );
    seenMessageIdsRef.current = new Set(messages.map((m) => m.id));
    if (newIncoming.length === 0 || typeof Notification === "undefined") return;
    for (const m of newIncoming) {
      const sender = users.find((u) => u.id === m.senderId);
      try {
        // "icon" opsiyonu macOS'ta bildirimin sağına ayrı, gereksiz bir görsel
        // ekliyordu — bildirimin SOLUNDAKİ küçük uygulama ikonu zaten macOS
        // tarafından otomatik gösteriliyor (paketlenmiş/canlı sürümde bizim
        // gerçek logomuz, dev modunda Electron'un kendi ikonu — bkz. main.js'teki
        // app.dock.setIcon notu). Bu yüzden burada ayrı bir icon vermiyoruz.
        const notification = new Notification(sender?.name || "Yeni mesaj", {
          body: m.body.length > 140 ? `${m.body.slice(0, 140)}…` : m.body,
        });
        notification.onclick = () => window.focus();
      } catch (err) {
        console.error("Bildirim gösterilemedi:", err);
      }
    }
  }, [messages, currentUser, users]);

  // Gelen sipariş hatırlatmaları — mesaj bildiriminden farklı olarak burada
  // hatırlatma sadece ZAMANIN GEÇMESİYLE (yeni bir veri gelmeden) "gecikmiş"
  // hale gelebilir, bu yüzden veri değişince tetiklenmenin yanında 60
  // saniyede bir de kontrol ediyoruz. "Kime zaten bildirildi" bilgisi
  // sunucuda (reminderNotifiedUserIds) tutuluyor — çoklu bilgisayar
  // senkronu olduğu için istemci tarafı bir "görüldü" kümesi kullanırsak
  // aynı kullanıcı başka bir bilgisayarda/yeniden başlatmada tekrar bildirim
  // alırdı.
  useEffect(() => {
    if (!currentUser) return;
    function checkDueReminders() {
      const now = Date.now();
      for (const order of incomingOrders) {
        if (!order.reminderAt || new Date(order.reminderAt).getTime() > now) continue;
        if (!order.reminderUserIds?.includes(currentUser.id)) continue;
        if (order.reminderNotifiedUserIds?.includes(currentUser.id)) continue;
        if (typeof Notification !== "undefined") {
          try {
            const notification = new Notification(`Sipariş hatırlatması — ${order.orderNo}`, {
              body: order.reminderNote || order.customerName,
            });
            notification.onclick = () => window.focus();
          } catch (err) {
            console.error("Hatırlatma bildirimi gösterilemedi:", err);
          }
        }
        // Sunucuya yazmanın yanında YEREL state'i de hemen güncelliyoruz —
        // sadece Supabase Realtime'ın geri bildirmesini beklersek (ağ gecikmesi/
        // aksaklık durumunda saniyeler sürebilir), bu arada geçen 60 saniyelik
        // bir sonraki kontrol turu hâlâ eski (bildirilmemiş) veriyi görüp AYNI
        // hatırlatmayı tekrar bildirirdi — kullanıcının "her 1 dakikada bir
        // hatırlatma geliyor" şikayetinin sebebi tam olarak buydu.
        setIncomingOrders((os) =>
          os.map((o) =>
            o.id === order.id
              ? { ...o, reminderNotifiedUserIds: [...(o.reminderNotifiedUserIds || []), currentUser.id] }
              : o
          )
        );
        window.api
          .markIncomingOrderReminderNotified(order.id, currentUser.id)
          .catch((err) => console.error("Hatırlatma işaretlenemedi:", err));
      }
    }
    checkDueReminders();
    const interval = setInterval(checkDueReminders, 60000);
    return () => clearInterval(interval);
  }, [incomingOrders, currentUser]);

  // Bekleyen parça hatırlatmaları — gelen sipariş hatırlatmasından farkı,
  // bunun TEK SEFERLİK değil, parça "Geldi" olarak işaretlenene kadar
  // SABİT ARALIKLARLA KENDİLİĞİNDEN TEKRARLANMASI. Bunu tek paylaşılan bir
  // "sıradaki hatırlatma" tarihiyle değil, KULLANICI BAŞINA "son gönderilme"
  // zamanıyla yapıyoruz — birden fazla kullanıcı hatırlatılıyorsa, biri
  // görüp işaretlediğinde diğerinin süresi sıfırlanmasın diye.
  useEffect(() => {
    if (!currentUser) return;
    function checkDuePartReminders() {
      const now = Date.now();
      for (const p of pendingParts) {
        if (p.status !== "bekleniyor") continue;
        if (!p.reminderIntervalDays) continue;
        if (!p.reminderUserIds?.includes(currentUser.id)) continue;
        const lastSent = p.reminderLastSentAt?.[currentUser.id];
        const dueAt = lastSent ? new Date(lastSent).getTime() + p.reminderIntervalDays * 86400000 : 0;
        if (now < dueAt) continue;
        if (typeof Notification !== "undefined") {
          try {
            const notification = new Notification(`Bekleyen parça hatırlatması — ${p.customerName}`, {
              body: p.reminderNote || p.description,
            });
            notification.onclick = () => window.focus();
          } catch (err) {
            console.error("Parça hatırlatması gösterilemedi:", err);
          }
        }
        const sentAtIso = new Date().toISOString();
        // Aynı "1 dakikada bir tekrar bildirim" hatasına düşmemek için
        // (bkz. gelen sipariş hatırlatmasındaki aynı düzeltme) yerel state'i
        // de hemen güncelliyoruz, sunucu senkronunu beklemiyoruz.
        setPendingParts((ps) =>
          ps.map((x) =>
            x.id === p.id
              ? { ...x, reminderLastSentAt: { ...(x.reminderLastSentAt || {}), [currentUser.id]: sentAtIso } }
              : x
          )
        );
        window.api
          .markPendingPartReminderSent(p.id, currentUser.id)
          .catch((err) => console.error("Parça hatırlatması işaretlenemedi:", err));
      }
    }
    checkDuePartReminders();
    const interval = setInterval(checkDuePartReminders, 60000);
    return () => clearInterval(interval);
  }, [pendingParts, currentUser]);

  // API anahtarları ve aktivite kaydı hassas — sadece yönetici
  // oturumundayken belleğe alınır.
  useEffect(() => {
    if (currentUser?.role === "admin") {
      window.api.getSettings().then(setSettings);
      window.api.listActivityLog().then(setActivityLog);
    } else {
      setSettings(null);
      setActivityLog([]);
    }
  }, [currentUser]);

  useEffect(() => {
    if (users && !currentUser) {
      const rememberedId = localStorage.getItem("rememberedUserId");
      if (rememberedId) {
        const found = users.find((u) => u.id === rememberedId);
        if (found) {
          setCurrentUser(found);
        } else {
          localStorage.removeItem("rememberedUserId");
        }
      }
    }
  }, [users, currentUser]);

  // currentUser, girişte alınan sabit bir kopya — kullanıcı kendi profil
  // fotoğrafı/adı gibi bilgilerini Ayarlar > Kullanıcılar'dan değiştirdiğinde
  // (ya da başka bir bilgisayardan realtime ile güncellendiğinde) users
  // dizisi tazelenir ama currentUser eski haliyle kalırdı — Anasayfa'daki
  // avatar bu yüzden yeni fotoğrafı çıkış/giriş yapılana kadar göstermiyordu.
  useEffect(() => {
    if (!users || !currentUser) return;
    const fresh = users.find((u) => u.id === currentUser.id);
    if (fresh && JSON.stringify(fresh) !== JSON.stringify(currentUser)) {
      setCurrentUser(fresh);
    }
  }, [users, currentUser]);

  function refreshAppointments() {
    window.api.listAppointments().then(setAppointments);
  }

  // Bekleyen parça geldiğinde, düzenleme modalındaki "Bu Müşteri İçin Yeni
  // Randevu Oluştur" butonundan çağrılır — modalı kapatıp Randevular
  // sekmesindeki (üstteki) "Yeni Randevu" formunu bu müşterinin bilgileriyle
  // önceden doldurur. Şikayet/ücret gibi alanlar bilerek boş kalır, bu YENİ
  // bir ziyaret.
  function handleCreateFollowUp(customerInfo) {
    setPrefillCustomer({
      customerName: customerInfo.customerName,
      contactName: customerInfo.contactName,
      customerPhone: customerInfo.customerPhone,
      addressDetail: customerInfo.addressDetail,
    });
    setEditingAppointment(null);
    setCustomerProfileAppointment(null);
    setActiveTab("appointments");
    setShowAppointmentsCalendar(false);
    showToast("success", "Müşteri bilgileri yeni randevu formuna dolduruldu.");
  }

  function refreshUsers() {
    window.api.listUsers().then(setUsers);
  }

  async function handleCreateFirstUser(name, password, remember) {
    const user = await window.api.addUser(name, password, "admin");
    setUsers([user]);
    setCurrentUser(user);
    if (remember) localStorage.setItem("rememberedUserId", user.id);
  }

  async function handleLogin(name, password, remember) {
    const user = await window.api.login(name, password);
    if (user) {
      setCurrentUser(user);
      // Sadece "Beni Hatırla" işaretliyken kaydeder; işaretlenmemiş sıradan bir
      // girişte önceden hatırlanan oturumu SİLMEYİZ — bunu sadece "Çıkış" yapar.
      if (remember) {
        localStorage.setItem("rememberedUserId", user.id);
      }
      return true;
    }
    return false;
  }

  function handleLogout() {
    localStorage.removeItem("rememberedUserId");
    setCurrentUser(null);
    setSessionNotice("");
  }

  // Hareketsizlikte ekran koruyucu + otomatik kilit — bkz. plan notu:
  // sadece bu pencere değil, TÜM sistemdeki son fare/klavye hareketinden
  // bu yana geçen süre ölçülüyor (powerMonitor), ki kullanıcı başka bir
  // programla meşgulken yanlışlıkla kilitlenmesin.
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(async () => {
      const idleSeconds = await window.api.getSystemIdleSeconds();
      const thresholdMinutes = settings?.idleTimeoutMinutes ?? 5;
      if (idleSeconds >= thresholdMinutes * 60) setLocked(true);
    }, 15000);
    return () => clearInterval(interval);
  }, [currentUser, settings?.idleTimeoutMinutes]);

  function handleIdleWake() {
    setLocked(false);
    handleLogout();
    setSessionNotice("Hareketsizlik nedeniyle oturum sonlandırıldı, tekrar giriş yapın.");
  }

  async function handleDelete(id) {
    await window.api.deleteAppointment(id, currentUser.id);
    refreshAppointments();
  }

  async function handleStatusChange(id, status) {
    await window.api.setAppointmentStatus(id, status, currentUser.id);
    refreshAppointments();
  }

  function handleSaved(_appointment, hasIssue) {
    refreshAppointments();
    if (!hasIssue) {
      showToast("success", editingAppointment ? "Randevu güncellendi." : "Randevu kaydedildi.");
      setEditingAppointment(null);
    }
  }

  function handleNavigateToIssue(appointmentId) {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return;
    setActiveTab("appointments");
    setShowAppointmentsCalendar(false);
    setEditingAppointment(appointment);
  }

  // Header'daki hatırlatma kapatmasıyla AYNI desen: sunucuya yazmanın yanında
  // yerel state'i de hemen güncelliyoruz ki realtime senkron gecikirse uyarı
  // kısa süreliğine tekrar görünmesin.
  async function handleDismissIssue(appointmentId) {
    setAppointments((as) => as.map((a) => (a.id === appointmentId ? { ...a, geocodeIssue: null } : a)));
    await window.api.updateAppointment(appointmentId, { geocodeIssue: null, actingUserId: currentUser?.id });
  }

  // Anasayfa'dan bir randevuyu düzenlerken sekme değiştirmeden, popup olarak
  // açmak için — handleNavigateToIssue'dan farkı: activeTab'a dokunmaz.
  function handleEditAppointmentInPlace(appointmentId) {
    const appointment = appointments.find((a) => a.id === appointmentId);
    if (!appointment) return;
    setEditingAppointment(appointment);
  }

  function handleOpenStockItem(code) {
    setPendingStockSearch(code);
    setActiveTab("stock");
  }

  async function handleSendMessage(recipientId, body) {
    try {
      const message = await window.api.sendMessage(currentUser.id, recipientId, body);
      setMessages((ms) => [...ms, message]);
    } catch (err) {
      showToast("error", err.message || "Mesaj gönderilemedi.");
    }
  }

  async function handleMarkMessagesRead(otherUserId) {
    setMessages((ms) =>
      ms.map((m) =>
        m.senderId === otherUserId && m.recipientId === currentUser.id && !m.readAt
          ? { ...m, readAt: new Date().toISOString() }
          : m
      )
    );
    await window.api.markMessagesRead(currentUser.id, otherUserId);
  }

  function handleQuoteSaved(quote, deletedId) {
    if (deletedId) {
      setQuotes((qs) => qs.filter((q) => q.id !== deletedId));
      return;
    }
    setQuotes((qs) => (qs.some((q) => q.id === quote.id) ? qs.map((q) => (q.id === quote.id ? quote : q)) : [...qs, quote]));
  }

  function handleIncomingOrderSaved(order, deletedId) {
    if (deletedId) {
      setIncomingOrders((os) => os.filter((o) => o.id !== deletedId));
      return;
    }
    setIncomingOrders((os) =>
      os.some((o) => o.id === order.id) ? os.map((o) => (o.id === order.id ? order : o)) : [...os, order]
    );
  }

  function handleSavedPendingPart(part, deletedId) {
    if (deletedId) {
      setPendingParts((ps) => ps.filter((p) => p.id !== deletedId));
      return;
    }
    setPendingParts((ps) =>
      ps.some((p) => p.id === part.id) ? ps.map((p) => (p.id === part.id ? part : p)) : [...ps, part]
    );
  }

  async function handleDismissReminder(orderId) {
    setIncomingOrders((os) =>
      os.map((o) =>
        o.id === orderId
          ? { ...o, reminderDismissedUserIds: [...(o.reminderDismissedUserIds || []), currentUser.id] }
          : o
      )
    );
    await window.api.dismissIncomingOrderReminder(orderId, currentUser.id);
  }

  // Header'daki zilden "ertele" — kalıcı kapatma DEĞİL, sadece bir sonraki
  // periyodik hatırlatma turuna kadar susturur (bkz. checkDuePartReminders'daki
  // aynı "son gönderilme" mantığı).
  async function handleDismissPartReminder(pendingPartId) {
    const sentAtIso = new Date().toISOString();
    setPendingParts((ps) =>
      ps.map((p) =>
        p.id === pendingPartId
          ? { ...p, reminderLastSentAt: { ...(p.reminderLastSentAt || {}), [currentUser.id]: sentAtIso } }
          : p
      )
    );
    await window.api.markPendingPartReminderSent(pendingPartId, currentUser.id);
  }

  // Header/Sidebar'daki zilden "Mutabakatı yapılmamış zimmet" hatırlatmasını
  // kapatma — dueReminders (gelen sipariş) ile AYNI KALICI desen: bir daha
  // hatırlatılmasın istiyorsanız kapatırsınız, zimmet kaydının kendisi
  // (mutabakat durumu) hiç değişmez, sadece bu kullanıcı için bildirim susar.
  async function handleDismissCheckoutReminder(checkoutId) {
    setPartCheckouts((cs) =>
      cs.map((c) =>
        c.id === checkoutId
          ? { ...c, reminderDismissedUserIds: [...(c.reminderDismissedUserIds || []), currentUser.id] }
          : c
      )
    );
    await window.api.updatePartCheckout(checkoutId, {
      reminderDismissedUserIds: [
        ...(partCheckouts.find((c) => c.id === checkoutId)?.reminderDismissedUserIds || []),
        currentUser.id,
      ],
      actingUserId: currentUser.id,
    });
  }

  if (showSplash || users === null) {
    return <Splash isDark={isDark} />;
  }

  if (!currentUser) {
    return (
      <LoginGate
        hasUsers={users.length > 0}
        onLogin={handleLogin}
        onCreateFirstUser={handleCreateFirstUser}
        isDark={isDark}
        notice={sessionNotice}
      />
    );
  }

  return (
    <>
      {locked && (
        <ScreensaverLock onWake={handleIdleWake} messages={messages} users={users} currentUser={currentUser} />
      )}
      <Toast toast={toast} />
      <PipPlayer ref={pipPlayerRef} />
      <MessagesDock
        messages={messages}
        users={users}
        currentUser={currentUser}
        onSend={handleSendMessage}
        onMarkRead={handleMarkMessagesRead}
      />
      <WhatsAppDock />
      {navStyle === "side" ? (
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentUser={currentUser}
          onLogout={handleLogout}
          appointments={appointments}
          onNavigateToIssue={handleNavigateToIssue}
          onDismissIssue={handleDismissIssue}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          incomingOrders={incomingOrders}
          onDismissReminder={handleDismissReminder}
          pendingParts={pendingParts}
          onDismissPartReminder={handleDismissPartReminder}
          partCheckouts={partCheckouts}
          onDismissCheckoutReminder={handleDismissCheckoutReminder}
          technicians={technicians}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebarCollapsed}
          onNavStyleChange={setNavStyle}
        />
      ) : (
        <Header
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currentUser={currentUser}
          onLogout={handleLogout}
          appointments={appointments}
          onNavigateToIssue={handleNavigateToIssue}
          onDismissIssue={handleDismissIssue}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          incomingOrders={incomingOrders}
          onDismissReminder={handleDismissReminder}
          pendingParts={pendingParts}
          onDismissPartReminder={handleDismissPartReminder}
          partCheckouts={partCheckouts}
          onDismissCheckoutReminder={handleDismissCheckoutReminder}
          technicians={technicians}
          onNavStyleChange={setNavStyle}
        />
      )}
      <div
        className={
          navStyle === "side" ? `content with-sidebar${sidebarCollapsed ? " sidebar-collapsed" : ""}` : "content"
        }
      >
        {activeTab === "home" && (
          <HomePage
            appointments={appointments}
            technicians={technicians}
            stockItems={stockItems}
            quotes={quotes}
            partCheckouts={partCheckouts}
            pendingParts={pendingParts}
            users={users}
            holidays={holidays}
            currentUser={currentUser}
            onNavigate={setActiveTab}
            onNavigateToIssue={handleNavigateToIssue}
            onEditAppointment={handleEditAppointmentInPlace}
            onOpenStockItem={handleOpenStockItem}
            showToast={showToast}
          />
        )}
        {activeTab === "dayEndSummary" && (
          <DayEndSummaryPage
            appointments={appointments}
            pendingParts={pendingParts}
            technicians={technicians}
            currentUser={currentUser}
            onNavigate={setActiveTab}
            onEditAppointment={handleEditAppointmentInPlace}
          />
        )}
        {activeTab === "appointments" && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem", marginBottom: "1rem" }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowPendingPartsCustomers(true)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <PackageSearch size={16} strokeWidth={1.75} />
                Parça Bekleyen Müşteriler
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setShowAppointmentsCalendar((s) => !s)}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                {showAppointmentsCalendar ? (
                  <>
                    <List size={16} strokeWidth={1.75} />
                    Listeye Dön
                  </>
                ) : (
                  <>
                    <Calendar size={16} strokeWidth={1.75} />
                    Takvim
                  </>
                )}
              </button>
            </div>
            {showPendingPartsCustomers && (
              <PendingPartsCustomersModal
                pendingParts={pendingParts}
                appointments={appointments}
                onSelectCustomer={(a) => {
                  setShowPendingPartsCustomers(false);
                  setCustomerProfileInitialTab("parcalar");
                  setCustomerProfileAppointment(a);
                }}
                onClose={() => setShowPendingPartsCustomers(false)}
              />
            )}
            {showAppointmentsCalendar ? (
              <CalendarPage
                appointments={appointments}
                technicians={technicians}
                holidays={holidays}
                onEditAppointment={(appointment) => {
                  setShowAppointmentsCalendar(false);
                  setEditingAppointment(appointment);
                }}
              />
            ) : (
              <>
                <AppointmentForm
                  editingAppointment={null}
                  onSaved={(_appointment, hasIssue) => {
                    refreshAppointments();
                    setPrefillCustomer(null);
                    if (!hasIssue) showToast("success", "Randevu kaydedildi.");
                  }}
                  actingUserId={currentUser.id}
                  appointments={appointments}
                  holidays={holidays}
                  stockItems={stockItems}
                  prefillCustomer={prefillCustomer}
                  technicians={technicians}
                />
                <AppointmentList
                  appointments={appointments}
                  technicians={technicians}
                  users={users}
                  currentUser={currentUser}
                  onDelete={handleDelete}
                  onEdit={setEditingAppointment}
                  onStatusChange={handleStatusChange}
                  onOpenCustomerProfile={(a) => {
                    setCustomerProfileInitialTab("gecmis");
                    setCustomerProfileAppointment(a);
                  }}
                />
              </>
            )}
          </>
        )}
        {activeTab === "routes" && (
          <RouteBuilder
            appointments={appointments}
            technicians={technicians}
            holidays={holidays}
            onRouted={refreshAppointments}
            actingUserId={currentUser.id}
          />
        )}
        {activeTab === "map" && (
          <MapPage
            appointments={appointments}
            technicians={technicians}
            shopLocation={shopLocation}
          />
        )}
        {activeTab === "orders" && (
          <OrdersPage
            suppliers={suppliers}
            isDark={isDark}
            stockItems={stockItems}
            depots={depots}
            navStyle={navStyle}
            sidebarCollapsed={sidebarCollapsed}
          />
        )}
        {activeTab === "incomingOrders" && (
          <IncomingOrdersPage
            incomingOrders={incomingOrders}
            onSaved={handleIncomingOrderSaved}
            currentUser={currentUser}
            users={users}
            stockItems={stockItems}
          />
        )}
        {activeTab === "stock" && (
          <StockPage
            stockItems={stockItems}
            onSaved={setStockItems}
            depots={depots}
            onDepotsSaved={setDepots}
            initialSearch={pendingStockSearch}
            currentUser={currentUser}
          />
        )}
        {activeTab === "partCheckouts" && (
          <PartCheckoutsPage
            stockItems={stockItems}
            technicians={technicians}
            appointments={appointments}
            partCheckouts={partCheckouts}
            currentUser={currentUser}
            onChanged={() => {
              window.api.listPartCheckouts().then(setPartCheckouts);
              window.api.listStockItems().then(setStockItems);
            }}
          />
        )}
        {activeTab === "quotes" && (
          <QuotesPage
            quotes={quotes}
            onSaved={handleQuoteSaved}
            stockItems={stockItems}
            currentUser={currentUser}
          />
        )}
        {activeTab === "cameras" && !currentUser?.hiddenTabs?.includes("cameras") && (
          <CamerasPage
            cameras={cameras}
            onRequestPip={(dvrId, channel) => pipPlayerRef.current?.start(dvrId, channel)}
          />
        )}
        {activeTab === "history" && (
          <HistoryPage
            appointments={appointments}
            technicians={technicians}
            users={users}
            currentUser={currentUser}
            isDark={isDark}
          />
        )}
        {activeTab === "other" && (
          <OtherPage
            technicians={technicians}
            vehicles={vehicles}
            fuelTransactions={fuelTransactions}
            fuelDevices={fuelDevices}
            settings={settings}
            currentUser={currentUser}
            onFuelSynced={setFuelTransactions}
            onFuelDevicesSynced={setFuelDevices}
          />
        )}
        {activeTab === "settings" && currentUser.role === "admin" && settings && (
          <SettingsPage
            appointments={appointments}
            technicians={technicians}
            officeStaff={officeStaff}
            holidays={holidays}
            vehicles={vehicles}
            users={users}
            suppliers={suppliers}
            depots={depots}
            stockItems={stockItems}
            settings={settings}
            cameras={cameras}
            activityLog={activityLog}
            currentUser={currentUser}
            onTechniciansSaved={setTechnicians}
            onOfficeStaffSaved={setOfficeStaff}
            onHolidaysSaved={setHolidays}
            onVehiclesSaved={setVehicles}
            onUsersSaved={refreshUsers}
            onSuppliersSaved={setSuppliers}
            onDepotsSaved={setDepots}
            onStockSaved={setStockItems}
            onSettingsSaved={setSettings}
            onCamerasSaved={setCameras}
            onNotify={showToast}
            onTestScreensaver={() => setLocked(true)}
            navStyle={navStyle}
            onNavStyleChange={setNavStyle}
          />
        )}
      </div>
      {editingAppointment && (
        <Modal onClose={() => setEditingAppointment(null)}>
          <AppointmentForm
            editingAppointment={editingAppointment}
            onSaved={handleSaved}
            onCancelEdit={() => setEditingAppointment(null)}
            actingUserId={currentUser.id}
            appointments={appointments}
            holidays={holidays}
            stockItems={stockItems}
            pendingParts={pendingParts}
            users={users || []}
            technicians={technicians}
            onSavedPendingPart={handleSavedPendingPart}
            onCreateFollowUp={handleCreateFollowUp}
          />
        </Modal>
      )}
      {customerProfileAppointment && (
        <CustomerProfilePage
          appointment={customerProfileAppointment}
          appointments={appointments}
          pendingParts={pendingParts}
          initialTab={customerProfileInitialTab}
          onEditAppointment={(a) => {
            setCustomerProfileAppointment(null);
            setEditingAppointment(a);
          }}
          onClose={() => setCustomerProfileAppointment(null)}
        />
      )}
    </>
  );
}
