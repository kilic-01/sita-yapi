import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { todayISO } from "../lib/format.js";

// Eskiden Excel'de elle tutulan (Yedek Parça / İşçilik / Garanti Dahili
// sütunları + "Önceki Aylar" arşivi) Vitra ücret takibinin sistem içi
// karşılığı — bkz. electron/db.js addFeeEntry/listFeeEntries. Kullanıcı
// KDV HARİÇ tutarı girer, sistem seçilen orana göre KDV dahil toplamı
// hesaplayıp üstüne ekler.

// Birbirine yakın tonlar (ör. üç farklı teal/yeşil) dilimleri ayırt
// edilemez hale getiriyordu — renk çemberinde belirgin şekilde ayrışan
// (mavi/yeşil/turuncu/mor) dört renk seçildi.
const CATEGORIES = [
  { id: "yedekParca", label: "Yedek Parça", color: "#3b82f6" },
  { id: "iscilik", label: "İşçilik", color: "#22c55e" },
  { id: "garantiDahili", label: "Garanti Dahili", color: "#f59e0b" },
  { id: "urunler", label: "Ürünler", color: "#a855f7" },
];

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// Pasta dilimini (donut deliği ile) bir SVG path'ine çevirir — conic-gradient
// yerine gerçek <path> elemanları kullanılıyor ki her dilim ayrı ayrı
// hover edilip üzerine gelince ismi/tutarı gösterilebilsin.
function donutSlicePath(cx, cy, outerR, innerR, startAngle, endAngle) {
  const angle = Math.min(endAngle - startAngle, 359.99);
  const end = startAngle + angle;
  const largeArc = angle > 180 ? 1 : 0;
  const startOuter = polarToCartesian(cx, cy, outerR, startAngle);
  const endOuter = polarToCartesian(cx, cy, outerR, end);
  const endInner = polarToCartesian(cx, cy, innerR, end);
  const startInner = polarToCartesian(cx, cy, innerR, startAngle);
  return [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");
}

// Excel'deki pasta (doughnut) grafiğin — her kategori ayrı bir dilim,
// yüzdesiyle birlikte (chart1.xml'de showPercent=1) — sistem içi karşılığı.
// Dilimin üzerine gelince o kategorinin adı/tutarı merkezde (TOPLAM'ın
// yerine) gösterilir, diğer dilimler soluklaşır.
function DonutChart({ byCategory, total }) {
  const [hovered, setHovered] = useState(null);
  let cumulative = 0;
  const slices = CATEGORIES.map((c) => {
    const value = byCategory[c.id] || 0;
    const pct = total > 0 ? (value / total) * 100 : 0;
    const startAngle = (cumulative / 100) * 360;
    cumulative += pct;
    const endAngle = (cumulative / 100) * 360;
    return { ...c, value, pct, startAngle, endAngle };
  });
  const hoveredSlice = slices.find((s) => s.id === hovered);

  return (
    <div data-testid="fee-donut-chart" style={{ position: "relative", width: 170, height: 170, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" style={{ width: "100%", height: "100%" }}>
        {total > 0 ? (
          slices
            .filter((s) => s.pct > 0)
            .map((s) => (
              <path
                key={s.id}
                d={donutSlicePath(50, 50, 48, 29, s.startAngle, s.endAngle)}
                fill={s.color}
                stroke="var(--card-bg)"
                strokeWidth="1"
                style={{
                  cursor: "pointer",
                  opacity: hovered && hovered !== s.id ? 0.35 : 1,
                  transition: "opacity 0.12s ease",
                }}
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
              />
            ))
        ) : (
          <circle cx="50" cy="50" r="48" fill="var(--border)" />
        )}
        {total > 0 && <circle cx="50" cy="50" r="29" fill="var(--card-bg)" />}
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          margin: "auto",
          width: "58%",
          height: "58%",
          borderRadius: "50%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          pointerEvents: "none",
          padding: "0 0.25rem",
        }}
      >
        {hoveredSlice ? (
          <>
            <span style={{ fontSize: "0.68rem", opacity: 0.8 }}>{hoveredSlice.label}</span>
            <strong style={{ fontSize: "0.85rem" }}>{formatMoney(hoveredSlice.value)}</strong>
            <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>
              %{hoveredSlice.pct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: "0.68rem", opacity: 0.7 }}>TOPLAM</span>
            <strong style={{ fontSize: "0.92rem" }}>{formatMoney(total)}</strong>
          </>
        )}
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

function monthKey(dateStr) {
  return (dateStr || "").slice(0, 7);
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function formatMoney(n) {
  return `₺${(Number(n) || 0).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function categoryLabel(id) {
  return CATEGORIES.find((c) => c.id === id)?.label || id;
}

function emptyForm() {
  return { category: "yedekParca", amount: "", vatRate: "20", description: "", date: todayISO() };
}

export default function FeeTrackingPage({ feeEntries = [], currentUser, onChanged }) {
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const currentMonthKey = todayISO().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonthKey);

  // Her ay için kategori bazlı + genel toplam (KDV dahil) — Excel'deki üst
  // bloğun (bu ay) ve "Önceki Aylar" listesinin (diğer aylar) karşılığı.
  const monthSummaries = useMemo(() => {
    const byMonth = new Map();
    for (const entry of feeEntries) {
      const key = monthKey(entry.date);
      if (!key) continue;
      if (!byMonth.has(key)) {
        byMonth.set(key, { key, total: 0, byCategory: { yedekParca: 0, iscilik: 0, garantiDahili: 0, urunler: 0 } });
      }
      const summary = byMonth.get(key);
      const total = Number(entry.totalAmount) || 0;
      summary.total += total;
      if (summary.byCategory[entry.category] != null) summary.byCategory[entry.category] += total;
    }
    return byMonth;
  }, [feeEntries]);

  const sortedMonthKeys = useMemo(
    () => [...monthSummaries.keys()].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0)),
    [monthSummaries]
  );

  // Seçili ayda hiç kayıt olmasa bile (ör. yeni bir ay başladı) üst blok hâlâ
  // sıfırlarla görünsün diye monthSummaries'te yoksa boş bir özet üretiyoruz.
  const selectedSummary = monthSummaries.get(selectedMonth) || {
    key: selectedMonth,
    total: 0,
    byCategory: { yedekParca: 0, iscilik: 0, garantiDahili: 0, urunler: 0 },
  };

  const selectedMonthEntries = useMemo(
    () =>
      feeEntries
        .filter((e) => monthKey(e.date) === selectedMonth)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
    [feeEntries, selectedMonth]
  );

  const previousMonthKeys = sortedMonthKeys.filter((k) => k !== currentMonthKey);

  function startNew() {
    setEditingId(null);
    setForm({ ...emptyForm(), date: selectedMonth === currentMonthKey ? todayISO() : `${selectedMonth}-01` });
    setError("");
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      category: entry.category,
      amount: String(entry.amount),
      vatRate: String(entry.vatRate),
      description: entry.description || "",
      date: entry.date,
    });
    setError("");
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setError("");
  }

  const amountNum = Number(form?.amount) || 0;
  const vatRateNum = Number(form?.vatRate) || 0;
  const previewTotal = amountNum * (1 + vatRateNum / 100);

  async function handleSave(e) {
    e.preventDefault();
    if (!(amountNum > 0)) {
      setError("Tutar 0'dan büyük olmalı.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        category: form.category,
        amount: amountNum,
        vatRate: vatRateNum,
        description: form.description.trim(),
        date: form.date,
        actingUserId: currentUser?.id,
      };
      if (editingId) {
        await window.api.updateFeeEntry(editingId, payload);
      } else {
        await window.api.addFeeEntry(payload);
      }
      closeForm();
      onChanged?.();
    } catch (err) {
      setError(err.message || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry) {
    if (
      !window.confirm(
        `"${categoryLabel(entry.category)} — ${formatMoney(entry.totalAmount)}" kaydını kalıcı olarak silmek istediğinize emin misiniz?`
      )
    )
      return;
    try {
      await window.api.deleteFeeEntry(entry.id, currentUser?.id);
      onChanged?.();
    } catch (err) {
      window.alert(err.message || "Silinemedi.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Ücret Takip — {monthLabel(selectedMonth)}</h2>
        <div style={{ flex: 1 }} />
        {!form && (
          <button
            type="button"
            className="primary"
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
            onClick={startNew}
          >
            <Plus size={15} strokeWidth={1.75} />
            Ekle
          </button>
        )}
      </div>

      {form && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? "Kaydı Düzenle" : "Yeni Ücret Kaydı"}</h3>
            <button type="button" className="icon-btn" title="Kapat" aria-label="Kapat" onClick={closeForm}>
              <X size={15} strokeWidth={1.75} />
            </button>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <label>
                Kategori
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tarih
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </label>
            </div>
            <div className="form-row" style={{ marginTop: "0.5rem" }}>
              <label>
                Tutar (KDV hariç)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  autoFocus
                  placeholder="0,00"
                />
              </label>
              <label>
                KDV Oranı (%)
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.vatRate}
                  onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))}
                />
              </label>
            </div>
            <label style={{ display: "block", marginTop: "0.5rem" }}>
              Açıklama (opsiyonel)
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Örn. müşteri adı, fiş no vb."
              />
            </label>
            <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>
              KDV dahil toplam: {formatMoney(previewTotal)}
            </p>
            {error && <p style={{ color: "var(--danger, #e74c3c)" }}>{error}</p>}
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button type="button" className="secondary" onClick={closeForm}>
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}

      <div
        className="card"
        style={{ marginBottom: "1rem", display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}
      >
        <DonutChart byCategory={selectedSummary.byCategory} total={selectedSummary.total} />
        <div style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {CATEGORIES.map((c) => {
            const value = selectedSummary.byCategory[c.id] || 0;
            const pct = selectedSummary.total > 0 ? (value / selectedSummary.total) * 100 : 0;
            return (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: "0.85rem" }}>{c.label}</span>
                <span style={{ fontSize: "0.8rem", opacity: 0.7 }}>%{pct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}</span>
                <strong style={{ minWidth: 100, textAlign: "right" }}>{formatMoney(value)}</strong>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ marginBottom: "1rem" }}>
        {selectedMonthEntries.length === 0 ? (
          <p style={{ opacity: 0.7 }}>Bu ayda henüz kayıt yok.</p>
        ) : (
          selectedMonthEntries.map((entry) => (
            <div
              key={entry.id}
              style={{ borderBottom: "1px solid var(--border)", padding: "0.5rem 0", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
            >
              <strong style={{ minWidth: 120 }}>{categoryLabel(entry.category)}</strong>
              <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>{entry.date}</span>
              {entry.description && <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>{entry.description}</span>}
              <span style={{ flex: 1 }} />
              <span style={{ opacity: 0.75, fontSize: "0.8rem" }}>
                {formatMoney(entry.amount)} + %{entry.vatRate} KDV =
              </span>
              <strong>{formatMoney(entry.totalAmount)}</strong>
              <button type="button" className="icon-btn edit" title="Düzenle" aria-label="Düzenle" onClick={() => startEdit(entry)}>
                <Pencil size={14} strokeWidth={1.75} />
              </button>
              <button type="button" className="icon-btn delete" title="Sil" aria-label="Sil" onClick={() => handleDelete(entry)}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))
        )}
      </div>

      {previousMonthKeys.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Önceki Aylar</h3>
          {previousMonthKeys.map((key) => {
            const summary = monthSummaries.get(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedMonth(key)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  width: "100%",
                  padding: "0.5rem 0",
                  borderBottom: "1px solid var(--border)",
                  background: "none",
                  border: "none",
                  borderBottomWidth: 1,
                  borderBottomStyle: "solid",
                  borderBottomColor: "var(--border)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: "0.9rem",
                }}
              >
                <span>{monthLabel(key)}</span>
                <strong>{formatMoney(summary.total)}</strong>
              </button>
            );
          })}
          {selectedMonth !== currentMonthKey && (
            <button
              type="button"
              className="secondary"
              style={{ marginTop: "0.75rem" }}
              onClick={() => setSelectedMonth(currentMonthKey)}
            >
              Bu aya dön ({monthLabel(currentMonthKey)})
            </button>
          )}
        </div>
      )}
    </div>
  );
}
