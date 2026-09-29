import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, Pencil, PackageCheck, X } from "lucide-react";
import { todayISO, daysSince, daysBetween, formatDateTime, formatDateTR } from "../lib/format.js";
import PendingPartsPrintView from "./PendingPartsPrintView.jsx";
import SuggestionDropdown from "./SuggestionDropdown.jsx";

// Binlerce stok kaleminde her tuş vuruşunda tam liste taranıyorsa (kod/isim/
// barkod x ~10.400 ürün) arama kutusu kasıyor — StockPage.jsx/
// PartCheckoutsPage.jsx'te kullanılan aynı debounce deseni burada da
// uygulanıyor: kutu anında yazıyı gösterir, öneri listesi yazma bittikten
// kısa süre sonra hesaplanır.
const SEARCH_DEBOUNCE_MS = 200;

function emptyForm() {
  return {
    customerName: "",
    customerPhone: "",
    description: "",
    vitraReceiptNo: "",
    status: "bekleniyor",
    orderedAt: todayISO(),
  };
}

// "Bekleyen Parçalar" (pendingParts) tablosunun, randevu düzenleme
// ekranındaki popup'tan (AppointmentForm.jsx > PendingPartTab) bağımsız,
// TÜM müşterileri kapsayan bir görünümü — Vitra'nın fabrikadan müşteriye
// özel gönderdiği parçaları (fiş numarasıyla) takip etmek için. Aynı tabloyu
// paylaşıyorlar; burada eklenen/düzenlenen bir kayıt randevu popup'ında da,
// popup'ta eklenen bir kayıt burada da görünür.
export default function PendingPartsPage({ pendingParts = [], stockItems = [], currentUser, onChanged }) {
  const [view, setView] = useState("waiting"); // "waiting" | "history"
  const [form, setForm] = useState(null); // null = form kapalı
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [descDebouncedSearch, setDescDebouncedSearch] = useState("");
  const [descSuggestOpen, setDescSuggestOpen] = useState(false);
  const descSearchTimerRef = useRef(null);
  const descInputRef = useRef(null);

  const waiting = useMemo(
    () =>
      pendingParts
        .filter((p) => p.status !== "geldi")
        .sort((a, b) => {
          const da = a.orderedAt || a.createdAt || "";
          const db_ = b.orderedAt || b.createdAt || "";
          return da < db_ ? -1 : da > db_ ? 1 : 0;
        }),
    [pendingParts]
  );

  const history = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    return pendingParts
      .filter((p) => p.status === "geldi")
      .filter((p) => !q || p.customerName.toLowerCase().includes(q))
      .sort((a, b) => {
        const da = a.arrivedAt || a.updatedAt || a.createdAt || "";
        const db_ = b.arrivedAt || b.updatedAt || b.createdAt || "";
        return da < db_ ? 1 : da > db_ ? -1 : 0;
      });
  }, [pendingParts, historySearch]);

  function handlePrint() {
    // Liste birden fazla sayfaya taşabiliyor — alt ortada "X / Y" sayfa
    // numarası göstersin diye (bkz. electron/main.js'teki print:current).
    window.api.printCurrent({ showPageNumber: true });
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
  }

  function startEdit(p) {
    setEditingId(p.id);
    setForm({
      customerName: p.customerName,
      customerPhone: p.customerPhone || "",
      description: p.description,
      vitraReceiptNo: p.vitraReceiptNo || "",
      status: p.status,
      orderedAt: p.orderedAt || todayISO(),
    });
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
  }

  const descMatches = useMemo(() => {
    const q = descDebouncedSearch.trim().toLowerCase();
    if (!q || !descSuggestOpen) return [];
    return stockItems
      .filter(
        (s) =>
          (s.code || "").toLowerCase().includes(q) ||
          (s.name || "").toLowerCase().includes(q) ||
          (s.barcode || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [stockItems, descDebouncedSearch, descSuggestOpen]);

  function selectStockItem(s) {
    clearTimeout(descSearchTimerRef.current);
    setForm((f) => ({ ...f, description: s.code ? `${s.code} — ${s.name || ""}` : s.name || "" }));
    setDescSuggestOpen(false);
    setDescDebouncedSearch("");
  }

  function handleDescriptionChange(value) {
    setForm((f) => ({ ...f, description: value }));
    setDescSuggestOpen(true);
    clearTimeout(descSearchTimerRef.current);
    descSearchTimerRef.current = setTimeout(() => setDescDebouncedSearch(value), SEARCH_DEBOUNCE_MS);
    // Barkod okuyucu tam barkodu anında (tek bir tuş vuruşu gibi) yazdığı
    // için TAM eşleşme kontrolü debounce'a bağlı değil — bu ürünü hemen
    // seçer, öneri listesi hâlâ debounce'lu kalır (bkz. PartCheckoutsPage.jsx).
    const t = value.trim().toLowerCase();
    const barcodeMatch = t && stockItems.find((s) => s.barcode && s.barcode.toLowerCase() === t);
    if (barcodeMatch) selectStockItem(barcodeMatch);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.customerName.trim()) {
      window.alert("Müşteri adı zorunludur.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim(),
        description: form.description.trim(),
        vitraReceiptNo: form.vitraReceiptNo.trim() || null,
        status: form.status,
        orderedAt: form.orderedAt,
        actingUserId: currentUser?.id,
      };
      if (editingId) {
        await window.api.updatePendingPart(editingId, payload);
      } else {
        await window.api.addPendingPart(payload);
      }
      closeForm();
      onChanged?.();
    } catch (err) {
      window.alert(err.message || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function markArrived(p) {
    try {
      await window.api.updatePendingPart(p.id, { status: "geldi", actingUserId: currentUser?.id });
      onChanged?.();
    } catch (err) {
      window.alert(err.message || "İşlem başarısız.");
    }
  }

  async function handleDelete(p) {
    if (!window.confirm(`"${p.customerName}" — "${p.description}" kaydını kalıcı olarak silmek istediğinize emin misiniz?`))
      return;
    try {
      await window.api.deletePendingPart(p.id, currentUser?.id);
      onChanged?.();
    } catch (err) {
      window.alert(err.message || "Silinemedi.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: "0.4rem" }}>
          <button
            type="button"
            className={view === "waiting" ? "primary" : "secondary"}
            onClick={() => setView("waiting")}
          >
            Bekleyenler {waiting.length > 0 && `(${waiting.length})`}
          </button>
          <button
            type="button"
            className={view === "history" ? "primary" : "secondary"}
            onClick={() => setView("history")}
          >
            Geçmiş
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button type="button" className="secondary" onClick={handlePrint}>
          Yazdır
        </button>
        {!form && (
          <button
            type="button"
            className="primary"
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
            onClick={startNew}
          >
            <Plus size={15} strokeWidth={1.75} />
            Yeni Kayıt Ekle
          </button>
        )}
      </div>

      {form && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? "Kaydı Düzenle" : "Yeni Kayıt"}</h3>
            <button type="button" className="icon-btn" title="Kapat" aria-label="Kapat" onClick={closeForm}>
              <X size={15} strokeWidth={1.75} />
            </button>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <label>
                Müşteri Adı
                <input
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                  autoFocus
                />
              </label>
              <label>
                Telefon (opsiyonel)
                <input
                  value={form.customerPhone}
                  onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                  placeholder="05xx xxx xx xx"
                />
              </label>
            </div>
            <label style={{ display: "block", marginTop: "0.5rem" }}>
              Ürün / Parça Açıklaması (opsiyonel — parça kodu veya barkod ile de arayabilirsiniz)
              <input
                ref={descInputRef}
                value={form.description}
                onChange={(e) => handleDescriptionChange(e.target.value)}
                onFocus={() => setDescSuggestOpen(true)}
                onBlur={() => setTimeout(() => setDescSuggestOpen(false), 150)}
                placeholder="Örn. Vitra Rezervuar Takımı, parça kodu ya da barkod okutun"
                autoComplete="off"
              />
              {descMatches.length > 0 && (
                <SuggestionDropdown anchorRef={descInputRef}>
                  {descMatches.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onMouseDown={() => selectStockItem(s)}
                      style={{
                        display: "block",
                        width: "100%",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        padding: "0.4rem 0.6rem",
                        cursor: "pointer",
                        fontSize: "0.82rem",
                      }}
                    >
                      <strong>{s.code}</strong> — {s.name}
                    </button>
                  ))}
                </SuggestionDropdown>
              )}
            </label>
            <div className="form-row" style={{ marginTop: "0.5rem" }}>
              <label>
                Vitra Fiş No (opsiyonel)
                <input
                  value={form.vitraReceiptNo}
                  onChange={(e) => setForm((f) => ({ ...f, vitraReceiptNo: e.target.value }))}
                  placeholder="Örn. 123456"
                />
              </label>
              <label>
                Sipariş Tarihi
                <input
                  type="date"
                  value={form.orderedAt}
                  onChange={(e) => setForm((f) => ({ ...f, orderedAt: e.target.value }))}
                />
              </label>
              <label>
                Durum
                <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                  <option value="bekleniyor">Bekleniyor</option>
                  <option value="geldi">Geldi</option>
                </select>
              </label>
            </div>
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

      {view === "waiting" ? (
        <div className="card">
          {waiting.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Şu anda parça bekleyen müşteri yok.</p>
          ) : (
            waiting.map((p) => {
              const orderedDate = p.orderedAt || p.createdAt;
              const since = daysSince(orderedDate);
              return (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "0.6rem 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong style={{ flex: 1, minWidth: 160 }}>{p.customerName}</strong>
                    {p.customerPhone && <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>{p.customerPhone}</span>}
                    <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                      {since === 0 ? "Bugün sipariş edildi" : `${since} gündür bekliyor`}
                      {orderedDate && ` (${formatDateTR(orderedDate.slice(0, 10))})`}
                    </span>
                    <button
                      type="button"
                      className="secondary"
                      style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
                      onClick={() => markArrived(p)}
                    >
                      <PackageCheck size={14} strokeWidth={1.75} />
                      Ürün Geldi
                    </button>
                    <button type="button" className="icon-btn edit" title="Düzenle" aria-label="Düzenle" onClick={() => startEdit(p)}>
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Sil"
                      aria-label="Sil"
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                  <div style={{ marginTop: "0.2rem" }}>{p.description}</div>
                  {p.vitraReceiptNo && (
                    <small style={{ opacity: 0.7 }}>Vitra Fiş No: {p.vitraReceiptNo}</small>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : (
        <div className="card">
          <input
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            placeholder="Müşteri adına göre ara…"
            style={{ marginBottom: "0.75rem" }}
          />
          {history.length === 0 ? (
            <p style={{ opacity: 0.7 }}>Kayıt yok.</p>
          ) : (
            history.map((p) => {
              const waitedDays = daysBetween(p.orderedAt, p.arrivedAt);
              return (
                <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "0.6rem 0" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <strong style={{ flex: 1, minWidth: 160 }}>{p.customerName}</strong>
                    {p.customerPhone && <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>{p.customerPhone}</span>}
                    <span
                      style={{
                        padding: "0.1rem 0.5rem",
                        borderRadius: 999,
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        color: "white",
                        background: "var(--success, #2ecc71)",
                      }}
                    >
                      Geldi
                    </span>
                    <button type="button" className="icon-btn edit" title="Düzenle" aria-label="Düzenle" onClick={() => startEdit(p)}>
                      <Pencil size={14} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Sil"
                      aria-label="Sil"
                      onClick={() => handleDelete(p)}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                  <div style={{ marginTop: "0.2rem" }}>{p.description}</div>
                  {p.vitraReceiptNo && <small style={{ opacity: 0.7, display: "block" }}>Vitra Fiş No: {p.vitraReceiptNo}</small>}
                  <small style={{ opacity: 0.7, display: "block" }}>
                    Sipariş: {p.orderedAt || "-"} · Geldiği tarih: {p.arrivedAt || "-"}
                    {waitedDays != null && ` · ${waitedDays} gün bekledi`}
                  </small>
                  {p.updatedAt && (
                    <small style={{ opacity: 0.55, display: "block" }}>Son güncelleme: {formatDateTime(p.updatedAt)}</small>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <PendingPartsPrintView
        title={view === "waiting" ? "Bekleyen Parçalar" : "Bekleyen Parçalar — Geçmiş"}
        rows={view === "waiting" ? waiting : history}
        mode={view}
      />
    </div>
  );
}
