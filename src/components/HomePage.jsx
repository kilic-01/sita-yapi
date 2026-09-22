import { useState, useMemo, useCallback } from "react";
import {
  Search,
  User,
  Package,
  FileText,
  LayoutGrid,
  RotateCcw,
  Check,
  GripVertical,
  QrCode,
  CalendarPlus,
  BadgeTurkishLira,
} from "lucide-react";
import GridLayout, { useContainerWidth } from "react-grid-layout";
import { UserAvatar } from "../lib/avatars.jsx";
import { HOME_WIDGETS } from "./homeWidgets.jsx";
import { todayISO, toLocalISODate, isLowStock } from "../lib/format.js";
import Modal from "./Modal.jsx";
import AppointmentForm from "./AppointmentForm.jsx";
import QuickSaleModal from "./QuickSaleModal.jsx";

const SEARCH_RESULT_LIMIT = 5;
const COLS = 12;
const ROW_HEIGHT = 30;

function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toLocalISODate(d);
}

function formatDayLabel(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
}

function formatMoney(n) {
  return (Number(n) || 0).toLocaleString("tr-TR", { maximumFractionDigits: 0 });
}

// "dayEndSummary" gibi adminOnly:true işaretli widget'lar staff hesaplarında
// hiç render edilmez VE ızgara düzeninde yer kaplamaz — hem varsayılan hem
// kaydedilmiş düzen hesaplarken bu filtrelenmiş liste kullanılır.
function visibleWidgetsFor(role) {
  return HOME_WIDGETS.filter((w) => !w.adminOnly || role === "admin");
}

function defaultLayout(role) {
  return visibleWidgetsFor(role).map(({ id, defaultLayout: l }) => ({
    i: id,
    x: l.x,
    y: l.y,
    w: l.w,
    h: l.h,
    minW: 3,
    minH: 4,
  }));
}

// "v3": widget'lar önem sırasına göre yeniden düzenlendiğinde (Program
// öne alındı, referans niteliğindeki teklif/izin kartları en alta indi),
// eski anahtarda kayıtlı düzenlerin yeni hiyerarşiyi geçersiz kılmaması
// için anahtar sürümü artırıldı — kullanıcının elle "Sıfırla" demesine
// gerek kalmadan herkes yeni düzeni görür.
function loadLayout(userId, role) {
  try {
    const raw = localStorage.getItem(`sita-home-layout-v3-${userId}`);
    if (!raw) return defaultLayout(role);
    const saved = JSON.parse(raw);
    // Kaydedilmiş düzende olmayan yeni widget'lar varsa (örn. sonradan
    // eklenen bir widget) onları varsayılan konumlarıyla ekliyoruz. Staff
    // hesabında (adminOnly widget'lar hiç dahil değil) daha önce admin
    // olarak kaydedilmiş bir düzende bu widget kalmış olsa bile burada
    // süzülür — savedIds'e admin-only widget dahil olsa bile missing listesi
    // zaten role'e göre süzülmüş defaultLayout'tan geldiği için sorun olmaz.
    const savedIds = new Set(saved.map((l) => l.i));
    const missing = defaultLayout(role).filter((l) => !savedIds.has(l.i));
    const visibleIds = new Set(visibleWidgetsFor(role).map((w) => w.id));
    return [...saved.filter((l) => visibleIds.has(l.i)), ...missing];
  } catch {
    return defaultLayout(role);
  }
}

export default function HomePage({
  appointments,
  technicians,
  stockItems = [],
  quotes = [],
  partCheckouts = [],
  pendingParts = [],
  users = [],
  holidays = [],
  currentUser,
  onNavigate,
  onNavigateToIssue,
  onEditAppointment,
  onOpenStockItem,
  showToast,
}) {
  const today = todayISO();
  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState(() => loadLayout(currentUser.id, currentUser.role));
  const visibleWidgets = useMemo(() => visibleWidgetsFor(currentUser.role), [currentUser.role]);
  const { width: gridWidth, containerRef: gridContainerRef, mounted: gridMounted } = useContainerWidth();
  const [showQuickAppointment, setShowQuickAppointment] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);

  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const phoneTerm = search.replace(/\D/g, "");

  const matchingAppointments = useMemo(() => {
    if (!term) return [];
    return appointments
      .filter(
        (a) =>
          a.customerName.toLowerCase().includes(term) ||
          (a.contactName || "").toLowerCase().includes(term) ||
          a.address.toLowerCase().includes(term) ||
          (phoneTerm.length > 0 && (a.customerPhone || "").replace(/\D/g, "").includes(phoneTerm))
      )
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [appointments, term, phoneTerm]);

  const matchingStock = useMemo(() => {
    if (!term) return [];
    return stockItems
      .filter(
        (s) =>
          (s.code || "").toLowerCase().includes(term) ||
          (s.name || "").toLowerCase().includes(term) ||
          (s.barcode || "").toLowerCase().includes(term)
      )
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [stockItems, term]);

  const matchingQuotes = useMemo(() => {
    if (!term) return [];
    return quotes
      .filter(
        (q) =>
          (q.customerName || "").toLowerCase().includes(term) || (q.quoteNo || "").toLowerCase().includes(term)
      )
      .slice(0, SEARCH_RESULT_LIMIT);
  }, [quotes, term]);

  const hasSearchResults = matchingAppointments.length > 0 || matchingStock.length > 0 || matchingQuotes.length > 0;

  function clearSearch() {
    setSearch("");
  }

  const todaysAppointments = useMemo(
    () => appointments.filter((a) => a.scheduledDate === today),
    [appointments, today]
  );

  // Özet şeridi için: bekleyen tahsilat, bu haftaki tamamlanma oranı, kritik
  // stok. İptal edilen randevular tahsilat ve tamamlanma oranı hesaplarına
  // dahil edilmez — iptal edilen bir iş için ücret beklenmez, tamamlanmama
  // sayılmaz.
  const pendingCollection = todaysAppointments
    .filter((a) => a.status !== "cancelled" && a.feeAmount != null && !a.feePaid)
    .reduce((sum, a) => sum + Number(a.feeAmount), 0);

  const weekStart = daysAgoISO(6);
  const weekAppointments = useMemo(
    () =>
      appointments.filter(
        (a) => a.scheduledDate >= weekStart && a.scheduledDate <= today && a.status !== "cancelled"
      ),
    [appointments, weekStart, today]
  );
  const weekCompleted = weekAppointments.filter((a) => a.status === "completed").length;
  const weekCompletionRate = weekAppointments.length
    ? Math.round((weekCompleted / weekAppointments.length) * 100)
    : 0;

  // "Az Stoklu Ürünler" widget'ıyla aynı eşik mantığını (isLowStock, her
  // ürünün kendi lowStockThreshold'u) kullanır — önceden burada sabit <=2
  // eşiği vardı, bu da iki yerin farklı sayı göstermesine yol açabiliyordu.
  const criticalStockCount = useMemo(() => stockItems.filter(isLowStock).length, [stockItems]);

  const handleLayoutChange = useCallback(
    (newLayout) => {
      setLayout(newLayout);
      try {
        localStorage.setItem(`sita-home-layout-v3-${currentUser.id}`, JSON.stringify(newLayout));
      } catch {
        // localStorage kullanılamıyorsa (gizli sekme vb.) sessizce yoksay —
        // düzen sadece bu oturum için hafızada kalır.
      }
    },
    [currentUser.id]
  );

  function handleReset() {
    const fresh = defaultLayout(currentUser.role);
    setLayout(fresh);
    try {
      localStorage.removeItem(`sita-home-layout-v3-${currentUser.id}`);
    } catch {
      // yoksay
    }
  }

  const widgetProps = {
    appointments,
    technicians,
    stockItems,
    quotes,
    partCheckouts,
    pendingParts,
    currentUser,
    onNavigate,
    onNavigateToIssue,
    onEditAppointment,
    onOpenStockItem,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
          <UserAvatar user={currentUser} users={users.length ? users : [currentUser]} size={40} />
          <div>
            <strong>Merhaba, {currentUser.name}</strong>{" "}
            <small style={{ opacity: 0.7 }}>· {formatDayLabel(today)}</small>
          </div>
        </div>

        <div style={{ position: "relative", flex: 1, maxWidth: 420, marginLeft: "auto" }}>
          <Search
            size={15}
            strokeWidth={1.75}
            style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Müşteri, ürün veya teklif ara…"
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem 0.5rem 2.1rem",
              borderRadius: 999,
              border: "1px solid var(--border)",
              background: "var(--card-bg)",
            }}
          />
          {term && (
            <div
              className="no-scrollbar"
              style={{
                position: "absolute",
                top: "calc(100% + 6px)",
                left: 0,
                right: 0,
                background: "var(--card-bg)",
                border: "1px solid var(--border)",
                borderRadius: 12,
                boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
                maxHeight: 360,
                overflowY: "auto",
                zIndex: 30,
              }}
            >
              {!hasSearchResults && (
                <div style={{ padding: "0.6rem 0.9rem" }}>
                  <small>Sonuç bulunamadı.</small>
                </div>
              )}
              {matchingAppointments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    clearSearch();
                    onNavigateToIssue(a.id);
                  }}
                  className="search-result-row"
                >
                  <User size={15} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{a.customerName}</strong>
                    <div style={{ opacity: 0.8 }}>
                      <small>{a.address}</small>
                    </div>
                  </div>
                </button>
              ))}
              {matchingStock.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    clearSearch();
                    onOpenStockItem?.(s.code);
                  }}
                  className="search-result-row"
                >
                  <Package size={15} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{s.code}</strong>
                    {s.name && <small style={{ opacity: 0.8 }}> {s.name}</small>}
                    {s.barcode && (
                      <QrCode
                        size={13}
                        strokeWidth={1.75}
                        title={`Barkod: ${s.barcode}`}
                        style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                      />
                    )}
                    <div style={{ opacity: 0.8 }}>
                      <small>
                        {s.quantity} {s.unit || "adet"}
                        {s.price != null && (
                          <>
                            {" "}
                            · KDV hariç ₺{Number(s.price).toLocaleString("tr-TR")} · KDV dahil{" "}
                            <strong style={{ opacity: 1, color: "var(--text)" }}>
                              ₺{(Number(s.price) * 1.2).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
                            </strong>
                          </>
                        )}
                      </small>
                    </div>
                  </div>
                </button>
              ))}
              {matchingQuotes.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => {
                    clearSearch();
                    onNavigate("quotes");
                  }}
                  className="search-result-row"
                >
                  <FileText size={15} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
                  <div style={{ minWidth: 0 }}>
                    <strong>{q.customerName}</strong>
                    <div style={{ opacity: 0.8 }}>
                      <small>{q.quoteNo}</small>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="stats-strip">
        <div className="stats-strip-item">
          <span
            className="stats-strip-number"
            style={{ color: pendingCollection === 0 ? "var(--success)" : undefined }}
          >
            ₺{formatMoney(pendingCollection)}
          </span>
          <span className="stats-strip-label">Bekleyen Tahsilat</span>
        </div>
        <div className="stats-strip-divider" />
        <div className="stats-strip-item">
          <span className="stats-strip-number">%{weekCompletionRate}</span>
          <span className="stats-strip-label">Bu Hafta Tamamlandı</span>
        </div>
        <div className="stats-strip-divider" />
        <div className="stats-strip-item">
          <span
            className="stats-strip-number"
            style={{ color: criticalStockCount === 0 ? "var(--success)" : "var(--danger)" }}
          >
            {criticalStockCount}
          </span>
          <span className="stats-strip-label">Kritik Stok</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowQuickSale(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <BadgeTurkishLira size={16} strokeWidth={1.75} />
            Satış
          </button>
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="secondary"
            onClick={() => setShowQuickAppointment(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <CalendarPlus size={16} strokeWidth={1.75} />
            Randevu Oluştur
          </button>
          {editMode && (
            <button
              type="button"
              className="secondary"
              onClick={handleReset}
              style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              <RotateCcw size={15} strokeWidth={1.75} />
              Sıfırla
            </button>
          )}
          <button
            type="button"
            className={editMode ? "primary" : "secondary"}
            onClick={() => setEditMode((v) => !v)}
            title={editMode ? "Düzeni Kaydet" : "Düzeni Düzenle"}
            aria-label={editMode ? "Düzeni Kaydet" : "Düzeni Düzenle"}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            {editMode ? <Check size={15} strokeWidth={1.75} /> : <LayoutGrid size={15} strokeWidth={1.75} />}
          </button>
        </div>
      </div>

      <div ref={gridContainerRef}>
        {gridMounted && (
          <GridLayout
            className="home-grid"
            width={gridWidth}
            layout={layout}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: [16, 16], containerPadding: [0, 0] }}
            dragConfig={{ enabled: editMode, handle: ".home-widget-handle" }}
            resizeConfig={{ enabled: editMode }}
            onLayoutChange={handleLayoutChange}
          >
            {visibleWidgets.map(({ id, Component }) => (
              <div key={id} className={`card home-grid-item${editMode ? " editing" : ""}`}>
                {editMode && (
                  <div className="home-widget-handle">
                    <GripVertical size={14} strokeWidth={1.75} />
                    <small>Taşımak için sürükle</small>
                  </div>
                )}
                <div
                  className="no-scrollbar"
                  style={{ height: "100%", overflow: "auto", pointerEvents: editMode ? "none" : "auto" }}
                >
                  <Component {...widgetProps} />
                </div>
              </div>
            ))}
          </GridLayout>
        )}
      </div>

      {showQuickAppointment && (
        <Modal onClose={() => setShowQuickAppointment(false)}>
          <AppointmentForm
            editingAppointment={null}
            onSaved={() => {
              setShowQuickAppointment(false);
              showToast?.("success", "Randevu kaydedildi.");
            }}
            actingUserId={currentUser.id}
            appointments={appointments}
            holidays={holidays}
            stockItems={stockItems}
            users={users}
            technicians={technicians}
          />
        </Modal>
      )}

      {showQuickSale && (
        <QuickSaleModal
          stockItems={stockItems}
          currentUser={currentUser}
          onClose={() => setShowQuickSale(false)}
          onSaved={() => showToast?.("success", "Satış kaydedildi.")}
        />
      )}
    </div>
  );
}
