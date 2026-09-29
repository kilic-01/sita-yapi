import { useMemo, useState } from "react";
import PrintView from "./PrintView.jsx";
import GeocodeIssueNotice from "./GeocodeIssueNotice.jsx";
import { STATUS_LABELS, toLocalISODate, isOnLeave, holidayOnDate } from "../lib/format.js";

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
}

export default function RouteBuilder({ appointments, technicians, holidays, onAppointmentPatch, actingUserId }) {
  const [scheduledDate, setScheduledDate] = useState(tomorrowISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const dayAppointments = useMemo(
    () => appointments.filter((a) => a.scheduledDate === scheduledDate),
    [appointments, scheduledDate]
  );

  const routes = useMemo(
    () =>
      technicians
        // Çıraklar otomatik rota oluşturmada rota alamaz, bu yüzden normalde
        // burada gösterilmezler — ama dispatcher onlara elle tek bir randevu
        // verdiyse (bkz. AppointmentForm/handleReassign) o gün için bir rota
        // kartı yine de görünmeli, yoksa atanan iş "kaybolmuş" gibi durur.
        .filter(
          (technician) =>
            technician.assignable !== false ||
            dayAppointments.some((a) => a.assignedTechnicianId === technician.id)
        )
        .map((technician) => ({
          technician,
          stops: dayAppointments
            .filter(
              (a) =>
                (a.status === "routed" || a.status === "completed") &&
                a.assignedTechnicianId === technician.id
            )
            .sort((a, b) => (a.stopOrder ?? 0) - (b.stopOrder ?? 0)),
        })),
    [dayAppointments, technicians]
  );

  // Backend'deki buildRoutes ile aynı mantık: adresi geocode edilememiş VEYA
  // geocode kalitesi şüpheli (yanlış ilçe/kaba tahmin) işler artık o gün
  // gerçekten konumlanmış en yakın durağın teknisyenine otomatik iliştiriliyor
  // (bkz. handlers.js pickNearestTechnicianId) — bu yüzden status "routed"a
  // döner ve aşağıdaki `unresolvedIssue`de DEĞİL, doğrudan ilgili teknisyenin
  // rota kartında (⚠ işaretiyle) görünür. Burada (`status === "pending"`)
  // sadece HİÇBİR teknisyene bağdaştırılamayan (o gün başka rotalanmış iş
  // yok, ya da aynı ilçede eşleşme de yok) gerçekten "tıkanmış" randevular
  // kalır — dispatcher'ın elle müdahalesi gerekir.
  //
  // İki ayrı durum var, kullanıcıya farklı gösterilmeli: `geocodeIssue`
  // dolu olanlar GERÇEKTEN sorunlu (Google adresi bulamadı/düşük
  // güvenilirlikte buldu — müdahale gerekiyor). `lat == null` ama
  // `geocodeIssue` de boş olanlar ise randevu yeni eklenmiş, geocoding
  // arkaplanda henüz bitmemiş demektir (bkz. handlers.js
  // runBackgroundGeocode) — birkaç saniye içinde kendiliğinden çözülür,
  // "sorun" gibi gösterip dispatcher'ı yanlış alarma sokmamalı.
  const unresolvedIssue = useMemo(
    () => dayAppointments.filter((a) => a.status === "pending" && a.geocodeIssue),
    [dayAppointments]
  );
  const pendingLocation = useMemo(
    () => dayAppointments.filter((a) => a.status === "pending" && a.lat == null && !a.geocodeIssue),
    [dayAppointments]
  );

  const hasRoutes = routes.some((r) => r.stops.length > 0);

  async function handleBuild() {
    setLoading(true);
    setError("");
    try {
      // buildRoutes artık sadece o günün randevularını çekiyor (bkz.
      // db.js'teki getAppointmentsByDate) ama dönüşte tüm ~20 bin+ satırlık
      // tabloyu yeniden çekmek (onRouted()) hâlâ eskisi kadar yavaştı —
      // handlers.js zaten güncellenen her durağı (status/assignedTechnicianId/
      // stopOrder ile) `routes` içinde tam olarak döndürüyor, o yüzden burada
      // doğrudan bu durakları yerel state'e işliyoruz. Konum-güncellemesi
      // sırasında atanamayan (stillUnassigned) nadir durum gibi buradan
      // yakalanmayan değişiklikler, artık ucuz olan realtime yamalamayla
      // (bkz. App.jsx refreshAppointmentsFromRealtime) kısa süre içinde
      // kendiliğinden gelir.
      const result = await window.api.buildRoutes(scheduledDate, actingUserId);
      for (const { stops } of result.routes) {
        for (const stop of stops) {
          onAppointmentPatch?.(stop);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleReassign(appointmentId, technicianId) {
    const updated = await window.api.reassignAppointment(appointmentId, technicianId, actingUserId);
    // Tüm ~20 bin+ satırlık randevu tablosunu yeniden çekmek (onRouted())
    // yerine — geri dönen tek satırı doğrudan yerel state'e işliyoruz, ki
    // teknisyen değiştirmek anında yansısın.
    onAppointmentPatch?.(updated);
  }

  async function handleStatusChange(appointmentId, status) {
    const updated = await window.api.setAppointmentStatus(appointmentId, status, actingUserId);
    onAppointmentPatch?.(updated);
  }

  function handlePrint() {
    window.api.printCurrent({ landscape: true });
  }

  return (
    <div>
      <div className="card">
        <div className="form-row">
          <label>
            Gün
            <input
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
            {holidayOnDate(scheduledDate, holidays) && (
              <small style={{ color: "var(--danger)" }}>
                Bu gün "{holidayOnDate(scheduledDate, holidays).name}" tatiline denk geliyor.
              </small>
            )}
          </label>
        </div>
        <button className="primary" onClick={handleBuild} disabled={loading}>
          {loading
            ? "Rotalar hesaplanıyor…"
            : hasRoutes
            ? "Rotaları Yeniden Oluştur"
            : "Rotaları Oluştur"}
        </button>
        {hasRoutes && (
          <button
            className="secondary"
            style={{ marginLeft: "0.75rem" }}
            onClick={handlePrint}
          >
            Yazdır
          </button>
        )}
        {error && <div className="error">{error}</div>}
        {unresolvedIssue.length > 0 && (
          <div className="error">
            {unresolvedIssue.length} randevu adres konumu bulunamadığı ya da güvenilir olmadığı için hiçbir
            teknisyene bağdaştırılamadı (o gün başka rotalanmış iş yok ya da aynı ilçede eşleşme bulunamadı):{" "}
            {unresolvedIssue.map((a) => a.customerName).join(", ")}. Bu randevuları Randevular
            sekmesinden açıp adresi düzeltip tekrar kaydedin, ya da elle bir teknisyene atayın.
          </div>
        )}
        {pendingLocation.length > 0 && (
          <div style={{ opacity: 0.75 }}>
            <small>
              {pendingLocation.length} randevunun konumu henüz kontrol ediliyor ({pendingLocation
                .map((a) => a.customerName)
                .join(", ")}
              ) — birkaç saniye içinde otomatik tamamlanır, tekrar denemenize gerek yok.
            </small>
          </div>
        )}
      </div>

      {hasRoutes && (
        <div className="card">
          <h3>{scheduledDate} için rotalar</h3>
          <div className="route-columns">
            {routes.map((r) => (
              <div className="tech-column" key={r.technician.id}>
                <h3>
                  {r.technician.name}
                  {isOnLeave(r.technician, scheduledDate) && (
                    <span className="badge" style={{ marginLeft: "0.5rem", fontWeight: 400 }}>
                      İzinli
                    </span>
                  )}
                </h3>
                <div className="stops">
                  {r.stops.length === 0 && <p>Bu teknisyene atanan iş yok.</p>}
                  {r.stops.map((s, idx) => (
                    <div
                      className={`stop ${s.urgency}`}
                      key={s.id}
                      style={s.status === "completed" ? { opacity: 0.55 } : undefined}
                    >
                      <strong>
                        {idx + 1}. {s.customerName}
                        {s.status === "completed" ? " ✔" : ""}
                      </strong>
                      <div>{s.address}</div>
                      <GeocodeIssueNotice appointment={s} actingUserId={actingUserId} compact />
                      {s.complaint && <div>Şikayet: {s.complaint}</div>}
                      {s.estimatedDurationMinutes && (
                        <div>Tahmini süre: {s.estimatedDurationMinutes} dk</div>
                      )}
                      <span className={`badge ${s.urgency}`}>
                        {s.urgency === "acil" ? "Acil" : "Normal"}
                      </span>
                      {/* Dar rota kolonlarında ("route-columns" min-width:260px)
                          iki select'i yan yana koymak (eski tasarım) uzun
                          teknisyen adlarıyla kolonun dışına taşıyordu — alt
                          alta, tam genişlikte istiflendi. */}
                      <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        <label style={{ margin: 0 }}>
                          Teknisyen
                          <select
                            value={r.technician.id}
                            onChange={(e) => handleReassign(s.id, e.target.value)}
                          >
                            {/* "assignable" sadece otomatik rota oluşturma
                                havuzunu belirler — elle devirde tüm
                                teknisyenler ayrım yapılmadan tek listede. */}
                            {technicians
                              .filter((t) => t.id === r.technician.id || !isOnLeave(t, scheduledDate))
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                  {isOnLeave(t, scheduledDate) ? " (İzinli)" : ""}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label style={{ margin: 0 }}>
                          Durum
                          <select
                            value={s.status}
                            onChange={(e) => handleStatusChange(s.id, e.target.value)}
                          >
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {hasRoutes && <PrintView routes={routes} scheduledDate={scheduledDate} />}
    </div>
  );
}
