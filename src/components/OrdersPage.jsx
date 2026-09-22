import { useEffect, useRef, useState } from "react";
import { Search, ArrowLeft, Package, QrCode } from "lucide-react";
import { EmptyStateIllustration } from "./illustrations.jsx";

// Koyu modda SVG logolar CSS ile tamamen ters çevriliyor (bkz. .supplier-logo-svg).
// Bazı logolarda (örn. Evdema) bu, turuncu bir rengi maviye dönüştürüyor —
// istenmeyen bir yan etki. Burada SADECE o turuncuyu, ters çevirmeden önce
// kendi tersine (mavi) çeviriyoruz; böylece CSS tersleyince tekrar orijinal
// turuncuya döner. Logodaki diğer renkler (örn. koyu gri) bundan etkilenmez,
// normal şekilde ters çevrilmeye devam eder.
const PRESERVE_ORIGINAL_COLOR = { original: "#F4822E", preInverted: "#0B7DD1" };

function recolorSvgForDark(dataUrl) {
  try {
    const commaIdx = dataUrl.indexOf(",");
    const meta = dataUrl.slice(0, commaIdx);
    const svgText = atob(dataUrl.slice(commaIdx + 1)).replace(
      new RegExp(PRESERVE_ORIGINAL_COLOR.original, "gi"),
      PRESERVE_ORIGINAL_COLOR.preInverted
    );
    return `${meta},${btoa(svgText)}`;
  } catch {
    return dataUrl;
  }
}

function SupplierLabel({ supplier, isDark }) {
  if (supplier.logo) {
    const isSvg = supplier.logo.startsWith("data:image/svg");
    const src = isSvg && isDark ? recolorSvgForDark(supplier.logo) : supplier.logo;
    return (
      <img
        src={src}
        alt={supplier.name}
        className={isSvg ? "supplier-logo-svg" : undefined}
        style={{ height: 22, maxWidth: 100, objectFit: "contain" }}
      />
    );
  }
  return <span>{supplier.name}</span>;
}

export default function OrdersPage({
  suppliers,
  isDark,
  stockItems = [],
  depots = [],
  navStyle = "top",
  sidebarCollapsed = false,
}) {
  const [query, setQuery] = useState("");
  const [activeOffer, setActiveOffer] = useState(null); // { label, url, supplierId }
  const [autoResults, setAutoResults] = useState(null); // [{ supplierId, supplierName, url, found, title, price }]
  const [autoSearching, setAutoSearching] = useState(false);
  const [autoSearchedCode, setAutoSearchedCode] = useState(null);
  const [autofillFailed, setAutofillFailed] = useState(null); // null | "nofield" | "undecryptable"
  const containerRef = useRef(null);

  const validSuppliers = suppliers.filter((s) => s.name && s.url);
  const searchableSuppliers = validSuppliers.filter((s) => s.searchUrlTemplate);
  const code = query.trim();
  // Görüntüleyici açıkken üstte sekme olarak gösterilecek tedarikçiler —
  // kod varsa arama yapılabilenler, yoksa tüm tedarikçilerin ana sayfası.
  const tabTargets = code ? searchableSuppliers : validSuppliers;
  const matchingStock = code
    ? stockItems.filter((item) => {
        const q = code.toLowerCase();
        return (item.code || "").toLowerCase().includes(q) || (item.barcode || "").toLowerCase().includes(q);
      })
    : [];

  function buildUrl(rawUrl, forCode) {
    let url = rawUrl.trim().replace("{kod}", encodeURIComponent(forCode));
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    return url;
  }

  function searchOnSupplier(supplier) {
    const c = query.trim();
    if (supplier.searchUrlTemplate) {
      setActiveOffer({
        label: `${supplier.name} — "${c}" araması`,
        url: buildUrl(supplier.searchUrlTemplate, c),
        supplierId: supplier.id,
      });
    } else {
      setActiveOffer({ label: supplier.name, url: buildUrl(supplier.url, c), supplierId: supplier.id });
    }
  }

  function openSupplierHome(supplier) {
    setActiveOffer({ label: supplier.name, url: buildUrl(supplier.url, ""), supplierId: supplier.id });
  }

  function switchTab(supplier) {
    if (code) searchOnSupplier(supplier);
    else openSupplierHome(supplier);
  }

  async function runAutoSearch(e) {
    e?.preventDefault();
    const c = query.trim();
    if (!c) return;
    setAutoSearching(true);
    setAutoResults(null);
    try {
      const results = await window.api.searchAllSuppliers(c);
      setAutoResults(results);
      setAutoSearchedCode(c);
    } finally {
      setAutoSearching(false);
    }
  }

  function closeViewer() {
    setActiveOffer(null);
    window.api.hideSupplier();
  }

  function getBounds() {
    const el = containerRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    };
  }

  useEffect(() => {
    if (!activeOffer) return;
    setAutofillFailed(null);
    const bounds = getBounds();
    if (bounds) window.api.showSupplier(activeOffer.url, bounds, activeOffer.supplierId);
  }, [activeOffer]);

  // Otomatik giriş, sitede kullanıcı adı/şifre alanı bulamazsa (site
  // değişmiş, form JS ile geç render ediliyor, 2FA/CAPTCHA vb.) ana
  // süreçten bu olay gelir — kullanıcıya sessizce hiçbir şey olmamış gibi
  // görünmesin diye küçük bir uyarı gösteriyoruz.
  useEffect(() => {
    return window.api.onSupplierAutofillFailed(({ supplierId, reason }) => {
      if (supplierId === activeOffer?.supplierId) setAutofillFailed(reason === "undecryptable" ? "undecryptable" : "nofield");
    });
  }, [activeOffer]);

  // Görüntüleyici tam ekran sabit (position: fixed) olduğu için sayfa
  // kaydırmasından etkilenmez — sadece pencere yeniden boyutlandığında
  // sınırları güncellememiz yeterli. Sabit konumlu panel, sayfa kaydırılınca
  // gömülü tarayıcının ekranda kayması sorununu kökten çözer.
  useEffect(() => {
    if (!activeOffer) return;
    function handleResize() {
      const bounds = getBounds();
      if (bounds) window.api.setSupplierBounds(bounds);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [activeOffer]);

  // Görüntüleyici açıkken kullanıcı görünümü (üst menü/kenar çubuğu) ya da
  // kenar çubuğunu daraltma/genişletmeyi değiştirirse, konum hemen yeniden
  // hesaplanır — yoksa eski (yanlış) sınırlarda kalıp kenar çubuğunun üstüne
  // binmeye devam ederdi.
  useEffect(() => {
    if (!activeOffer) return;
    const bounds = getBounds();
    if (bounds) window.api.setSupplierBounds(bounds);
  }, [navStyle, sidebarCollapsed, activeOffer]);

  useEffect(() => {
    return () => {
      window.api.hideSupplier();
    };
  }, []);

  if (activeOffer) {
    return (
      <>
        <div
          style={{
            position: "fixed",
            top: navStyle === "side" ? 0 : 96,
            left: navStyle === "side" ? (sidebarCollapsed ? 64 : 220) : 0,
            right: 0,
            height: 44,
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            padding: "0 1.25rem",
            background: "var(--card-bg)",
            borderBottom: "1px solid var(--border)",
            zIndex: 90,
          }}
        >
          <button
            className="secondary"
            onClick={closeViewer}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
          >
            <ArrowLeft size={16} strokeWidth={1.75} />
            Listeye Dön
          </button>
          <strong>{activeOffer.label}</strong>
          {autofillFailed === "undecryptable" && (
            <small style={{ color: "var(--danger)", marginLeft: "auto" }}>
              Kayıtlı şifre çözülemiyor (bilgisayar güncellemesi sonrası olabilir) — Ayarlar &gt;
              Tedarikçiler'den bu tedarikçinin şifresini yeniden girin.
            </small>
          )}
          {autofillFailed === "nofield" && (
            <small style={{ color: "var(--danger)", marginLeft: "auto" }}>
              Otomatik giriş alanı bulunamadı (zaten giriş yapılmış olabilir) — sonucu kontrol edin.
            </small>
          )}
        </div>

        {tabTargets.length > 1 && (
          <div
            style={{
              position: "fixed",
              top: navStyle === "side" ? 44 : 140,
              left: navStyle === "side" ? (sidebarCollapsed ? 64 : 220) : 0,
              right: 0,
              height: 44,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              padding: "0 1.25rem",
              background: "var(--card-bg)",
              borderBottom: "1px solid var(--border)",
              overflowX: "auto",
              zIndex: 90,
            }}
          >
            {tabTargets.map((s) => (
              <button
                key={s.id}
                className={s.id === activeOffer.supplierId ? "primary" : "secondary"}
                onClick={() => switchTab(s)}
                title={s.name}
                style={{ flexShrink: 0, padding: "0.3rem 0.7rem" }}
              >
                <SupplierLabel supplier={s} isDark={isDark} />
              </button>
            ))}
          </div>
        )}

        <div
          ref={containerRef}
          style={{
            position: "fixed",
            // Kenar çubuğu görünümünde üstte Header'ın 96px'lik bandı yok
            // (bkz. styles.css ".content" vs ".content.with-sidebar" üst
            // dolgusu farkı), o yüzden bu offset'ten düşülüyor — yoksa
            // görüntüleyici hem çok aşağıdan başlıyor hem de "left: 0" ile
            // kenar çubuğunun TAM ÜSTÜNE biniyordu.
            top: (tabTargets.length > 1 ? 184 : 140) - (navStyle === "side" ? 96 : 0),
            left: navStyle === "side" ? (sidebarCollapsed ? 64 : 220) : 0,
            right: 0,
            bottom: 0,
          }}
        />
      </>
    );
  }

  return (
    <div>
      <div className="card">
        <h3>Sipariş</h3>
        <p>
          Ürün kodunu yazın, arama adresi tanımlı olan tedarikçilerde bu kod otomatik aranır —
          her birine tıkladığınızda o tedarikçinin arama sonucu bu uygulama içinde açılır.
          Kaydedilmiş kullanıcı adı/şifresi olan tedarikçilerde otomatik giriş de denenir. Giriş
          bilgilerinizi biz görmeyiz, sadece o sitenin kendi oturumunda saklanır.
        </p>
        <form onSubmit={runAutoSearch} style={{ marginBottom: "1rem" }}>
          <label style={{ display: "block" }}>
            Ürün Kodu
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search
                  size={16}
                  strokeWidth={1.75}
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    opacity: 0.5,
                  }}
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Örn. 4453"
                  style={{ paddingLeft: "2rem", width: "100%" }}
                />
              </div>
              <button type="submit" className="primary" disabled={!code || searchableSuppliers.length === 0}>
                Ara
              </button>
            </div>
          </label>
        </form>

        {code && matchingStock.length > 0 && (
          <div style={{ marginBottom: "1rem" }}>
            <small style={{ opacity: 0.7, display: "block", marginBottom: "0.3rem" }}>
              Depodaki eşleşen ürünler — birine tıklarsanız arama kutusuna o ürünün tam kodu yazılır
              (tedarikçi sitelerinde tam kodla arama daha isabetli sonuç verir).
            </small>
            {matchingStock.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setQuery(item.code)}
                className="secondary"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  width: "100%",
                  textAlign: "left",
                  borderRadius: 10,
                  padding: "0.5rem 0.8rem",
                  marginBottom: "0.4rem",
                  cursor: "pointer",
                }}
              >
                <Package size={16} strokeWidth={1.75} style={{ opacity: 0.7, flexShrink: 0 }} />
                <span>
                  <strong>{item.code}</strong>
                  {item.name && <> — {item.name}</>}
                  {item.barcode && (
                    <QrCode
                      size={14}
                      strokeWidth={1.75}
                      title={`Barkod: ${item.barcode}`}
                      style={{ marginLeft: "0.3rem", verticalAlign: "middle", color: "var(--text)" }}
                    />
                  )}{" "}
                  —{" "}
                  <strong style={{ color: Number(item.quantity) <= 2 ? "var(--danger)" : undefined }}>
                    {item.quantity} {item.unit || "adet"}
                  </strong>{" "}
                  {item.depotId ? (
                    <>
                      (
                      <strong>{depots.find((d) => d.id === item.depotId)?.name || "bilinmeyen depo"}</strong>
                      )
                    </>
                  ) : (
                    "(depo belirtilmemiş)"
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {autoSearching && <p>Tedarikçiler kontrol ediliyor, birkaç saniye sürebilir…</p>}

        {!autoSearching && autoResults && autoSearchedCode === code && (
          <div style={{ marginBottom: "1rem" }}>
            {autoResults.map((r) => {
              const supplier = suppliers.find((s) => s.id === r.supplierId);
              const badge =
                r.found === true
                  ? { text: "Bulundu", color: "var(--accent)" }
                  : r.found === false
                    ? { text: "Bulunamadı", color: "var(--text-muted)" }
                    : { text: "Kontrol edilemedi", color: "var(--danger)" };
              return (
                <div
                  key={r.supplierId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    padding: "0.6rem 0.8rem",
                    marginBottom: "0.5rem",
                    opacity: r.found === false ? 0.6 : 1,
                  }}
                >
                  {supplier ? <SupplierLabel supplier={supplier} isDark={isDark} /> : <span>{r.supplierName}</span>}
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: badge.color,
                      border: `1px solid ${badge.color}`,
                      borderRadius: 999,
                      padding: "0.1rem 0.5rem",
                    }}
                  >
                    {badge.text}
                  </span>
                  {r.title && <small style={{ opacity: 0.85 }}>{r.title}</small>}
                  {r.price && <strong>{r.price}</strong>}
                  <button
                    type="button"
                    className="secondary"
                    style={{ marginLeft: "auto" }}
                    onClick={() => supplier && searchOnSupplier(supplier)}
                  >
                    Aç
                  </button>
                </div>
              );
            })}
            <small style={{ opacity: 0.7 }}>
              Bu liste otomatik ve sezgisel bir okumadır, siteye göre yanlış/eksik olabilir —
              sipariş vermeden önce "Aç" ile siteyi kendiniz de kontrol edin. Bir tedarikçiyi
              açtıktan sonra üstteki sekmelerden diğerlerine listeye dönmeden geçebilirsiniz.
            </small>
          </div>
        )}

        {validSuppliers.length === 0 && (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <EmptyStateIllustration />
            <p>
              <small>Henüz tedarikçi eklenmemiş — Ayarlar &gt; Tedarikçiler'den ekleyin.</small>
            </p>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem" }}>
          {validSuppliers
            .filter((s) => !code || !s.searchUrlTemplate)
            .map((s) =>
              code ? (
                <button
                  key={s.id}
                  className="secondary"
                  onClick={() => searchOnSupplier(s)}
                  title={`${s.name} — arama adresi tanımlı değil, sadece site açılır`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.25rem" }}
                >
                  <SupplierLabel supplier={s} isDark={isDark} />
                  <small style={{ opacity: 0.85 }}>siteyi aç</small>
                </button>
              ) : (
                <button
                  key={s.id}
                  className="secondary"
                  onClick={() => openSupplierHome(s)}
                  title={s.name}
                >
                  <SupplierLabel supplier={s} isDark={isDark} />
                </button>
              )
            )}
        </div>
      </div>
    </div>
  );
}
