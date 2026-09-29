import { useEffect, useMemo, useRef, useState } from "react";
import { STATUS_LABELS, todayISO } from "../lib/format.js";
import { TECH_COLORS, UNASSIGNED_COLOR, colorForTechnician } from "../lib/techColors.js";
import ToggleSwitch from "./ToggleSwitch.jsx";
import Modal from "./Modal.jsx";
import serviceAreas from "../data/serviceAreas.json";
import serviceAreaMaskHoles from "../data/serviceAreaMaskHoles.json";

// Yetki alanı (bize ait mahalleler) — ilçe başına ayırt edici renk. Veri
// OpenStreetMap/Nominatim'den (ODbL) tek seferlik çekilip src/data/serviceAreas.json
// içine gömüldü; canlı bir API'ye bağımlılık yok.
// NOT: anahtar "Kâğıthane" olarak (düzeltme işaretiyle) yazılıyor çünkü
// Nominatim'in döndürdüğü ilçe adı tam olarak bu — düz "Kağıthane" ile
// eşleşmediği için önceden bu ilçe hep varsayılan gri renkte kalıyordu.
const DISTRICT_COLORS = {
  "Beşiktaş": "#4c8bff",
  "Eyüpsultan": "#3ecf7a",
  "Kâğıthane": "#ffb020",
  "Sarıyer": "#c77dff",
};
const DEFAULT_DISTRICT_COLOR = "#9aa6ad";

// "Mahalle Listesi" popup'ı için — serviceAreas.json'daki 87 mahalleyi
// ilçeye göre gruplayıp alfabetik sıralıyor. Veri statik olduğundan bir kez,
// modül yüklenirken hesaplanıyor (her render'da yeniden gruplamaya gerek yok).
const AREAS_BY_ILCE = (() => {
  const byIlce = new Map();
  for (const f of serviceAreas.features) {
    const { ilce, mahalle } = f.properties;
    if (!byIlce.has(ilce)) byIlce.set(ilce, []);
    byIlce.get(ilce).push(mahalle);
  }
  for (const list of byIlce.values()) list.sort((a, b) => a.localeCompare(b, "tr"));
  return Array.from(byIlce.entries()).sort((a, b) => a[0].localeCompare(b[0], "tr"));
})();

// Yetki alanının DIŞINDA kalan her yeri karartan, dış çerçeveye "delik"
// açılmış tek bir Polygon. Delik olarak doğrudan 87 mahallenin ham
// sınırlarını kullanmak İKİ ayrı şekilde bozuluyordu:
//   1) Dünya çapında (lat ±85, lng ±180) devasa bir dış çerçeveyle
//      denendiğinde çerçeve hiç render olmuyor, sadece delikler kendi
//      başlarına dolu şekiller olarak çiziliyordu (görünüm TAM TERSİ).
//   2) Makul boyutlu bir çerçeveyle denendiğinde de (bu sefer) delikler HİÇ
//      açılmıyordu — komşu mahalleler birbirine bitişik/örtüşen kenarlara
//      sahip olduğundan (87 ayrı, birbirine değen "delik"), Google'ın
//      tessellation'ı bunu geçersiz/karışık bir şekil olarak yorumlayıp
//      TÜM alanı (içi de dışı da) dolduruyordu.
// Çözüm: 87 mahalleyi src/data/serviceAreaMaskHoles.json'da (bkz. o dosyayı
// üreten tek seferlik Shapely script'i) TEK bir temiz, birbirine değmeyen
// halka setine birleştirip (union + iç boşluklar korunarak) SADECE bu
// halkaları delik olarak kullanıyoruz. Stroke çizimi hâlâ ham 87 mahalleyi
// kullanıyor (aşağıdaki areasLayer) — bu değişiklik sadece karartma
// maskesini etkiliyor.
const WORLD_MASK_RING = [
  { lat: 39.5, lng: 27 },
  { lat: 39.5, lng: 31 },
  { lat: 42, lng: 31 },
  { lat: 42, lng: 27 },
];

const MASK_HOLE_PATHS = serviceAreaMaskHoles.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// Google'ın InfoWindow'u kendi içeriğini sayfanın DOM'una gerçek (izole
// olmayan) bir <div> olarak ekliyor — bu yüzden uygulamanın global koyu tema
// CSS'i (body { color: var(--text) }, koyu modda neredeyse beyaz) buraya da
// sızıyordu: InfoWindow'un zemini her zaman beyaz kaldığı için metin
// "gri/soluk" görünüp okunmuyordu. Rengi burada AÇIKÇA koyu olarak sabitleyip
// temadan bağımsız hale getiriyoruz.
function infoHtml(inner) {
  return `<div style="color:#182430;">${inner}</div>`;
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
  const serviceAreasLayerRef = useRef(null);
  const serviceAreasMaskRef = useRef(null);
  const trafficLayerRef = useRef(null);
  const directionsRendererRef = useRef(null);
  const [technicianId, setTechnicianId] = useState("all");
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loadError, setLoadError] = useState("");
  const [usage, setUsage] = useState(null); // { count, month }
  const [showServiceAreas, setShowServiceAreas] = useState(false);
  const [showTraffic, setShowTraffic] = useState(true);
  const [showAreaList, setShowAreaList] = useState(false);
  const [routeFromId, setRouteFromId] = useState("");
  const [routeToId, setRouteToId] = useState("");
  const [routeResult, setRouteResult] = useState(null);
  const [routeError, setRouteError] = useState("");
  const [routeLoading, setRouteLoading] = useState(false);

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
        // Trafik varsayılan olarak AÇIK — kullanıcı isterse "Trafiği göster"
        // anahtarını kapatıp haritayı trafik bilgisi olmadan inceleyebilir
        // (bkz. aşağıdaki effect).
        trafficLayerRef.current = new gmaps.TrafficLayer();
        trafficLayerRef.current.setMap(showTraffic ? map : null);

        // Yetki alanı DIŞINDA kalan her yeri karartan tek bir maske Polygon'u
        // (dünya çerçevesi + her mahalle için bir "delik").
        const maskPolygon = new gmaps.Polygon({
          paths: [WORLD_MASK_RING, ...MASK_HOLE_PATHS],
          fillColor: "#05080c",
          fillOpacity: 0.5,
          strokeOpacity: 0,
          clickable: false,
          zIndex: 1,
          map: showServiceAreas ? map : null,
        });
        serviceAreasMaskRef.current = maskPolygon;

        // Mahalle sınırları — harita içeride normal (aydınlık) haliyle
        // kalır, sadece ilçe başına ayırt edici renkte ince bir çizgi
        // çiziliyor. Dolgu YOK (komşu mahallelerin renkleri birbirine
        // karışmasın diye).
        const areasLayer = new gmaps.Data({ map: showServiceAreas ? map : null });
        areasLayer.addGeoJson(serviceAreas);
        areasLayer.setStyle((feature) => {
          const color = DISTRICT_COLORS[feature.getProperty("ilce")] || DEFAULT_DISTRICT_COLOR;
          return {
            fillOpacity: 0,
            strokeColor: color,
            strokeWeight: 2,
            strokeOpacity: 0.95,
            clickable: true,
            zIndex: 2,
          };
        });
        let areasInfoWindow = null;
        areasLayer.addListener("click", (e) => {
          if (!areasInfoWindow) areasInfoWindow = new gmaps.InfoWindow();
          areasInfoWindow.setPosition(e.latLng);
          areasInfoWindow.setContent(
            infoHtml(
              `<strong>${escapeHtml(e.feature.getProperty("mahalle"))}</strong><br/>${escapeHtml(
                e.feature.getProperty("ilce")
              )}`
            )
          );
          areasInfoWindow.open(map);
        });
        serviceAreasLayerRef.current = areasLayer;

        // İki randevu arasındaki rotayı çizmek için — canlı trafik süresi
        // hesaplandığında (handleCalculateRoute) burada gösteriliyor.
        directionsRendererRef.current = new gmaps.DirectionsRenderer({
          map,
          suppressMarkers: true,
          preserveViewport: false,
          polylineOptions: { strokeColor: "#1a73e8", strokeWeight: 5, strokeOpacity: 0.85 },
        });

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

  useEffect(() => {
    const map = showServiceAreas ? mapRef.current : null;
    serviceAreasLayerRef.current?.setMap(map);
    serviceAreasMaskRef.current?.setMap(map);
  }, [showServiceAreas]);

  useEffect(() => {
    trafficLayerRef.current?.setMap(showTraffic ? mapRef.current : null);
  }, [showTraffic]);

  // Filtre (gün/teknisyen) değişince o an haritada gösterilen randevu
  // listesi değişir — eski seçili başlangıç/bitiş artık listede olmayabilir,
  // bu yüzden seçim ve çizili rota temizlenir.
  useEffect(() => {
    setRouteFromId("");
    setRouteToId("");
    setRouteResult(null);
    setRouteError("");
    const renderer = directionsRendererRef.current;
    if (renderer) {
      renderer.setMap(null);
      renderer.setMap(mapRef.current);
    }
  }, [selectedDate, technicianId]);

  async function handleCalculateRoute() {
    const gmaps = window.google?.maps;
    const from = visibleAppointments.find((a) => a.id === routeFromId);
    const to = visibleAppointments.find((a) => a.id === routeToId);
    if (!gmaps || !from || !to) return;

    setRouteLoading(true);
    setRouteError("");
    setRouteResult(null);
    try {
      const directionsService = new gmaps.DirectionsService();
      const result = await directionsService.route({
        origin: { lat: from.lat, lng: from.lng },
        destination: { lat: to.lat, lng: to.lng },
        travelMode: gmaps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(),
          trafficModel: gmaps.TrafficModel.BEST_GUESS,
        },
      });
      directionsRendererRef.current?.setDirections(result);
      const leg = result.routes[0]?.legs[0];
      setRouteResult({
        distanceText: leg?.distance?.text,
        durationText: leg?.duration?.text,
        durationInTrafficText: leg?.duration_in_traffic?.text,
      });
    } catch (err) {
      setRouteError(
        "Rota hesaplanamadı — " +
          (err?.message || "Directions API bu anahtar için etkin olmayabilir (Google Cloud Console).")
      );
    } finally {
      setRouteLoading(false);
    }
  }

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
        // Tamamlanmış işler haritadan tamamen kaybolmasın (dispatcher günü
        // takip ederken "bu iş bitti mi yoksa hiç mi yoktu" ayrımını
        // yapamıyordu) — RouteBuilder'daki tamamlanmış duraklar için
        // kullanılan aynı soluklaştırma (opacity: 0.55) burada da uygulanıyor.
        opacity: a.status === "completed" ? 0.55 : 1,
      });
      const content = infoHtml(
        `<strong>${a.stopOrder != null ? `${a.stopOrder + 1}. ` : ""}${escapeHtml(
          a.customerName
        )}</strong><br/>${a.contactName ? `Muhatap: ${escapeHtml(a.contactName)}<br/>` : ""}${escapeHtml(
          a.address
        )}${a.complaint ? `<br/>Şikayet: ${escapeHtml(a.complaint)}` : ""}<br/>${
          techName ? `${escapeHtml(techName)} — ` : ""
        }${a.scheduledDate} — ${STATUS_LABELS[a.status] || a.status}`
      );
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
        infoWindow.setContent(infoHtml("<strong>Dükkan</strong>"));
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

      {/* Veri filtreleri — hangi randevuların gösterileceğini belirler. */}
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

      {/* Görünüm anahtarları — filtre değil, haritanın üzerine ne çizileceğini
          açıp kapatır. Ayrı bir satırda: form-row'daki label { flex:1;
          min-width:200px } kuralı bunlara uygulanırsa (kısa metinli toggle'lar
          200px'e zorla gerilince) aralarında anlamsız boşluklar oluşuyordu. */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1.5rem",
          alignItems: "center",
          marginBottom: "0.9rem",
        }}
      >
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", margin: 0 }}>
          <ToggleSwitch checked={showServiceAreas} onChange={(e) => setShowServiceAreas(e.target.checked)} />
          Yetki alanlarını göster
        </label>
        <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", margin: 0 }}>
          <ToggleSwitch checked={showTraffic} onChange={(e) => setShowTraffic(e.target.checked)} />
          Trafiği göster
        </label>
        <button type="button" className="secondary" onClick={() => setShowAreaList(true)}>
          Mahalle Listesi
        </button>
      </div>

      {showAreaList && (
        <Modal onClose={() => setShowAreaList(false)}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Yetki Alanındaki Mahalleler</h3>
            <p style={{ opacity: 0.7, marginTop: "-0.5rem" }}>
              {AREAS_BY_ILCE.length} ilçe, {serviceAreas.features.length} mahalle
            </p>
            {/* 87 mahalle sığmayınca popup'ın kendisi (ve onunla birlikte tüm
                sayfa) uzayıp gidiyordu — liste artık kendi içinde kayıyor,
                popup'ın boyu sabit kalıyor. */}
            <div style={{ maxHeight: "55vh", overflowY: "auto", paddingRight: "0.5rem" }}>
              {AREAS_BY_ILCE.map(([ilce, mahalleler]) => (
                <div key={ilce} style={{ marginBottom: "1rem" }}>
                  <strong style={{ color: DISTRICT_COLORS[ilce] || DEFAULT_DISTRICT_COLOR }}>{ilce}</strong>
                  <span style={{ opacity: 0.6, fontSize: "0.8rem" }}> ({mahalleler.length})</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem 1rem", marginTop: "0.4rem" }}>
                    {mahalleler.map((m) => (
                      <span key={m} style={{ fontSize: "0.85rem" }}>
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "0.75rem" }}>
              <button type="button" className="secondary" onClick={() => setShowAreaList(false)}>
                Kapat
              </button>
            </div>
          </div>
        </Modal>
      )}

      {(showServiceAreas || technicianId === "all") && (
        <div style={{ marginBottom: "0.9rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
          {showServiceAreas && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem", marginBottom: technicianId === "all" ? "0.4rem" : 0 }}>
              {Object.entries(DISTRICT_COLORS).map(([ilce, color]) => (
                <span key={ilce} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span
                    style={{
                      width: 14,
                      height: 10,
                      borderRadius: 2,
                      border: `2px solid ${color}`,
                      display: "inline-block",
                    }}
                  />
                  {ilce}
                </span>
              ))}
            </div>
          )}
          {technicianId === "all" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.8rem" }}>
              {technicians.map((t, idx) => (
                <span key={t.id} style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: TECH_COLORS[idx % TECH_COLORS.length],
                      display: "inline-block",
                    }}
                  />
                  {t.name}
                </span>
              ))}
              <span style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                <span
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: UNASSIGNED_COLOR,
                    display: "inline-block",
                  }}
                />
                Atanmamış
              </span>
            </div>
          )}
        </div>
      )}

      {/* İki durak arası süre — bir filtre değil, ara sıra kullanılan ayrı bir
          araç olduğu için kendi kutusunda, diğer kontrollerden görsel olarak
          ayrılmış (bkz. IncomingOrderForm.jsx'teki aynı desen). */}
      <div
        style={{
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: "0.85rem",
          marginBottom: "0.9rem",
        }}
      >
        <strong style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.6rem" }}>
          İki durak arası canlı trafik süresi
        </strong>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", alignItems: "flex-end" }}>
          <label style={{ minWidth: 180, margin: 0 }}>
            Başlangıç
            <select value={routeFromId} onChange={(e) => setRouteFromId(e.target.value)}>
              <option value="">Seçin</option>
              {visibleAppointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.stopOrder != null ? `${a.stopOrder + 1}. ` : ""}
                  {a.customerName}
                </option>
              ))}
            </select>
          </label>
          <label style={{ minWidth: 180, margin: 0 }}>
            Bitiş
            <select value={routeToId} onChange={(e) => setRouteToId(e.target.value)}>
              <option value="">Seçin</option>
              {visibleAppointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.stopOrder != null ? `${a.stopOrder + 1}. ` : ""}
                  {a.customerName}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            onClick={handleCalculateRoute}
            disabled={!routeFromId || !routeToId || routeFromId === routeToId || routeLoading}
          >
            {routeLoading ? "Hesaplanıyor…" : "Süreyi Hesapla"}
          </button>
        </div>
        {routeResult && (
          <p style={{ margin: "0.6rem 0 0" }}>
            {routeResult.distanceText} —{" "}
            <strong>{routeResult.durationInTrafficText || routeResult.durationText} (canlı trafik)</strong>
            {routeResult.durationInTrafficText &&
            routeResult.durationInTrafficText !== routeResult.durationText
              ? ` — normal koşulda ${routeResult.durationText}`
              : ""}
          </p>
        )}
        {routeError && <p className="error" style={{ margin: "0.6rem 0 0" }}>{routeError}</p>}
      </div>

      <small style={{ display: "block", opacity: 0.7, marginBottom: "0.75rem" }}>
        Her nokta kendi teknisyeninin rengindedir; kırmızı kenarlık acil işi gösterir, dairenin
        içindeki sayı rota sırasıdır.
      </small>

      {loadError ? (
        <div className="error">{loadError}</div>
      ) : (
        <div ref={containerRef} style={{ height: "65vh", borderRadius: 8 }} />
      )}
    </div>
  );
}
