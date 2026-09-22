import { useEffect, useRef, useState } from "react";
import { Moon, Sun, TriangleAlert, LogOut, Bell, Trash2, Menu, PanelTop } from "lucide-react";
import { TAB_GROUPS } from "./navTabs.jsx";
import { useSyncStatus, useHeaderAlerts } from "../lib/useHeaderAlerts.js";
import MarqueeText from "./MarqueeText.jsx";

// İkinci düzen seçeneği — dribbble.com/shots/23885524 ("Fieldwise") referans
// alınarak uyarlandı: sol kenar çubuğu, daraltılabilir (sadece ikon) /
// genişletilebilir (ikon+etiket), bölücülerle kümelenmiş sekmeler, aktif
// öğede vurgu şeridi. Kullanıcı Ayarlar > Görünüm'den Header (üst dock) ile
// bu ikisi arasında seçim yapabiliyor — aynı veriyi/aksiyonları kullanır
// (bkz. src/lib/useHeaderAlerts.js), sadece yerleşimi farklı.
export default function Sidebar({
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
  technicians,
  collapsed,
  onToggleCollapsed,
  onNavStyleChange,
}) {
  const syncInfo = useSyncStatus();
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

  const groupedTabs = TAB_GROUPS.map((ids) => visibleTabs.filter((t) => ids.includes(t.id))).filter(
    (g) => g.length > 0
  );

  return (
    <div className={`sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="sidebar-top">
        <img
          // Daraltılmışken sadece markanın renkli "S" ikonu (icon.png, yazısız,
          // saydam arka planlı) gösterilir; genişletilince tam logo (ikon +
          // "SİTA YAPI" yazısı, temaya göre koyu/beyaz yazı varyantı) döner.
          src={collapsed ? "./icon.png" : isDark ? "./logo-white.svg" : "./logo.svg"}
          alt="Sita Yapı"
          className={`sidebar-logo${collapsed ? " collapsed" : ""}`}
          onClick={() => onTabChange("home")}
        />
        <button
          type="button"
          className="header-icon-btn"
          onClick={onToggleCollapsed}
          title={collapsed ? "Genişlet" : "Daralt"}
          aria-label={collapsed ? "Genişlet" : "Daralt"}
        >
          <Menu size={16} strokeWidth={1.75} />
        </button>
      </div>

      <nav className="sidebar-nav no-scrollbar">
        {groupedTabs.map((group, i) => (
          <div className="sidebar-group" key={i}>
            {group.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`sidebar-item${activeTab === tab.id ? " active" : ""}`}
                onClick={() => onTabChange(tab.id)}
                title={collapsed ? tab.label : undefined}
                aria-label={tab.label}
              >
                <span className="sidebar-item-icon">{tab.icon}</span>
                {!collapsed && (
                  <span className="sidebar-item-label">
                    <MarqueeText text={tab.label} />
                  </span>
                )}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-bottom">
        {issues.length > 0 && (
          <div ref={issuesRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowIssues((s) => !s)}
              title="Adres/harita sorunları"
              className="sidebar-item"
              style={{ color: "var(--danger)" }}
            >
              <span className="sidebar-item-icon">
                <TriangleAlert size={18} strokeWidth={1.75} />
              </span>
              {!collapsed && (
                <span className="sidebar-item-label">
                  <MarqueeText text={`Adres sorunları (${issues.length})`} />
                </span>
              )}
            </button>
            {showIssues && (
              <div className="sidebar-flyout">
                {issues.map((a) => (
                  <div key={a.id} className="sidebar-flyout-row">
                    <button
                      type="button"
                      onClick={() => {
                        setShowIssues(false);
                        onNavigateToIssue(a.id);
                      }}
                      className="sidebar-flyout-main"
                    >
                      <strong>{a.customerName}</strong>
                      <div style={{ opacity: 0.8 }}>{a.geocodeIssue}</div>
                    </button>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Uyarıyı kapat"
                      aria-label="Uyarıyı kapat"
                      onClick={() => onDismissIssue?.(a.id)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {reminderCount > 0 && (
          <div ref={remindersRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setShowReminders((s) => !s)}
              title="Hatırlatmalar"
              className="sidebar-item"
              style={{ color: "var(--accent)" }}
            >
              <span className="sidebar-item-icon">
                <Bell size={18} strokeWidth={1.75} />
              </span>
              {!collapsed && (
                <span className="sidebar-item-label">
                  <MarqueeText text={`Hatırlatmalar (${reminderCount})`} />
                </span>
              )}
            </button>
            {showReminders && (
              <div className="sidebar-flyout">
                {dueReminders.map((o) => (
                  <div key={o.id} className="sidebar-flyout-row">
                    <div className="sidebar-flyout-main" style={{ cursor: "default" }}>
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
                  <div key={p.id} className="sidebar-flyout-row">
                    <div className="sidebar-flyout-main" style={{ cursor: "default" }}>
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
                    <div key={c.id} className="sidebar-flyout-row">
                      <button
                        type="button"
                        onClick={() => {
                          setShowReminders(false);
                          onTabChange("partCheckouts");
                        }}
                        className="sidebar-flyout-main"
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

        <button type="button" className="sidebar-item" onClick={onToggleTheme}>
          <span className="sidebar-item-icon">
            {isDark ? <Sun size={18} strokeWidth={1.75} /> : <Moon size={18} strokeWidth={1.75} />}
          </span>
          {!collapsed && (
            <span className="sidebar-item-label">
              <MarqueeText text={isDark ? "Aydınlık mod" : "Karanlık mod"} />
            </span>
          )}
        </button>

        {/* Görünüm tercihi (üst menü/kenar çubuğu) — tema gibi sadece bu
            cihazda geçerli, bu yüzden Ayarlar'a (admin'e özel) gerek kalmadan
            herkesin erişebileceği bir buton olarak burada duruyor. */}
        <button
          type="button"
          className="sidebar-item"
          onClick={() => onNavStyleChange?.("top")}
          title={collapsed ? "Üst menü görünümüne geç" : undefined}
        >
          <span className="sidebar-item-icon">
            <PanelTop size={18} strokeWidth={1.75} />
          </span>
          {!collapsed && (
            <span className="sidebar-item-label">
              <MarqueeText text="Üst menü görünümü" />
            </span>
          )}
        </button>

        {currentUser && (
          <div className="sidebar-user">
            <div className="sidebar-user-info">
              <span
                title={syncInfo.label}
                style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: syncInfo.color, flexShrink: 0 }}
              />
              {!collapsed && (
                <span className="sidebar-user-name">
                  <MarqueeText text={currentUser.name} />
                </span>
              )}
            </div>
            <button type="button" className="sidebar-item" onClick={onLogout}>
              <span className="sidebar-item-icon">
                <LogOut size={16} strokeWidth={1.75} />
              </span>
              {!collapsed && (
                <span className="sidebar-item-label">
                  <MarqueeText text="Çıkış" />
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
