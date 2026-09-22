import { useMemo, useState } from "react";
import { STATUS_LABELS, holidayOnDate } from "../lib/format.js";
import { EmptyStateIllustration } from "./illustrations.jsx";

const WEEKDAY_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function startOfCalendarGrid(monthDate) {
  const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const day = firstOfMonth.getDay(); // 0 = Pazar
  const diff = day === 0 ? -6 : 1 - day; // Pazartesi başlangıç
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() + diff);
  return start;
}

export default function CalendarPage({ appointments, technicians, holidays, onEditAppointment }) {
  const [monthDate, setMonthDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [selectedDate, setSelectedDate] = useState(null);

  const byDate = useMemo(() => {
    const map = {};
    for (const a of appointments) {
      (map[a.scheduledDate] ??= []).push(a);
    }
    return map;
  }, [appointments]);

  const gridStart = startOfCalendarGrid(monthDate);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const monthLabel = monthDate.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
  const todayISO = toISO(new Date());
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "-";

  const selectedAppointments = selectedDate
    ? (byDate[selectedDate] || []).sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0))
    : [];

  function shiftMonth(delta) {
    setMonthDate((d) => {
      const next = new Date(d);
      next.setMonth(next.getMonth() + delta);
      return next;
    });
  }

  return (
    <div>
      <div className="card">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
          }}
        >
          <button type="button" className="secondary" onClick={() => shiftMonth(-1)}>
            ‹ Önceki
          </button>
          <h3 style={{ margin: 0, textTransform: "capitalize" }}>{monthLabel}</h3>
          <button type="button" className="secondary" onClick={() => shiftMonth(1)}>
            Sonraki ›
          </button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "0.4rem" }}>
          {WEEKDAY_LABELS.map((label) => (
            <div
              key={label}
              style={{ textAlign: "center", fontWeight: 600, opacity: 0.7, fontSize: "0.8rem" }}
            >
              {label}
            </div>
          ))}
          {cells.map((d) => {
            const iso = toISO(d);
            const inMonth = d.getMonth() === monthDate.getMonth();
            const dayAppointments = byDate[iso] || [];
            const urgentCount = dayAppointments.filter((a) => a.urgency === "acil").length;
            const holiday = holidayOnDate(iso, holidays);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setSelectedDate(iso)}
                title={holiday?.name}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "0.2rem",
                  padding: "0.5rem 0.2rem",
                  minHeight: 56,
                  borderRadius: 8,
                  border: iso === todayISO ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: holiday
                    ? "color-mix(in srgb, var(--danger) 12%, transparent)"
                    : iso === selectedDate
                    ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                    : "var(--card-bg)",
                  opacity: inMonth ? 1 : 0.35,
                  cursor: "pointer",
                }}
              >
                <span style={{ fontSize: "0.85rem", color: holiday ? "var(--danger)" : undefined }}>
                  {d.getDate()}
                </span>
                {holiday && (
                  <span
                    style={{
                      fontSize: "0.6rem",
                      fontWeight: 600,
                      color: "var(--danger)",
                      textAlign: "center",
                      lineHeight: 1.1,
                    }}
                  >
                    {holiday.name}
                  </span>
                )}
                {dayAppointments.length > 0 && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: urgentCount > 0 ? "var(--danger)" : "var(--accent)",
                    }}
                  >
                    {dayAppointments.length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="card">
          <h3>
            {selectedDate}
            {holidayOnDate(selectedDate, holidays) && (
              <span className="badge" style={{ marginLeft: "0.5rem", background: "var(--danger)", color: "white" }}>
                {holidayOnDate(selectedDate, holidays).name}
              </span>
            )}
          </h3>
          {selectedAppointments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "1rem 0" }}>
              <EmptyStateIllustration size={100} />
              <p>Bu tarihte randevu yok.</p>
            </div>
          ) : (
            selectedAppointments.map((a) => (
              <div
                key={a.id}
                onClick={() => onEditAppointment(a)}
                style={{
                  cursor: "pointer",
                  padding: "0.6rem 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <strong>{a.customerName}</strong>{" "}
                <span className={`badge ${a.urgency}`}>
                  {a.urgency === "acil" ? "Acil" : "Normal"}
                </span>
                <div style={{ opacity: 0.8 }}>{a.address}</div>
                <small>
                  {techName(a.assignedTechnicianId)} — {STATUS_LABELS[a.status] || a.status}
                </small>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
