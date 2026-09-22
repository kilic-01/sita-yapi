import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_LABELS, todayISO } from "../lib/format.js";
import { TECH_COLORS, UNASSIGNED_COLOR, colorForTechnician } from "../lib/techColors.js";

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// Leaflet'teki L.divIcon (rastgele HTML) yerine, standart google.maps.Marker
// bir data-URI SVG görsel bekliyor — aynı görünümü (renkli daire + kenarlık +
// numara) SVG olarak üretiyoruz. AdvancedMarkerElement (gerçek HTML) da bir
// seçenekti ama önceden bir "Map ID" oluşturulmasını gerektiriyor — bu ek
// kurulum adımı olmadan çalışsın diye klasik Marker + SVG icon tercih edildi.
function stopIconUrl(fillColor, borderColor, label) {
  // Haritanın kendi rengarenk zemininde (özellikle trafik renkleriyle) düz
  // renkli daireler kayboluyordu — belirginlik için bir dropshadow eklendi.
  // Tuval, gölgenin taşabilmesi için daireden büyük (32x32), ama işaretçinin
  // gerçek konum noktası hâlâ dairenin merkezinde (16,16) kalıyor.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
    <defs>
      <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" flood-color="#000000" flood-opacity="0.55"/>
      </filter>
    </defs>
    <circle cx="16" cy="16" r="10" fill="${fillColor}" stroke="${borderColor}" stroke-width="3" filter="url(#shadow)"/>
    <text x="16" y="20.5" text-anchor="middle" font-size="12" font-weight="700" fill="#fff" font-family="Arial, sans-serif">${escapeHtml(
      label
    )}</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// Dükkan işaretçisi — randevu noktalarıyla karışmasın diye belirgin şekilde
// büyük, farklı formda (kare/yuvarlatılmış köşe) ve üstte gösterilir.
function shopIconUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="34" height="34">
    <rect x="1.5" y="1.5" width="31" height="31" rx="8" fill="#0e2a3b" stroke="#ffffff" stroke-width="3"/>
    <text x="17" y="23" text-anchor="middle" font-size="18">🏠</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}

// Google Maps JS betiği tek seferde yüklenir — sayfa birden çok kez
// açılıp kapansa bile (sekme değişimi) betik tekrar tekrar eklenmez.
let googleMapsLoadPromise = null;
function loadGoogleMaps(apiKey) {
  if (window.google?.maps) return Promise.resolve(window.google.maps);
  if (googleMapsLoadPromise) return googleMapsLoadPromise;
  googleMapsLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => resolve(window.google.maps);
    script.onerror = () => {
      googleMapsLoadPromise = null;
      reject(new Error("Google Maps yüklenemedi — internet bağlantısını kontrol edin."));
    };
    document.head.appendChild(script);
  });
  return googleMapsLoadPromise;
}

export default function MapPage({ appointments, technicians, shopLocation }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [technicianId, setTechnicianId] = useState("all");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loadError, setLoadError] = useState("");
  const [usage, setUsage] = useState(null); // { count, month }

  // Harita bir kez oluşturulur (google.maps.Map + TrafficLayer) — bu, Google'ın
  // ücretlendirdiği "harita açılışı" anına denk gelir, bu yüzden kullanım
  // sayacı da TAM BURADA, sadece ilk kurulumda bir artırılır (filtre
  // değiştirmek/işaretçileri güncellemek yeni bir "açılış" SAYILMAZ).
  useEffect(() => {
    if (!shopLocation || mapRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const apiKey = await window.api.getGoogleMapsApiKey();
        if (!apiKey) {
          setLoadError("Google Maps API anahtarı tanımlı değil (Ayarlar > API Anahtarları).");
          return;
        }
        const gmaps = await loadGoogleMaps(apiKey);
        if (cancelled || mapRef.current) return;
        const map = new gmaps.Map(containerRef.current, {
          center: { lat: shopLocation.lat, lng: shopLocation.lng },
          zoom: 12,
          // Google'ın kendi işletme/nokta ikonları (restoran, market, durak
          // vb.) bizim randevu işaretçilerimizle karışıyordu — kapatıldı.
          // Yollar/trafik rengi bundan etkilenmiyor, sadece POI ikon+etiketleri.
          styles: [
            { featureType: "poi", elementType: "all", stylers: [{ visibility: "off" }] },
            { featureType: "transit", elementType: "all", stylers: [{ visibility: "off" }] },
          ],
        });
        new gmaps.TrafficLayer().setMap(map);
        mapRef.current = map;
        window.api
          .incrementMapUsageCount()
          .then(setUsage)
          .catch(() => {});
      } catch (err) {
        if (!cancelled) setLoadError(err.message || "Google Maps yüklenemedi.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shopLocation]);

  useEffect(() => {
    window.api
      .getMapUsageCount()
      .then(setUsage)
      .catch(() => {});
  }, []);

  const visibleAppointments = useMemo(
    () =>
      appointments.filter(
        (a) =>
          a.lat != null &&
          a.lng != null &&
          a.scheduledDate === selectedDate &&
          (technicianId === "all" || a.assignedTechnicianId === technicianId)
      ),
    [appointments, technicianId, selectedDate]
  );

  useEffect(() => {
    const map = mapRef.current;
    const gmaps = window.google?.maps;
    if (!map || !gmaps) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    let infoWindow = null;

    visibleAppointments.forEach((a) => {
      const fillColor = colorForTechnician(a.assignedTechnicianId, technicians);
      const borderColor = a.urgency === "acil" ? "#c0392b" : "#ffffff";
      const label = a.stopOrder != null ? String(a.stopOrder + 1) : "•";
      const techName = technicians.find((t) => t.id === a.assignedTechnicianId)?.name;
      const marker = new gmaps.Marker({
        position: { lat: a.lat, lng: a.lng },
        map,
        icon: {
          url: stopIconUrl(fillColor, borderColor, label),
          scaledSize: new gmaps.Size(32, 32),
          anchor: new gmaps.Point(16, 16),
        },
      });
      const content = `<strong>${a.stopOrder != null ? `${a.stopOrder + 1}. ` : ""}${escapeHtml(
        a.customerName
      )}</strong><br/>${a.contactName ? `Muhatap: ${escapeHtml(a.contactName)}<br/>` : ""}${escapeHtml(
        a.address
      )}${a.complaint ? `<br/>Şikayet: ${escapeHtml(a.complaint)}` : ""}<br/>${
        techName ? `${escapeHtml(techName)} — ` : ""
      }${a.scheduledDate} — ${STATUS_LABELS[a.status] || a.status}`;
      marker.addListener("click", () => {
        if (!infoWindow) infoWindow = new gmaps.InfoWindow();
        infoWindow.setContent(content);
        infoWindow.open(map, marker);
      });
      markersRef.current.push(marker);
    });

    // Dükkan işaretçisi en son eklenir ki randevu noktalarının altında kalmasın.
    if (shopLocation) {
      const shopMarker = new gmaps.Marker({
        position: { lat: shopLocation.lat, lng: shopLocation.lng },
        map,
        icon: {
          url: shopIconUrl(),
          scaledSize: new gmaps.Size(34, 34),
          anchor: new gmaps.Point(17, 17),
        },
        zIndex: 1000,
      });
      shopMarker.addListener("click", () => {
        if (!infoWindow) infoWindow = new gmaps.InfoWindow();
        infoWindow.setContent("<strong>Dükkan</strong>");
        infoWindow.open(map, shopMarker);
      });
      markersRef.current.push(shopMarker);
    }
  }, [visibleAppointments, shopLocation, technicians, usage]);

  return (
    <div className="card" style={{ position: "relative" }}>
      {usage && (
        <div
          title="Bu ay Harita sekmesinin toplam açılış sayısı — Google Maps'in aylık 10.000 ücretsiz kotasını izlemek için"
          style={{
            position: "absolute",
            top: "1.1rem",
            right: "1.25rem",
            fontSize: "0.78rem",
            padding: "0.3rem 0.7rem",
            borderRadius: 999,
            border: "1px solid var(--border)",
            background: "var(--card-bg)",
            color: usage.count >= 10000 ? "var(--danger)" : "inherit",
            opacity: 0.85,
          }}
        >
          {usage.count.toLocaleString("tr-TR")} / 10.000
        </div>
      )}
      <h3>Harita</h3>
      <div className="form-row">
        <label>
          Gün
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
        <label>
          Teknisyen
          <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
            <option value="all">Tümü</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {technicianId === "all" && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.9rem", marginBottom: "0.75rem" }}>
          {technicians.map((t, idx) => (
            <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: TECH_COLORS[idx % TECH_COLORS.length],
                  display: "inline-block",
                }}
              />
              {t.name}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: "50%",
                background: UNASSIGNED_COLOR,
                display: "inline-block",
              }}
            />
            Atanmamış
          </span>
        </div>
      )}

      <p>
        Her nokta kendi teknisyeninin rengindedir; kırmızı kenarlık acil işi gösterir. Rotalanmış
        işlerde dairenin içinde sıra numarası yazar. Turuncu/kırmızı yollar Google'ın canlı trafik
        verisini gösterir.
      </p>
      {loadError ? (
        <div className="error">{loadError}</div>
      ) : (
        <div ref={containerRef} style={{ height: "65vh", borderRadius: 8 }} />
      )}
    </div>
  );
}
