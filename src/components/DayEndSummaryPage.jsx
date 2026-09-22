import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { STATUS_LABELS, todayISO } from "../lib/format.js";

// Anasayfa'daki "Gün Sonu Özeti" widget'ından (bkz. homeWidgets.jsx
// DayEndSummaryWidget) tıklanınca açılan detay görünümü — navTabs.jsx'e
// HİÇ eklenmedi, bu yüzden üst menüde/kenar çubuğunda görünmez, sadece
// widget üzerinden ulaşılır. Sadece admin görebilir (widget zaten
// staff'a hiç render edilmiyor, ama biri activeTab'ı doğrudan değiştirse
// bile burada da aynı kontrol tekrar ediliyor).
function AppointmentRow({ a, technicians, onEditAppointment }) {
  const techName = technicians.find((t) => t.id === a.assignedTechnicianId)?.name;
  return (
    <button
      type="button"
      onClick={() => onEditAppointment(a.id)}
      className="schedule-row"
      style={{ width: "100%", textAlign: "left" }}
    >
      <div className="schedule-row-main">
        <div>
          <strong>{a.customerName}</strong> — {a.address}
        </div>
        <div className="schedule-row-sub">
          <small>
            {techName || "Atanmamış"} · {STATUS_LABELS[a.status] || a.status}
          </small>
        </div>
      </div>
    </button>
  );
}

export default function DayEndSummaryPage({
  appointments,
  pendingParts,
  technicians,
  currentUser,
  onNavigate,
  onEditAppointment,
}) {
  const today = todayISO();

  const groups = useMemo(() => {
    const todays = (appointments || []).filter((a) => a.scheduledDate === today);
    return {
      completed: todays.filter((a) => a.status === "completed"),
      pending: todays.filter((a) => a.status === "pending"),
      postponed: todays.filter((a) => a.heldForLeave),
      carriedOver: todays.filter((a) => a.status !== "completed" && a.status !== "cancelled"),
      waitingParts: (pendingParts || []).filter((p) => p.status === "bekleniyor"),
    };
  }, [appointments, pendingParts, today]);

  if (currentUser?.role !== "admin") {
    return (
      <div className="card">
        <p>Bu sayfayı görüntüleme yetkiniz yok.</p>
      </div>
    );
  }

  function Section({ title, list, empty }) {
    return (
      <div className="card">
        <h3>
          {title} ({list.length})
        </h3>
        {list.length === 0 ? (
          <p style={{ marginTop: 0 }}>
            <small style={{ opacity: 0.7 }}>{empty}</small>
          </p>
        ) : (
          list.map((a) => (
            <AppointmentRow key={a.id} a={a} technicians={technicians} onEditAppointment={onEditAppointment} />
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="secondary"
        onClick={() => onNavigate("home")}
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}
      >
        <ArrowLeft size={16} strokeWidth={1.75} />
        Anasayfa'ya Dön
      </button>

      <h2 style={{ marginTop: 0 }}>Gün Sonu Özeti</h2>

      <Section title="Tamamlanan" list={groups.completed} empty="Bugün tamamlanan iş yok." />
      <Section title="Bekleyen" list={groups.pending} empty="Bekleyen iş yok." />
      <Section title="Ertelenen" list={groups.postponed} empty="Ertelenen iş yok." />
      <Section title="Yarına Kalan" list={groups.carriedOver} empty="Yarına kalan iş yok." />

      <div className="card">
        <h3>Parça Bekleyen ({groups.waitingParts.length})</h3>
        {groups.waitingParts.length === 0 ? (
          <p style={{ marginTop: 0 }}>
            <small style={{ opacity: 0.7 }}>Bekleyen parça yok.</small>
          </p>
        ) : (
          groups.waitingParts.map((p) => (
            <div key={p.id} className="schedule-row">
              <div className="schedule-row-main">
                <div>
                  <strong>{p.customerName}</strong> — {p.description}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
