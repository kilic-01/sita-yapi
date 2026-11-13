import { useEffect, useMemo, useRef, useState } from "react";

// Ayarlar > TV Vitrin Sayfaları — bekleme ekranında fotoğrafların arasında
// dönen "Haftanın Ürünü", koleksiyon tanıtımları ve "Hizmetlerimiz" sayfaları.
// Kaydedince içerik vitra.com.tr'den derlenip TV'ye gönderilir (bkz.
// electron/handlers.js saveTvShowcase); TV saklar, masaüstü kapalıyken de gösterir.
const DEFAULT_COLLECTIONS = ["metropole-k", "origin-k", "sento-k", "v-care-k", "root-k", "plural-k"];
const EMPTY_SERVICE = { title: "", text: "", icon: "auto" };
// TV'deki ServiceIcons ile aynı adlar; "Otomatik" başlıktan seçer.
const ICON_OPTIONS = [
  ["auto", "Otomatik"],
  ["bath", "Banyo / montaj"],
  ["wrench", "Anahtar / servis"],
  ["package", "Paket / parça"],
  ["shield", "Kalkan / garanti"],
  ["truck", "Kamyon / teslimat"],
  ["ruler", "Cetvel / keşif"],
  ["house", "Ev / tadilat"],
  ["message", "Balon / danışmanlık"],
  ["droplet", "Damla / tesisat"],
  ["check", "Onay işareti"],
];
const SERVICE_EXAMPLES = [
  { title: "Montaj", text: "Örn. VitrA ürünlerinin uzman ekiplerce montajı" },
  { title: "Teknik Servis", text: "Örn. Arıza ve bakım için yerinde servis" },
  { title: "Yedek Parça", text: "Örn. Orijinal VitrA yedek parçaları" },
  { title: "Garanti", text: "Örn. Garanti kapsamındaki işlemleriniz" },
];

// Haftanın ürünü kodu: yazarken stoktaki ürünlerde (kod ya da ad) arayıp
// altında listeler; tıklayarak ya da ↑/↓ + Enter ile seçilir.
const SUGGESTION_LIMIT = 8;

function ProductCodeInput({ value, onChange, stockItems }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  const matches = useMemo(() => {
    const term = value.trim().toLocaleLowerCase("tr");
    if (!term) return [];
    return stockItems
      .filter(
        (s) =>
          (s.code || "").toLocaleLowerCase("tr").includes(term) || (s.name || "").toLocaleLowerCase("tr").includes(term)
      )
      .slice(0, SUGGESTION_LIMIT);
  }, [value, stockItems]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function choose(item) {
    onChange(item.code);
    setOpen(false);
  }

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (!open || matches.length === 0) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % matches.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a - 1 + matches.length) % matches.length);
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(matches[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Kod ya da ürün adı yazın (boş bırakılırsa gösterilmez)"
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "var(--shadow)",
            zIndex: 20,
            overflow: "hidden",
          }}
        >
          {matches.map((s, i) => (
            <button
              key={s.id || s.code}
              type="button"
              role="option"
              aria-selected={i === active}
              className="dropdown-item"
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              style={{
                display: "flex",
                gap: "0.6rem",
                alignItems: "baseline",
                background: i === active ? "color-mix(in srgb, var(--accent) 10%, transparent)" : undefined,
              }}
            >
              <strong style={{ flexShrink: 0 }}>{s.code}</strong>
              <span style={{ opacity: 0.75, overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TvShowcaseSection({ currentUser, stockItems = [], onNotify }) {
  const [collections, setCollections] = useState([]);
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.api.getTvShowcase(currentUser?.id).then((cfg) => {
      const services = cfg.services || {};
      const items = [...(services.items || [])];
      while (items.length < 4) items.push({ ...EMPTY_SERVICE });
      setConfig({
        featuredCode: cfg.featuredCode || "",
        featuredNote: cfg.featuredNote || "",
        featuredPrice: cfg.featuredPrice ?? "",
        featuredDiscount: cfg.featuredDiscount || "",
        collections: cfg.collections || DEFAULT_COLLECTIONS,
        services: { items },
      });
    });
    window.api.listTvCollections().then(setCollections).catch(() => setCollections([]));
  }, [currentUser?.id]);

  if (!config) return <p style={{ marginTop: 0 }}>Yükleniyor…</p>;

  const setService = (patch) => setConfig((c) => ({ ...c, services: { ...c.services, ...patch } }));
  const setItem = (i, patch) =>
    setService({ items: config.services.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) });
  const toggleCollection = (slug) =>
    setConfig((c) => ({
      ...c,
      collections: c.collections.includes(slug) ? c.collections.filter((s) => s !== slug) : [...c.collections, slug],
    }));

  async function save() {
    setSaving(true);
    try {
      const { summary } = await window.api.saveTvShowcase(config, currentUser?.id);
      const parts = [
        summary.featured && `haftanın ürünü: ${summary.featured}`,
        summary.collections.length > 0 && `${summary.collections.length} koleksiyon`,
        summary.services > 0 && `${summary.services} hizmet`,
      ].filter(Boolean);
      onNotify?.("success", parts.length ? `TV'ye gönderildi — ${parts.join(", ")}.` : "Kaydedildi (gösterilecek vitrin sayfası yok).");
    } catch (err) {
      onNotify?.("error", (err.message || "Kaydedilemedi.").replace(/^.*Error: /, ""));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <p style={{ margin: 0 }}>
        Bu sayfalar bekleme ekranında fotoğrafların arasında sırayla döner. Ürün ve koleksiyon bilgileri
        vitra.com.tr'den alınır; TV'de fiyat gösterilmez.
      </p>

      <section>
        <h4 style={{ margin: "0 0 0.5rem" }}>Haftanın Ürünü</h4>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label>
            Ürün kodu
            <ProductCodeInput
              value={config.featuredCode}
              onChange={(featuredCode) => setConfig((c) => ({ ...c, featuredCode }))}
              stockItems={stockItems}
            />
          </label>
          <label>
            Kampanya yazısı (isteğe bağlı)
            <input
              value={config.featuredNote}
              onChange={(e) => setConfig({ ...config, featuredNote: e.target.value })}
              maxLength={80}
              placeholder="Örn. Bu hafta montaj ücretsiz"
            />
          </label>
        </div>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label style={{ maxWidth: 220 }}>
            Fiyat (KDV dahil, ₺)
            <input
              inputMode="decimal"
              value={config.featuredPrice}
              onChange={(e) => setConfig({ ...config, featuredPrice: e.target.value })}
              placeholder="Boşsa fiyat gösterilmez"
            />
          </label>
          <label style={{ maxWidth: 160 }}>
            İndirim (%)
            <input
              type="number"
              min="0"
              max="90"
              value={config.featuredDiscount}
              onChange={(e) => setConfig({ ...config, featuredDiscount: e.target.value })}
              placeholder="0"
            />
          </label>
          <small style={{ opacity: 0.7, alignSelf: "center" }}>
            TV'de fiyatın gösterildiği tek sayfa budur. İndirim varsa eski fiyat üstü çizili, indirimli fiyat büyük gösterilir.
          </small>
        </div>
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem" }}>Koleksiyon Tanıtımı</h4>
        {collections.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.7 }}>Koleksiyon listesi vitra.com.tr'den yükleniyor…</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: "0.35rem 1rem" }}>
            {collections.map((c) => (
              <label key={c.slug} style={{ flexDirection: "row", alignItems: "center", gap: "0.45rem", margin: 0 }}>
                <input
                  type="checkbox"
                  checked={config.collections.includes(c.slug)}
                  onChange={() => toggleCollection(c.slug)}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </section>

      <section>
        <h4 style={{ margin: "0 0 0.5rem" }}>Hizmetlerimiz</h4>
        <p style={{ margin: "0 0 0.5rem", opacity: 0.75 }}>
          Başlığı boş bırakılan satır gösterilmez; hiç hizmet girilmezse sayfa TV'de çıkmaz.
        </p>
        {config.services.items.map((it, i) => (
          <div key={i} className="form-row" style={{ alignItems: "flex-end" }}>
            <label style={{ maxWidth: 190 }}>
              İkon
              <select value={it.icon || "auto"} onChange={(e) => setItem(i, { icon: e.target.value })}>
                {ICON_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ maxWidth: 220 }}>
              Hizmet {i + 1}
              <input
                value={it.title}
                onChange={(e) => setItem(i, { title: e.target.value })}
                maxLength={40}
                placeholder={SERVICE_EXAMPLES[i]?.title || "Başlık"}
              />
            </label>
            <label>
              Kısa açıklama
              <input
                value={it.text}
                onChange={(e) => setItem(i, { text: e.target.value })}
                maxLength={140}
                placeholder={SERVICE_EXAMPLES[i]?.text || ""}
              />
            </label>
          </div>
        ))}
        {config.services.items.length < 6 && (
          <button type="button" className="secondary" onClick={() => setService({ items: [...config.services.items, { ...EMPTY_SERVICE }] })}>
            + Hizmet ekle
          </button>
        )}
      </section>

      <div>
        <button type="button" className="primary" onClick={save} disabled={saving}>
          {saving ? "Kaydediliyor…" : "Kaydet ve TV'ye gönder"}
        </button>
      </div>
    </div>
  );
}
