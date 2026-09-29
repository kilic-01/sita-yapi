import { useState } from "react";
import { MapPin, Check } from "lucide-react";

// Google'ın konum kesinliği sınıflandırması — checkGeocodeQuality
// (electron/handlers.js) hangi durumda uyarı bastığını buradaki
// GEOMETRIC_CENTER/APPROXIMATE ayrımıyla belirliyor; burada sadece
// dispatcher'a ne kadar güvenilir olduğunu düz Türkçe anlatıyoruz.
const PRECISION_LABELS = {
  ROOFTOP: "bina bazında tam isabet",
  RANGE_INTERPOLATED: "bina numarasına göre tahmin",
  GEOMETRIC_CENTER: "sokak seviyesinde doğru, bina net değil",
  APPROXIMATE: "sadece mahalle/ilçe merkezine yakın tahmin",
};

// Adres uyarısı gösterilen HER yerde (RouteBuilder durak kartı, Header'daki
// "adres sorunları" listesi) aynı iki eylemi sunar: (1) Google'ın bulduğu
// pin'i sistem tarayıcısında aç — Harita sekmesine geçmeye gerek kalmadan
// konumu gözle doğrula, (2) baktıktan sonra konum aslında yeterliyse,
// adresi hiç değiştirmeden uyarıyı kapat. İkincisi öncesinde HİÇ yoktu —
// tek yol adresi yeniden kaydedip yeniden geocode ettirmekti.
export default function GeocodeIssueNotice({ appointment, actingUserId, compact }) {
  const [busy, setBusy] = useState(false);
  if (!appointment.geocodeIssue) return null;

  const precisionLabel = PRECISION_LABELS[appointment.geocodePrecision];
  const canOpenMap = appointment.placeId || (appointment.lat != null && appointment.lng != null);

  async function handleAccept(e) {
    e.stopPropagation();
    setBusy(true);
    try {
      await window.api.updateAppointment(appointment.id, { geocodeIssue: null, actingUserId });
    } finally {
      setBusy(false);
    }
  }

  function handleOpenMap(e) {
    e.stopPropagation();
    window.api.openMapLocation(appointment.placeId, appointment.lat, appointment.lng);
  }

  return (
    <div style={{ marginTop: compact ? "0.2rem" : "0.4rem" }}>
      <div style={{ color: "var(--danger)", fontSize: "0.85em" }}>
        ⚠ {appointment.geocodeIssue}
        {precisionLabel && ` (${precisionLabel})`}
      </div>
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.3rem" }}>
        {canOpenMap && (
          <button type="button" className="secondary" onClick={handleOpenMap} style={{ fontSize: "0.8rem" }}>
            <MapPin size={13} strokeWidth={1.75} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />
            Haritada Gör
          </button>
        )}
        <button
          type="button"
          className="secondary"
          onClick={handleAccept}
          disabled={busy}
          title="Haritadaki konum aslında doğruysa, adresi değiştirmeden bu uyarıyı kapat"
          style={{ fontSize: "0.8rem" }}
        >
          <Check size={13} strokeWidth={1.75} style={{ verticalAlign: "-2px", marginRight: "0.25rem" }} />
          Sorun yok, onayla
        </button>
      </div>
    </div>
  );
}
