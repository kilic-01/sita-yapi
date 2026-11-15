import { useEffect, useRef, useState } from "react";
import { Moon, Sun, TriangleAlert, LogOut, Bell, Trash2, PanelLeft, Wifi, WifiOff, Loader2 } from "lucide-react";
import { TABS, TAB_GROUPS } from "./navTabs.jsx";
import { useSyncStatus, useHeaderAlerts } from "../lib/useHeaderAlerts.js";
import GeocodeIssueNotice from "./GeocodeIssueNotice.jsx";

export { TABS };

// Ortada yüzen SABİT dock: ikonlar hiç büyümez/kaymaz (eski "magnify" ve
// üzerine gelince açılan etiket, tıklanacak ikonun yerini değiştirip anında
// basmayı zorlaştırıyordu; Windows'ta da istendiği gibi çalışmıyordu). Sekme
// adı ikonun altında gecikmesiz bir ipucu olarak çıkar, hiçbir şeyi itmez.
// Gruplar (TAB_GROUPS, Sidebar'daki ile aynı) ince ayraçla ayrılır.
function Dock({ tabs, activeTab, onTabChange }) {
  const visible = new Set(tabs.map((t) => t.id));
  const groups = TAB_GROUPS.map((ids) => tabs.filter((t) => ids.includes(t.id))).filter((g) => g.length > 0);
  // TAB_GROUPS'ta olmayan (ileride eklenen) sekmeler kaybolmasın.
  const grouped = new Set(TAB_GROUPS.flat());
  const ungrouped = tabs.filter((t) => !grouped.has(t.id));
  if (ungrouped.length > 0) groups.push(ungrouped);

  return (
    <nav className="dock" aria-label="Sayfalar">
      {groups.map((group, gi) => (
        <div key={gi} className="dock-group">
          {gi > 0 && <span className="dock-sep" aria-hidden="true" />}
          {group.map((tab) =>
            visible.has(tab.id) ? (
              <button
                key={tab.id}
                type="button"
                className={`dock-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => onTabChange(tab.id)}
                aria-label={tab.label}
                aria-current={activeTab === tab.id ? "page" : undefined}
              >
                {tab.icon}
                <span className="dock-tip" role="tooltip">
                  {tab.label}
                </span>
              </button>
            ) : null
          )}
        </div>
      ))}
    </nav>
  );
}

export default function Header({
  activeTab,
  onTabChange,
  currentUser,
  onLogout,
  appointments,
  onNavigateToIssue,
  onDismissIssue,
  isDark,
  onToggleTheme,
  incomingOrders,
  onDismissReminder,
  pendingParts,
  onDismissPartReminder,
  partCheckouts,
  onDismissCheckoutReminder,
  onDismissAllReminders,
  technicians,
  onNavStyleChange,
  syncingCount = 0,
}) {
  // Supabase Realtime bağlantı durumu — header'da küçük bir noktayla
  // gösterilir, kullanıcı veri güncel mi/senkronize mi diye anlayabilsin.
  const syncInfo = useSyncStatus();
  const [showSyncTooltip, setShowSyncTooltip] = useState(false);

  const [showIssues, setShowIssues] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const issuesRef = useRef(null);
  const remindersRef = useRef(null);

  // Ekranda başka bir yere tıklanınca açık olan uyarı/hatırlatma panelini
  // kapatır — MessagesDock/WhatsAppDock'taki "dışına tıkla kapansın"
  // deseniyle aynı.
  useEffect(() => {
    function handleClickOutside(e) {
      if (showIssues && issuesRef.current && !issuesRef.current.contains(e.target)) setShowIssues(false);
      if (showReminders && remindersRef.current && !remindersRef.current.contains(e.target)) setShowReminders(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showIssues, showReminders]);
  const { issues, dueReminders, duePartReminders, overdueCheckouts, reminderCount, visibleTabs } = useHeaderAlerts({
    appointments,
    incomingOrders,
    pendingParts,
    partCheckouts,
    technicians,
    currentUser,
  });

  return (
    <div className="header">
      <img
        src={isDark ? "./logo-white.svg" : "./logo.svg"}
        alt="Sita Yapı"
        className="header-logo"
        onClick={() => onTabChange("home")}
        style={{ cursor: "pointer" }}
      />
      {/* Dock, CSS'te margin-left:auto ile sağa doğru itiliyor — bu yüzden
          logo ile Dock arasındaki boşluğa eklenen bir eleman Dock'un (ve
          ondan sonraki her şeyin) konumunu ETKİLEMİYOR (auto margin
          otomatik daralıp bu genişliği yutuyor). "Senkronize ediliyor"
          yazısı önceden Dock'un SAĞINDA (kullanıcı adı bloğunun içinde)
          duruyordu — o blok büyüyünce Dock'un auto margin'i küçülüp
          sekme ikonlarını sola kaydırıyordu. Buraya taşımak bu kaymayı
          tamamen ortadan kaldırıyor. */}
      {syncingCount > 0 && !syncInfo.isProblem && (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            marginLeft: "1rem",
            opacity: 0.6,
            fontSize: "0.8rem",
            flexShrink: 0,
          }}
        >
          <Loader2 size={14} strokeWidth={2} style={{ animation: "spin 1.1s linear infinite" }} />
          Senkronize ediliyor…
        </span>
      )}
      <Dock tabs={visibleTabs} activeTab={activeTab} onTabChange={onTabChange} />

      {issues.length > 0 && (
        <div ref={issuesRef} style={{ position: "relative", marginLeft: "0.75rem" }}>
          <button
            onClick={() => setShowIssues((s) => !s)}
            title="Adres/harita sorunları"
            className="header-icon-btn"
            style={{ background: "var(--danger)", color: "white", fontWeight: 700, gap: "0.2rem" }}
          >
            <TriangleAlert size={16} strokeWidth={2} />
            {issues.length > 1 ? issues.length : ""}
          </button>
          {showIssues && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "color-mix(in srgb, var(--card-bg) 75%, transparent)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                color: "var(--text)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
                minWidth: 320,
                maxWidth: 420,
                zIndex: 1100,
                overflow: "hidden",
              }}
            >
              {issues.map((a) => (
                <div
                  key={a.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    padding: "0.6rem 0.8rem",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowIssues(false);
                      onNavigateToIssue(a.id);
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "inherit",
                      fontSize: "0.85rem",
                    }}
                  >
                    <strong>{a.customerName}</strong>
                  </button>
                  <GeocodeIssueNotice appointment={a} actingUserId={currentUser?.id} compact />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {reminderCount > 0 && (
        <div ref={remindersRef} style={{ position: "relative", marginLeft: "0.75rem" }}>
          <button
            onClick={() => setShowReminders((s) => !s)}
            title="Hatırlatmalar"
            className="header-icon-btn"
            style={{ background: "var(--accent, #f59e0b)", color: "white", fontWeight: 700, gap: "0.2rem" }}
          >
            <Bell size={16} strokeWidth={2} />
            {reminderCount > 1 ? reminderCount : ""}
          </button>
          {showReminders && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                right: 0,
                background: "color-mix(in srgb, var(--card-bg) 75%, transparent)",
                backdropFilter: "blur(20px) saturate(180%)",
                WebkitBackdropFilter: "blur(20px) saturate(180%)",
                color: "var(--text)",
                borderRadius: 12,
                border: "1px solid var(--border)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.28)",
                minWidth: 320,
                maxWidth: 420,
                zIndex: 1100,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  borderBottom: "1px solid var(--border)",
                  padding: "0.4rem 0.6rem",
                }}
              >
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowReminders(false);
                    onDismissAllReminders?.({ orders: dueReminders, parts: duePartReminders, checkouts: overdueCheckouts });
                  }}
                  style={{ display: "flex", alignItems: "center", gap: "0.35rem", padding: "0.3rem 0.6rem", fontSize: "0.8rem", color: "var(--danger)" }}
                >
                  <Trash2 size={14} strokeWidth={1.75} />
                  Tümünü sil
                </button>
              </div>
              {dueReminders.map((o) => (
                <div
                  key={o.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    borderBottom: "1px solid var(--border)",
                    padding: "0.6rem 0.8rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}>
                    <strong>{o.orderNo}</strong> — {o.customerName}
                    {o.reminderNote && <div style={{ opacity: 0.8 }}>{o.reminderNote}</div>}
                  </div>
                  <button
                    type="button"
                    className="icon-btn delete"
                    title="Hatırlatmayı kapat"
                    aria-label="Hatırlatmayı kapat"
                    onClick={() => onDismissReminder?.(o.id)}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              {duePartReminders.map((p) => (
                <div
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    borderBottom: "1px solid var(--border)",
                    padding: "0.6rem 0.8rem",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}>
                    <strong>Parça — {p.customerName}</strong>
                    <div style={{ opacity: 0.8 }}>{p.reminderNote || p.description}</div>
                  </div>
                  <button
                    type="button"
                    className="icon-btn delete"
                    title="Ertele"
                    aria-label="Ertele"
                    onClick={() => onDismissPartReminder?.(p.id)}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              {overdueCheckouts.map((c) => {
                const tech = (technicians || []).find((t) => t.id === c.technicianId);
                return (
                  <div
                    key={c.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      borderBottom: "1px solid var(--border)",
                      padding: "0.6rem 0.8rem",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setShowReminders(false);
                        onTabChange("partCheckouts");
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "block",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "inherit",
                        padding: 0,
                        fontSize: "0.85rem",
                      }}
                    >
                      <strong>Mutabakatı yapılmamış zimmet</strong>
                      <div style={{ opacity: 0.8 }}>
                        {tech?.name || "Bilinmeyen teknisyen"} — {c.date}
                      </div>
                    </button>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Hatırlatmayı kapat"
                      aria-label="Hatırlatmayı kapat"
                      onClick={() => onDismissCheckoutReminder?.(c.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <button
        onClick={onToggleTheme}
        title={isDark ? "Aydınlık moda geç" : "Karanlık moda geç"}
        className="header-icon-btn"
        style={{ marginLeft: "0.4rem" }}
      >
        {isDark ? <Sun size={16} strokeWidth={1.75} /> : <Moon size={16} strokeWidth={1.75} />}
      </button>

      {/* Görünüm tercihi (üst menü/kenar çubuğu) — tema gibi sadece bu
          cihazda geçerli, bu yüzden Ayarlar'a (admin'e özel) gerek kalmadan
          herkesin erişebileceği bir buton olarak burada duruyor. */}
      <button
        onClick={() => onNavStyleChange?.("side")}
        title="Kenar çubuğu görünümüne geç"
        className="header-icon-btn"
        style={{ marginLeft: "0.2rem" }}
      >
        <PanelLeft size={16} strokeWidth={1.75} />
      </button>

      {currentUser && (
        <div style={{ marginLeft: "1rem", display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span
            onMouseEnter={() => setShowSyncTooltip(true)}
            onMouseLeave={() => setShowSyncTooltip(false)}
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              flexShrink: 0,
              cursor: "default",
            }}
          >
            {syncInfo.isProblem ? (
              <WifiOff size={15} strokeWidth={2} color="var(--danger)" />
            ) : syncingCount > 0 ? (
              <Loader2 size={15} strokeWidth={2} style={{ animation: "spin 1.1s linear infinite", opacity: 0.75 }} />
            ) : (
              <Wifi size={15} strokeWidth={2} color={syncInfo.color} />
            )}
            {showSyncTooltip && (
              <span
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "var(--card-bg)",
                  color: "var(--text)",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  padding: "0.3rem 0.6rem",
                  fontSize: "0.75rem",
                  fontWeight: 400,
                  whiteSpace: "nowrap",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                  zIndex: 1000,
                }}
              >
                {syncInfo.isProblem ? syncInfo.label : syncingCount > 0 ? "Senkronize ediliyor…" : syncInfo.label}
              </span>
            )}
          </span>
          <span style={{ opacity: 0.85, fontSize: "0.9rem" }}>{currentUser.name}</span>
          <button
            className="header-icon-btn"
            onClick={onLogout}
            title="Çıkış"
            aria-label="Çıkış"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}
