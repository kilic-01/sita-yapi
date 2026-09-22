import { useEffect, useState } from "react";
import { todayISO } from "./format.js";
import { TABS } from "../components/navTabs.jsx";

// Header.jsx (üst dock) ve Sidebar.jsx (sol kenar çubuğu) aynı uyarı/hatırlatma
// mantığını paylaşıyor — iki farklı görünüm arasında kullanıcı seçim
// yapabilsin diye eklendi, mantığın iki yerde ayrı ayrı bakımı gerekmesin
// diye buraya taşındı.

// Supabase Realtime bağlantı durumu — küçük bir noktayla gösterilir,
// kullanıcı veri güncel mi/senkronize mi diye anlayabilsin.
export function useSyncStatus() {
  const [syncStatus, setSyncStatus] = useState("SUBSCRIBED");
  useEffect(() => {
    return window.api.onSyncStatusChange(({ status }) => setSyncStatus(status));
  }, []);
  const syncInfo =
    syncStatus === "SUBSCRIBED"
      ? { color: "#2ecc71", label: "Bağlı" }
      : syncStatus === "CLOSED"
      ? { color: "#95a5a6", label: "Bağlantı kapalı" }
      : { color: "#e74c3c", label: "Bağlantı sorunu — yeniden deneniyor" };
  return syncInfo;
}

export function useHeaderAlerts({ appointments, incomingOrders, pendingParts, partCheckouts, technicians, currentUser }) {
  // Zamanı gelmiş (reminderAt geçmiş), bana ait ve henüz kapatmadığım
  // gelen sipariş hatırlatmaları — native bildirim sadece bir kez gösterilip
  // kaybolur, burası kullanıcı çöp kutusuna basıp KENDİSİ kapatana kadar
  // kalıcı olarak listede durur.
  const dueReminders = (incomingOrders || []).filter(
    (o) =>
      o.reminderAt &&
      new Date(o.reminderAt).getTime() <= Date.now() &&
      o.reminderUserIds?.includes(currentUser?.id) &&
      !o.reminderDismissedUserIds?.includes(currentUser?.id)
  );
  // Bekleyen parça hatırlatmaları — gelen sipariş hatırlatmasından farklı
  // olarak "kapat" burada kalıcı değil, sadece bir sonraki hatırlatma
  // turuna erteler (parça "Geldi" işaretlenene kadar periyodik olarak
  // tekrar görünür — bkz. App.jsx'teki checkDuePartReminders).
  const duePartReminders = (pendingParts || []).filter((p) => {
    if (p.status !== "bekleniyor") return false;
    if (!p.reminderIntervalDays) return false;
    if (!p.reminderUserIds?.includes(currentUser?.id)) return false;
    const lastSent = p.reminderLastSentAt?.[currentUser?.id];
    const dueAt = lastSent ? new Date(lastSent).getTime() + p.reminderIntervalDays * 86400000 : 0;
    return Date.now() >= dueAt;
  });
  // Dünden (ya da daha önceden) kalıp hâlâ mutabakatı yapılmamış zimmetler
  // — beklenti AYNI GÜN mutabakat olduğu için pendingParts'taki gibi
  // yapılandırılabilir bir hatırlatma aralığına gerek yok, "bugünden eski
  // ve hâlâ outstanding" yeterli bir kural.
  const overdueCheckouts = (partCheckouts || []).filter(
    (c) =>
      c.status === "outstanding" &&
      c.date < todayISO() &&
      !c.reminderDismissedUserIds?.includes(currentUser?.id)
  );
  const reminderCount = dueReminders.length + duePartReminders.length + overdueCheckouts.length;
  const visibleTabs = TABS.filter((tab) => {
    if (tab.adminOnly) return currentUser?.role === "admin";
    // hiddenTabs artık rolden bağımsız uygulanır — bu sayede bir yönetici
    // hesabı diğer her şeye erişip belirli bir sekmeden (örn. kameralar)
    // hariç tutulabilir. Gerçek yöneticilerin hiddenTabs'ı boş dizi olduğu
    // için bu, mevcut yönetici hesaplarının davranışını değiştirmez.
    if (currentUser?.hiddenTabs?.includes(tab.id)) return false;
    return true;
  });
  const issues = (appointments || []).filter((a) => a.geocodeIssue);

  return { issues, dueReminders, duePartReminders, overdueCheckouts, reminderCount, visibleTabs };
}
