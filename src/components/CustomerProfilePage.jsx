import { useMemo, useState } from "react";
import { findCustomerAppointments, normalizeForMatch } from "../lib/customerMatch.js";
import { STATUS_LABELS, daysSince } from "../lib/format.js";
import Modal from "./Modal.jsx";

// Türkçe'de anlam taşımayan, şikayet metinlerinde sık geçen ama bilgi
// vermeyen kelimeler — "sık geçen kelimeler" listesinden ayıklanır.
const STOPWORDS = new Set([
  "ve", "ile", "bir", "bu", "için", "gidecek", "değişecek", "olacak",
  "var", "yok", "de", "da", "ki", "çok", "az", "the",
]);

function topComplaintWords(appointments, limit = 8) {
  const counts = new Map();
  for (const a of appointments) {
    const words = (a.complaint || "")
      .toLocaleLowerCase("tr")
      .replace(/[^\p{L}\s]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
    for (const w of words) counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);
}

function samePhoneDigits(a, b) {
  return (a || "").replace(/\D/g, "") === (b || "").replace(/\D/g, "");
}

export default function CustomerProfilePage({
  appointment,
  appointments,
  pendingParts = [],
  initialTab = "gecmis",
  onEditAppointment,
  onClose,
}) {
  const [tab, setTab] = useState(initialTab);

  const history = useMemo(
    () =>
      findCustomerAppointments(appointments, {
        name: appointment.customerName,
        phone: appointment.customerPhone,
        addressQuery: null,
      }),
    [appointments, appointment.customerName, appointment.customerPhone]
  );
  // findCustomerAppointments kendi kaydını dışlamıyor (excludeId
  // verilmedi) — bu kayıt zaten eşleşme kriterlerinin kaynağı olduğu için
  // sonuçta olması gerekiyor; olası bir yarış durumuna karşı garantiye
  // almak için burada da ekliyoruz.
  const allVisits = history.some((a) => a.id === appointment.id)
    ? history
    : [appointment, ...history].sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1));

  const totalPaid = allVisits.filter((a) => a.feePaid).reduce((sum, a) => sum + (Number(a.feeAmount) || 0), 0);
  const totalUnpaid = allVisits
    .filter((a) => !a.feePaid && a.feeAmount != null)
    .reduce((sum, a) => sum + (Number(a.feeAmount) || 0), 0);
  const commonWords = topComplaintWords(allVisits);

  // Sadece HÂLÂ BEKLENEN parçalar gösterilir — bu ekran salt okunur bir
  // özet, ekleme/düzenleme/geldi-işaretleme artık randevu düzenleme
  // formunun "Bekleyen Parça" sekmesinden yapılıyor (bkz. AppointmentForm.jsx).
  const waitingParts = useMemo(
    () =>
      pendingParts
        .filter(
          (p) =>
            p.status === "bekleniyor" &&
            normalizeForMatch(p.customerName) === normalizeForMatch(appointment.customerName) &&
            samePhoneDigits(p.customerPhone, appointment.customerPhone)
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [pendingParts, appointment.customerName, appointment.customerPhone]
  );

  return (
    <Modal onClose={onClose} maxWidth={720}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{appointment.customerName}</h3>
        {appointment.customerPhone && <p style={{ marginTop: "-0.5rem", opacity: 0.8 }}>{appointment.customerPhone}</p>}

        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}>
          {[
            { id: "gecmis", label: "Geçmiş" },
            { id: "parcalar", label: `Bekleyen Parçalar${waitingParts.length > 0 ? ` (${waitingParts.length})` : ""}` },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                padding: "0.5rem 0.2rem",
                marginBottom: "-1px",
                fontWeight: tab === t.id ? 700 : 400,
                color: tab === t.id ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "gecmis" && (
          <>
            <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", margin: "1rem 0" }}>
              <div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>{allVisits.length}</div>
                <small style={{ opacity: 0.7 }}>Toplam Ziyaret</small>
              </div>
              <div>
                <div style={{ fontSize: "1.6rem", fontWeight: 700 }}>₺{totalPaid.toLocaleString("tr-TR")}</div>
                <small style={{ opacity: 0.7 }}>Tahsil Edilen</small>
              </div>
              {totalUnpaid > 0 && (
                <div>
                  <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--danger)" }}>
                    ₺{totalUnpaid.toLocaleString("tr-TR")}
                  </div>
                  <small style={{ opacity: 0.7 }}>Tahsil Edilmemiş</small>
                </div>
              )}
            </div>

            {commonWords.length > 0 && (
              <div style={{ marginBottom: "1rem" }}>
                <small style={{ opacity: 0.7, display: "block", marginBottom: "0.3rem" }}>Sık Geçen Şikayetler</small>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {commonWords.map(([word, count]) => (
                    <span key={word} className="badge">
                      {word} ({count})
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ maxHeight: 360, overflowY: "auto" }}>
              {allVisits.map((a) => (
                <div
                  key={a.id}
                  onClick={() => onEditAppointment?.(a)}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    padding: "0.6rem 0",
                    cursor: onEditAppointment ? "pointer" : "default",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                    <strong>{a.scheduledDate || "Tarihsiz"}</strong>
                    <span className={`badge ${a.urgency}`}>{STATUS_LABELS[a.status] || a.status}</span>
                  </div>
                  <div style={{ opacity: 0.8 }}>{a.address || "-"}</div>
                  <div>{a.complaint || <em style={{ opacity: 0.6 }}>Şikayet belirtilmemiş</em>}</div>
                  {a.feeAmount != null && (
                    <small style={{ opacity: 0.7 }}>
                      ₺{Number(a.feeAmount).toLocaleString("tr-TR")} {a.feePaid ? "(tahsil edildi)" : "(tahsil edilmedi)"}
                    </small>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "parcalar" && (
          <div>
            {waitingParts.length === 0 ? (
              <p style={{ opacity: 0.7 }}>Bu müşteri şu anda bir parça beklemiyor.</p>
            ) : (
              waitingParts.map((p) => {
                const since = daysSince(p.orderedAt || p.createdAt);
                return (
                  <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "0.6rem 0" }}>
                    <strong>{p.description}</strong>
                    <div style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                      {since === 0 ? "Bugün sipariş edildi" : `${since} gündür bekleniyor`}
                      {p.orderedAt && ` · Sipariş: ${p.orderedAt}`}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        <div style={{ marginTop: "1rem" }}>
          <button type="button" className="primary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}
