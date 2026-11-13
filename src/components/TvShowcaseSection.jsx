import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ImagePlus, X } from "lucide-react";
import { FEATURED_STALE_DAYS, featuredAgeDays } from "../lib/featuredReminder.js";

// Ayarlar > TV Vitrin Sayfaları — bekleme ekranında fotoğrafların arasında
// dönen "Haftanın Ürünü", koleksiyon tanıtımları ve "Hizmetlerimiz" sayfaları.
// Kaydedince TV'ye gönderilir (bkz. electron/handlers.js saveTvShowcase); TV
// saklar, masaüstü kapalıyken de gösterir. Haftanın ürünü VitrA dışından da
// olabilir: bilgiler elle girilir, kod yazılınca eşleşen ürün varsa doldurulur.
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

const MAX_FEATURED_IMAGES = 8;
// Yüklenen görsel TV için küçültülür: 55" ekranda yeterli, Storage'da az yer.
const UPLOAD_MAX_SIDE = 1600;

// Bilgisayardan seçilen görseli küçültüp JPEG data URL'ine çevirir.
function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      // Saydam PNG'ler siyaha dönmesin: ürün sayfası beyaz zeminli.
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`${file.name} açılamadı.`));
    };
    img.src = url;
  });
}

function ProductCodeInput({ value, onChange, onChoose, onBlur, stockItems }) {
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
    onChoose?.(item.code);
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
        onBlur={() => onBlur?.(value)}
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
        placeholder="Kod ya da ürün adı yazın"
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
  const [lookup, setLookup] = useState({ status: "idle", code: "" }); // idle | loading | vitra | stock | none
  const [uploading, setUploading] = useState(0);
  const fileRef = useRef(null);

  useEffect(() => {
    window.api.getTvShowcase(currentUser?.id).then((cfg) => {
      const services = cfg.services || {};
      const items = [...(services.items || [])];
      while (items.length < 4) items.push({ ...EMPTY_SERVICE });
      setLookup({ status: "idle", code: cfg.featuredCode || "" });
      setConfig({
        featuredCode: cfg.featuredCode || "",
        featuredName: cfg.featuredName || "",
        featuredCategory: cfg.featuredCategory || "",
        featuredFeatures: (cfg.featuredFeatures || []).join("\n"),
        featuredImages: cfg.featuredImages || [],
        featuredSince: cfg.featuredSince || null,
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

  // Kod seçilince / alandan çıkınca: VitrA'da ya da stokta eşleşen ürün varsa
  // ad, kategori, özellikler ve görseller doldurulur (sonra elle düzenlenebilir).
  async function fillFromCode(code) {
    const term = String(code || "").trim();
    if (!term || term === lookup.code) return;
    setLookup({ status: "loading", code: term });
    try {
      const found = await window.api.lookupTvFeatured(term, currentUser?.id);
      if (!found) {
        setLookup({ status: "none", code: term });
        return;
      }
      setConfig((c) => ({
        ...c,
        featuredCode: found.code || c.featuredCode,
        featuredName: found.name || c.featuredName,
        featuredCategory: found.category || "",
        featuredFeatures: found.features.length ? found.features.join("\n") : "",
        featuredImages: found.images.slice(0, MAX_FEATURED_IMAGES),
      }));
      setLookup({ status: found.source, code: found.code || term });
    } catch {
      setLookup({ status: "none", code: term });
    }
  }

  async function addImages(files) {
    const room = MAX_FEATURED_IMAGES - config.featuredImages.length;
    const list = [...files].slice(0, Math.max(0, room));
    for (const file of list) {
      setUploading((n) => n + 1);
      try {
        const url = await window.api.uploadTvImage(await resizeImage(file), currentUser?.id);
        setConfig((c) =>
          c.featuredImages.includes(url) ? c : { ...c, featuredImages: [...c.featuredImages, url].slice(0, MAX_FEATURED_IMAGES) }
        );
      } catch (err) {
        onNotify?.("error", (err.message || "Görsel yüklenemedi.").replace(/^.*Error: /, ""));
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const setImages = (featuredImages) => setConfig((c) => ({ ...c, featuredImages }));

  async function save() {
    setSaving(true);
    try {
      const { config: saved, summary } = await window.api.saveTvShowcase(
        { ...config, featuredFeatures: config.featuredFeatures.split("\n") },
        currentUser?.id
      );
      // Ürün adı boşsa sunucu haftanın ürününün tüm bilgilerini siler; form da
      // kaydedilen hâle döner.
      setConfig((c) => ({
        ...c,
        featuredCode: saved.featuredCode,
        featuredName: saved.featuredName,
        featuredCategory: saved.featuredCategory,
        featuredFeatures: saved.featuredFeatures.join("\n"),
        featuredImages: saved.featuredImages,
        featuredNote: saved.featuredNote,
        featuredPrice: saved.featuredPrice ?? "",
        featuredDiscount: saved.featuredDiscount || "",
        featuredSince: saved.featuredSince || null,
      }));
      if (!saved.featuredName) setLookup({ status: "idle", code: "" });
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
        Bu sayfalar bekleme ekranında fotoğrafların arasında sırayla döner. Koleksiyon bilgileri
        vitra.com.tr'den alınır; fiyat yalnız haftanın ürününde gösterilir.
      </p>

      <section>
        <h4 style={{ margin: "0 0 0.5rem" }}>Haftanın Ürünü</h4>
        {featuredAgeDays(config) >= FEATURED_STALE_DAYS && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              margin: "0 0 0.75rem",
              padding: "0.55rem 0.8rem",
              borderRadius: 10,
              border: "1px solid #d97706",
              background: "color-mix(in srgb, #d97706 12%, var(--card-bg))",
              color: "#d97706",
              fontWeight: 600,
              fontSize: "0.85rem",
            }}
          >
            <AlertTriangle size={16} strokeWidth={1.75} />
            Bu ürün {featuredAgeDays(config)} gündür TV'de — yeni bir haftanın ürünü seçmek isteyebilirsiniz.
          </div>
        )}
        <p style={{ margin: "0 0 0.5rem", opacity: 0.75 }}>
          VitrA dışı bir ürün de olabilir. Kod yazıp seçince VitrA'da ya da stokta eşleşen ürün varsa bilgiler
          doldurulur; hepsini değiştirebilirsiniz. Ürün adı boşsa sayfa TV'de gösterilmez.
        </p>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label style={{ maxWidth: 260 }}>
            Ürün kodu
            <ProductCodeInput
              value={config.featuredCode}
              onChange={(featuredCode) => setConfig((c) => ({ ...c, featuredCode }))}
              onChoose={fillFromCode}
              onBlur={fillFromCode}
              stockItems={stockItems}
            />
          </label>
          <label>
            Ürün adı
            <input
              value={config.featuredName}
              onChange={(e) => setConfig({ ...config, featuredName: e.target.value })}
              maxLength={120}
              placeholder="Örn. Origin lavabo bataryası"
            />
          </label>
          <label style={{ maxWidth: 220 }}>
            Kategori (isteğe bağlı)
            <input
              value={config.featuredCategory}
              onChange={(e) => setConfig({ ...config, featuredCategory: e.target.value })}
              maxLength={60}
              placeholder="Örn. Armatür"
            />
          </label>
        </div>
        {lookup.status !== "idle" && (
          <small style={{ display: "block", margin: "-0.25rem 0 0.6rem", opacity: 0.75 }}>
            {
              {
                loading: "Ürün aranıyor…",
                vitra: "Bilgiler vitra.com.tr'den dolduruldu.",
                stock: "Bilgiler stoktaki üründen dolduruldu.",
                none: "Eşleşen ürün bulunamadı — bilgileri elle girin.",
              }[lookup.status]
            }
          </small>
        )}
        <label>
          Özellikler (her satır bir madde, isteğe bağlı)
          <textarea
            rows={5}
            value={config.featuredFeatures}
            onChange={(e) => setConfig({ ...config, featuredFeatures: e.target.value })}
            placeholder={"Örn. Kolay temizlenen yüzey\nSessiz kapanan kapak"}
          />
        </label>
        <div style={{ margin: "0.75rem 0" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>
            Görseller{" "}
            <span style={{ fontWeight: 400, opacity: 0.7 }}>
              (ilki kapak; en fazla {MAX_FEATURED_IMAGES})
            </span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
            {config.featuredImages.map((url, i) => (
              <div
                key={url}
                style={{
                  position: "relative",
                  width: 92,
                  height: 92,
                  borderRadius: 10,
                  border: `1px solid ${i === 0 ? "var(--accent)" : "var(--border)"}`,
                  background: "#fff",
                  overflow: "hidden",
                }}
              >
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                <button
                  type="button"
                  title="Kaldır"
                  aria-label="Görseli kaldır"
                  onClick={() => setImages(config.featuredImages.filter((u) => u !== url))}
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    padding: 0,
                    borderRadius: "50%",
                    display: "grid",
                    placeItems: "center",
                    background: "rgba(0,0,0,0.55)",
                    color: "#fff",
                    border: "none",
                  }}
                >
                  <X size={13} strokeWidth={2} />
                </button>
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => setImages([url, ...config.featuredImages.filter((u) => u !== url)])}
                    style={{
                      position: "absolute",
                      left: 4,
                      bottom: 4,
                      padding: "1px 6px",
                      fontSize: "0.7rem",
                      borderRadius: 6,
                      background: "rgba(0,0,0,0.55)",
                      color: "#fff",
                      border: "none",
                    }}
                  >
                    Kapak yap
                  </button>
                )}
              </div>
            ))}
            {config.featuredImages.length < MAX_FEATURED_IMAGES && (
              <button
                type="button"
                className="secondary"
                onClick={() => fileRef.current?.click()}
                disabled={uploading > 0}
                style={{
                  width: 92,
                  height: 92,
                  borderRadius: 10,
                  borderStyle: "dashed",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.3rem",
                  fontSize: "0.75rem",
                }}
              >
                <ImagePlus size={20} strokeWidth={1.75} />
                {uploading > 0 ? "Yükleniyor…" : "Görsel ekle"}
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              hidden
              onChange={(e) => {
                addImages(e.target.files);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
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
