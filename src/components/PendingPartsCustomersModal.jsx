import { useMemo } from "react";
import { X } from "lucide-react";
import Modal from "./Modal.jsx";
import { normalizeForMatch } from "../lib/customerMatch.js";
import { daysSince } from "../lib/format.js";

// Parçası "geldi" olarak işaretlenen bir müşteri, bir sonraki yenilemede
// (pendingParts realtime ile güncellendiğinde) burada GÖRÜNMEZ olur — bu
// listenin filtresi zaten SADECE status === "bekleniyor" kayıtlara bakıyor.
export default function PendingPartsCustomersModal({ pendingParts, appointments, onSelectCustomer, onClose }) {
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of pendingParts) {
      if (p.status !== "bekleniyor") continue;
      const key = `${normalizeForMatch(p.customerName)}|${(p.customerPhone || "").replace(/\D/g, "")}`;
      const existing = map.get(key);
      if (existing) existing.parts.push(p);
      else map.set(key, { customerName: p.customerName, customerPhone: p.customerPhone, parts: [p] });
    }
    return [...map.values()]
      .map((g) => ({
        ...g,
        oldest: g.parts.reduce((min, p) => {
          const d = p.orderedAt || p.createdAt;
          return !min || (d && d < min) ? d : min;
        }, null),
      }))
      .sort((a, b) => ((a.oldest || "") < (b.oldest || "") ? -1 : 1));
  }, [pendingParts]);

  // Bu müşteriye ait bir randevu bulup Müşteri Profili popup'ını onunla
  // açıyoruz (o popup zaten "appointment" nesnesi üzerinden çalışıyor).
  // Hiç randevusu yoksa (olağan dışı bir durum — bekleyen parça normalde
  // bir randevu düzenlenirken eklenir) sadece isim/telefon ile minimal
  // bir nesne kuruyoruz.
  function findAnchorAppointment(customerName, customerPhone) {
    const matches = appointments.filter(
      (a) =>
        normalizeForMatch(a.customerName) === normalizeForMatch(customerName) &&
        (a.customerPhone || "").replace(/\D/g, "") === (customerPhone || "").replace(/\D/g, "")
    );
    if (matches.length) {
      return [...matches].sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1))[0];
    }
    return { id: null, customerName, customerPhone, contactName: "", addressDetail: null };
  }

  return (
    <Modal onClose={onClose} maxWidth={560}>
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
          <strong style={{ flex: 1 }}>Parça Bekleyen Müşteriler</strong>
          <button type="button" className="icon-btn" title="Kapat" aria-label="Kapat" onClick={onClose}>
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto" }}>
          {groups.length === 0 ? (
            <p style={{ padding: "1rem" }}>Şu anda parça bekleyen müşteri yok.</p>
          ) : (
            groups.map((g) => {
              const since = daysSince(g.oldest);
              return (
                <button
                  type="button"
                  key={`${g.customerName}|${g.customerPhone}`}
                  onClick={() => onSelectCustomer(findAnchorAppointment(g.customerName, g.customerPhone))}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    borderBottom: "1px solid var(--border)",
                    padding: "0.6rem 1rem",
                    cursor: "pointer",
                    color: "inherit",
                  }}
                >
                  <strong>{g.customerName}</strong>
                  <div style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                    {g.parts.length > 1 ? `${g.parts.length} parça · ` : ""}
                    {since === 0 ? "Bugün sipariş edildi" : `${since} gündür bekliyor`}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </Modal>
  );
}
