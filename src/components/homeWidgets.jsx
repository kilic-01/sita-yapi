import { useMemo, useState } from "react";
import { TriangleAlert, Clock, MoreHorizontal, CalendarDays, FileText, Phone, MapPin, Pencil } from "lucide-react";
import { colorForTechnician } from "../lib/techColors.js";
import { TechnicianAvatar } from "../lib/avatars.jsx";
import { computeTotals } from "../lib/orderTotals.js";
import { todayISO, toLocalISODate, STATUS_LABELS, isOnLeave, isLowStock, DEFAULT_LOW_STOCK_THRESHOLD } from "../lib/format.js";
import Modal from "./Modal.jsx";
import { QuoteHeader, ItemTable, QuoteFooter, PRINT_CONTENT_STYLE } from "./QuotePrintView.jsx";

// Anasayfa'daki her widget kendi kendine yeten, tabana koyulan ham veriden
// (appointments/technicians/stockItems/quotes) kendi gösterdiği kısmı
// hesaplayan bağımsız bir bileşen — düzenlenebilir ızgarada (react-grid-layout)
// herhangi bir yere taşınabilsin/boyutlandırılabilsin diye.

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
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

function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function startOfWeekISO() {
  const d = new Date();
  const day = d.getDay(); // 0=Paz..6=Cmt
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toLocalISODate(d);
}

function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toLocalISODate(d);
}

function dowShort(iso) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("tr-TR", { weekday: "short" });
}

export function TodayAppointmentsWidget({ appointments, onNavigate }) {
  const today = todayISO();
  const todaysAppointments = useMemo(
    () => appointments.filter((a) => a.scheduledDate === today),
    [appointments, today]
  );
  const todayCompleted = todaysAppointments.filter((a) => a.status === "completed").length;
  const todayRouted = todaysAppointments.filter((a) => a.status === "routed").length;
  const todayPending = todaysAppointments.filter((a) => a.status === "pending").length;
  const todayUrgent = todaysAppointments.filter(
    (a) => a.urgency === "acil" && a.status !== "completed" && a.status !== "cancelled"
  ).length;

  return (
    <div style={{ cursor: "pointer", height: "100%" }} onClick={() => onNavigate("appointments")}>
      <h3>Bugünün Randevuları</h3>
      <div style={{ fontSize: "2rem", fontWeight: 700 }}>{todaysAppointments.length}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.5rem" }}>
        <small>✔ {todayCompleted} tamamlandı</small>
        <small>➜ {todayRouted} yolda</small>
        <small>⏳ {todayPending} bekliyor</small>
        {todayUrgent > 0 && <span className="badge acil">{todayUrgent} acil</span>}
      </div>
    </div>
  );
}

// Teknisyen izinliyken kendisine atanmış olup dispatcher'ın bilerek
// "bu teknisyende beklet" dediği randevular (heldForLeave) — teknisyen
// izinden döndüğünde (artık isOnLeave === false) burada tekrar hatırlatılır.
export function LeaveReturnRemindersWidget({ appointments, technicians, onNavigateToIssue }) {
  const today = todayISO();
  const reminders = useMemo(() => {
    return appointments
      .filter((a) => a.heldForLeave && a.assignedTechnicianId)
      .map((a) => ({ appointment: a, technician: technicians.find((t) => t.id === a.assignedTechnicianId) }))
      .filter(({ technician }) => technician && !isOnLeave(technician, today));
  }, [appointments, technicians, today]);

  return (
    <div style={{ height: "100%" }}>
      <h3>İzin Dönüşü Bekleyen Randevular</h3>
      {reminders.length === 0 ? (
        <small>Bekleyen hatırlatma yok.</small>
      ) : (
        reminders.slice(0, 6).map(({ appointment, technician }) => (
          <div
            key={appointment.id}
            onClick={() => onNavigateToIssue(appointment.id)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.4rem",
              cursor: "pointer",
              marginBottom: "0.4rem",
            }}
          >
            <Clock size={15} strokeWidth={1.75} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div>
                <strong>{appointment.customerName}</strong> — {appointment.scheduledDate}
              </div>
              <small style={{ opacity: 0.8 }}>{technician.name} izinden döndü, hâlâ ona atanmış</small>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// Bugünden eski, hâlâ "outstanding" kalmış (akşam mutabakatı unutulmuş)
// zimmetler — beklenti aynı gün mutabakat olduğu için bunlar hep bir
// gecikme işareti.
export function OutstandingCheckoutsWidget({ partCheckouts, technicians, onNavigate }) {
  const today = todayISO();
  const overdue = useMemo(
    () => (partCheckouts || []).filter((c) => c.status === "outstanding" && c.date < today),
    [partCheckouts, today]
  );

  return (
    <div style={{ cursor: "pointer", height: "100%" }} onClick={() => onNavigate("partCheckouts")}>
      <h3>Mutabakatı Bekleyen Zimmetler</h3>
      {overdue.length === 0 ? (
        <small>Bekleyen mutabakat yok.</small>
      ) : (
        overdue.slice(0, 6).map((c) => {
          const tech = technicians.find((t) => t.id === c.technicianId);
          return (
            <div
              key={c.id}
              style={{ display: "flex", alignItems: "flex-start", gap: "0.4rem", marginBottom: "0.4rem" }}
            >
              <TriangleAlert size={15} strokeWidth={1.75} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>{tech?.name || "Bilinmeyen teknisyen"}</strong>
                <div style={{ opacity: 0.8 }}>
                  <small>{c.date} tarihli zimmet hâlâ mutabakatsız</small>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function LowStockWidget({ stockItems, onOpenStockItem }) {
  const lowItems = useMemo(() => (stockItems || []).filter(isLowStock), [stockItems]);

  return (
    <div style={{ height: "100%" }}>
      <h3>Az Stoklu Ürünler</h3>
      {lowItems.length === 0 ? (
        <small>Az stoklu ürün yok.</small>
      ) : (
        <>
          {lowItems.slice(0, 6).map((s) => (
            <div
              key={s.id}
              onClick={() => onOpenStockItem?.(s.code)}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.4rem",
                cursor: "pointer",
                marginBottom: "0.4rem",
              }}
            >
              <TriangleAlert size={15} strokeWidth={1.75} color="var(--danger)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <strong>{s.name || s.code}</strong>
                <div style={{ opacity: 0.8 }}>
                  <small>
                    {s.quantity} {s.unit || "adet"} kaldı (eşik: {s.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD})
                  </small>
                </div>
              </div>
            </div>
          ))}
          {lowItems.length > 6 && <small>+{lowItems.length - 6} ürün daha</small>}
        </>
      )}
    </div>
  );
}

// Sadece yönetici hesaplarında görünür (bkz. HOME_WIDGETS'taki adminOnly ve
// HomePage.jsx'in buna göre filtrelemesi) — burada da aynı kontrol tekrar
// yapılır, widget'ın olası bir yanlış kullanımda staff'a sızmaması için.
// Sayılar SADECE ÖZET — tıklanınca ayrı, gizli bir "detay" sekmesine
// (App.jsx'te navTabs'a hiç eklenmemiş, sadece bu widget'tan ulaşılan
// "dayEndSummary") geçilir, mevcut sekme yapısı hiç değişmez.
export function DayEndSummaryWidget({ appointments, pendingParts, currentUser, onNavigate }) {
  const today = todayISO();

  const stats = useMemo(() => {
    const todays = (appointments || []).filter((a) => a.scheduledDate === today);
    return {
      total: todays.length,
      completed: todays.filter((a) => a.status === "completed").length,
      pending: todays.filter((a) => a.status === "pending").length,
      postponed: todays.filter((a) => a.heldForLeave).length,
      carriedOver: todays.filter((a) => a.status !== "completed" && a.status !== "cancelled").length,
      waitingParts: (pendingParts || []).filter((p) => p.status === "bekleniyor").length,
    };
  }, [appointments, pendingParts, today]);

  if (currentUser?.role !== "admin") return null;

  const items = [
    { label: "Toplam Servis", value: stats.total },
    { label: "Tamamlanan", value: stats.completed },
    { label: "Bekleyen", value: stats.pending },
    { label: "Ertelenen", value: stats.postponed },
    { label: "Parça Bekleyen", value: stats.waitingParts },
    { label: "Yarına Kalan", value: stats.carriedOver },
  ];

  return (
    <div
      style={{ height: "100%", cursor: "pointer" }}
      onClick={() => onNavigate?.("dayEndSummary")}
      title="Detaylar için tıklayın"
    >
      <h3>Gün Sonu Özeti</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem" }}>
        {items.map((it) => (
          <div key={it.label}>
            <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{it.value}</div>
            <small style={{ opacity: 0.75 }}>{it.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TomorrowAppointmentsWidget({ appointments, onNavigate }) {
  const tomorrow = tomorrowISO();
  const tomorrowsAppointments = useMemo(
    () => appointments.filter((a) => a.scheduledDate === tomorrow),
    [appointments, tomorrow]
  );
  const tomorrowNotRouted = tomorrowsAppointments.filter((a) => a.status === "pending").length;

  return (
    <div style={{ cursor: "pointer", height: "100%" }} onClick={() => onNavigate("routes")}>
      <h3>Yarının Randevuları</h3>
      <div style={{ fontSize: "2rem", fontWeight: 700 }}>{tomorrowsAppointments.length}</div>
      <small>{formatDayLabel(tomorrow)}</small>
      {tomorrowNotRouted > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <span className="badge acil">{tomorrowNotRouted} iş henüz rotalanmadı</span>
        </div>
      )}
    </div>
  );
}

export function ProgramWidget({ appointments, technicians, currentUser, onEditAppointment }) {
  const today = todayISO();
  const scheduleWeekStart = startOfWeekISO();
  const scheduleDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDaysISO(scheduleWeekStart, i)),
    [scheduleWeekStart]
  );
  const [selectedDay, setSelectedDay] = useState(today);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [infoAppointment, setInfoAppointment] = useState(null);

  function handleCall(a) {
    if (window.confirm(`${a.customerName} (${a.customerPhone}) numarasını aramak istediğinize emin misiniz?`)) {
      window.api.callPhone(a.customerPhone);
    }
  }

  async function handleMarkCompleted(appointmentId) {
    setOpenMenuId(null);
    await window.api.setAppointmentStatus(appointmentId, "completed", currentUser.id);
  }

  const selectedDayAppointments = useMemo(
    () =>
      appointments
        .filter((a) => a.scheduledDate === selectedDay)
        .sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0)),
    [appointments, selectedDay]
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexShrink: 0 }}>
        <CalendarDays size={18} strokeWidth={1.75} />
        <h3 style={{ margin: 0 }}>Program</h3>
      </div>

      <div className="week-strip" style={{ flexShrink: 0 }}>
        {scheduleDays.map((iso) => {
          const isSelected = iso === selectedDay;
          const dayCount = appointments.filter((a) => a.scheduledDate === iso).length;
          return (
            <button
              key={iso}
              type="button"
              className={`week-strip-day${isSelected ? " selected" : ""}`}
              onClick={() => setSelectedDay(iso)}
            >
              {dayCount > 0 && <span className="week-strip-badge">{dayCount}</span>}
              <span className="week-strip-dow">{dowShort(iso)}</span>
              <span className="week-strip-date">{new Date(`${iso}T00:00:00`).getDate()}</span>
            </button>
          );
        })}
      </div>

      {/* Sabit bir maxHeight yerine kalan alanı doldurur (flex:1) — widget
          büyütüldüğünde liste de büyür, aksi halde widget kartı büyürken
          içerik hep aynı küçük yükseklikte kalıp altında boşluk bırakıyordu.
          minHeight:0 flex öğesinde scroll'un çalışması için şart (flexbox'ın
          varsayılan min-height:auto'su olmadan taşma kesilmiyor). */}
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {selectedDayAppointments.length === 0 ? (
          <small>Bu gün için randevu yok.</small>
        ) : (
          selectedDayAppointments.map((a) => {
            const tech = technicians.find((t) => t.id === a.assignedTechnicianId);
            const barColor = tech ? colorForTechnician(tech.id, technicians) : "var(--border)";
            return (
              <div key={a.id} className="schedule-row" onClick={() => setInfoAppointment(a)}>
                <span className="schedule-row-bar" style={{ background: barColor }} />
                <span className="schedule-row-icon">
                  <Clock size={16} strokeWidth={1.75} />
                </span>
                <div className="schedule-row-main">
                  <strong>{a.customerName}</strong>
                  <div className="schedule-row-sub">
                    <small>{a.complaint ? a.complaint.slice(0, 70) : formatDayLabel(a.scheduledDate)}</small>
                  </div>
                </div>
                <div className="schedule-row-side" style={{ position: "relative" }}>
                  {tech && (
                    <span title={tech.name}>
                      <TechnicianAvatar technician={tech} technicians={technicians} size={26} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Diğer"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId((id) => (id === a.id ? null : a.id));
                    }}
                  >
                    <MoreHorizontal size={14} strokeWidth={1.75} />
                  </button>
                  {openMenuId === a.id && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: "absolute",
                        top: "calc(100% + 4px)",
                        right: 0,
                        background: "var(--card-bg)",
                        border: "1px solid var(--border)",
                        borderRadius: 10,
                        boxShadow: "var(--shadow)",
                        minWidth: 190,
                        zIndex: 20,
                        overflow: "hidden",
                      }}
                    >
                      <button
                        type="button"
                        className="dropdown-item"
                        onClick={() => {
                          setOpenMenuId(null);
                          onEditAppointment(a.id);
                        }}
                      >
                        Randevuyu Düzenle
                      </button>
                      {a.status !== "completed" && (
                        <button type="button" className="dropdown-item" onClick={() => handleMarkCompleted(a.id)}>
                          Tamamlandı Olarak İşaretle
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {infoAppointment && (
        <Modal onClose={() => setInfoAppointment(null)}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <div>
                <h3 style={{ margin: 0 }}>{infoAppointment.customerName}</h3>
                {infoAppointment.contactName && <small style={{ opacity: 0.7 }}>{infoAppointment.contactName}</small>}
              </div>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 600,
                  padding: "0.2rem 0.6rem",
                  borderRadius: 999,
                  background:
                    infoAppointment.status === "completed"
                      ? "var(--success)"
                      : infoAppointment.status === "cancelled"
                        ? "var(--danger)"
                        : "var(--accent)",
                  color: "white",
                  whiteSpace: "nowrap",
                }}
              >
                {STATUS_LABELS[infoAppointment.status] || infoAppointment.status}
              </span>
            </div>

            <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {infoAppointment.customerPhone && (
                <button
                  type="button"
                  onClick={() => handleCall(infoAppointment)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: "var(--accent)",
                    textAlign: "left",
                  }}
                >
                  <Phone size={15} strokeWidth={1.75} />
                  {infoAppointment.customerPhone}
                </button>
              )}
              <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
                <MapPin size={15} strokeWidth={1.75} style={{ marginTop: 2, flexShrink: 0, opacity: 0.7 }} />
                <span>{infoAppointment.address}</span>
              </div>
              {infoAppointment.complaint && (
                <div>
                  <small style={{ opacity: 0.7 }}>Şikayet / Not</small>
                  <div>{infoAppointment.complaint}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
                <div>
                  <small style={{ opacity: 0.7, display: "block" }}>Tarih</small>
                  {formatDayLabel(infoAppointment.scheduledDate)}
                </div>
                {infoAppointment.urgency === "acil" && (
                  <div>
                    <small style={{ opacity: 0.7, display: "block" }}>Aciliyet</small>
                    <span style={{ color: "var(--danger)", fontWeight: 700 }}>Acil</span>
                  </div>
                )}
                {infoAppointment.feeAmount != null && (
                  <div>
                    <small style={{ opacity: 0.7, display: "block" }}>Ücret</small>
                    ₺{formatMoney(infoAppointment.feeAmount)} {infoAppointment.feePaid ? "(Ödendi)" : "(Ödenmedi)"}
                  </div>
                )}
              </div>
              {(() => {
                const tech = technicians.find((t) => t.id === infoAppointment.assignedTechnicianId);
                return tech ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <TechnicianAvatar technician={tech} technicians={technicians} size={24} />
                    <span>{tech.name}</span>
                  </div>
                ) : null;
              })()}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  const id = infoAppointment.id;
                  setInfoAppointment(null);
                  onEditAppointment(id);
                }}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Pencil size={15} strokeWidth={1.75} />
                Düzenle
              </button>
              <button type="button" className="secondary" onClick={() => setInfoAppointment(null)}>
                Kapat
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function QuotesWidget({ quotes, onNavigate }) {
  const [infoQuote, setInfoQuote] = useState(null);
  const recentQuotes = useMemo(
    () =>
      [...quotes]
        .sort((a, b) => (a.quoteDate < b.quoteDate ? 1 : a.quoteDate > b.quoteDate ? -1 : 0))
        .slice(0, 5),
    [quotes]
  );

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexShrink: 0 }}>
        <FileText size={18} strokeWidth={1.75} />
        <h3 style={{ margin: 0 }}>Fiyat Teklifleri</h3>
      </div>
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {recentQuotes.length === 0 ? (
          <small>Henüz teklif oluşturulmadı.</small>
        ) : (
          recentQuotes.map((q) => {
            const totals = computeTotals(q.items || [], q.discountRate);
            return (
              <div key={q.id} className="schedule-row" onClick={() => setInfoQuote(q)}>
                <span className="schedule-row-bar" style={{ background: "var(--accent)" }} />
                <span className="schedule-row-icon">
                  <FileText size={16} strokeWidth={1.75} />
                </span>
                <div className="schedule-row-main">
                  <strong>{q.customerName}</strong>
                  <div className="schedule-row-sub">
                    <small>
                      {q.quoteNo} · {formatDate(q.quoteDate)}
                    </small>
                  </div>
                </div>
                <div className="schedule-row-side">
                  <strong>
                    {formatMoney(totals.genelToplam)} {q.currency}
                  </strong>
                </div>
              </div>
            );
          })
        )}
      </div>

      {infoQuote && (
        <Modal onClose={() => setInfoQuote(null)} maxWidth={880}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.75rem 1rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {infoQuote.quoteNo} — {infoQuote.customerName}
              </strong>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setInfoQuote(null);
                  onNavigate("quotes");
                }}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
              >
                <Pencil size={15} strokeWidth={1.75} />
                Düzenle
              </button>
              <button type="button" className="secondary" onClick={() => setInfoQuote(null)}>
                Kapat
              </button>
            </div>

            <div style={{ background: "var(--bg)", padding: "1.5rem", maxHeight: "75vh", overflowY: "auto" }}>
              <div
                style={{
                  ...PRINT_CONTENT_STYLE,
                  maxWidth: "210mm",
                  margin: "0 auto",
                  boxShadow: "0 2px 14px rgba(0,0,0,0.18)",
                  borderRadius: 4,
                }}
              >
                <QuoteHeader quote={infoQuote} />
                <ItemTable items={infoQuote.items || []} startIndex={0} />
                <QuoteFooter quote={infoQuote} totals={computeTotals(infoQuote.items || [], infoQuote.discountRate)} />
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Yükseklikler (h, grid satır birimi) gerçek içerik boyutuna göre elle
// ayarlandı — eskiden hepsi aynı (5 ya da 9) birim kullanıyordu, bu da
// içeriği kısa kalan widget'larda kartın altında boş alan bırakıyordu.
//
// Sıralama önem derecesine göre: en üstte, en geniş yerde Program (günün
// asıl iş listesi — ara, tamamlandı işaretle gibi eylemler burada) ve
// yanındaki aksiyon gerektiren sayaçlar (bugün/yarın); ortada operasyonel
// durum widget'ları; en altta referans niteliğindeki (teklif, izin dönüşü)
// kartlar. Amaç: sayfa açıldığında göz önce "bugün ne yapılması gerekiyor"a
// gitsin, "bilgi amaçlı" kartlar en son görülsün.
export const HOME_WIDGETS = [
  { id: "program", Component: ProgramWidget, defaultLayout: { x: 0, y: 0, w: 8, h: 9 } },
  { id: "todayAppointments", Component: TodayAppointmentsWidget, defaultLayout: { x: 8, y: 0, w: 4, h: 4 } },
  { id: "tomorrowAppointments", Component: TomorrowAppointmentsWidget, defaultLayout: { x: 8, y: 4, w: 4, h: 5 } },
  { id: "lowStock", Component: LowStockWidget, defaultLayout: { x: 0, y: 9, w: 4, h: 5 } },
  { id: "quotes", Component: QuotesWidget, defaultLayout: { x: 0, y: 14, w: 6, h: 6 } },
  { id: "leaveReturnReminders", Component: LeaveReturnRemindersWidget, defaultLayout: { x: 6, y: 14, w: 6, h: 6 } },
  { id: "outstandingCheckouts", Component: OutstandingCheckoutsWidget, defaultLayout: { x: 0, y: 20, w: 6, h: 5 } },
  {
    id: "dayEndSummary",
    Component: DayEndSummaryWidget,
    defaultLayout: { x: 6, y: 20, w: 6, h: 5 },
    adminOnly: true,
  },
];
