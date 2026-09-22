import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronRight, ChevronDown, Pencil, QrCode } from "lucide-react";
import { todayISO } from "../lib/format.js";
import Modal from "./Modal.jsx";
import PartCheckoutsPrintView from "./PartCheckoutsPrintView.jsx";
import SuggestionDropdown from "./SuggestionDropdown.jsx";

const STOCK_RESULT_LIMIT = 8;
const VAT_RATE = 1.2;

function emptyDraft() {
  return { qtyUsed: "", qtyReturned: "", appointmentId: "" };
}

// Fiyatlar her yerde KDV DAHİL gösterilir — sadece bilgi amaçlı, stok
// kaleminin kendi (KDV hariç) `price` alanına hiçbir şekilde yazılmaz.
function formatPriceWithVat(price) {
  return `₺${(Number(price) * VAT_RATE).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}

let rowKeySeq = 0;
function emptyProductRow() {
  rowKeySeq += 1;
  return { key: `row-${rowKeySeq}`, search: "", selectedStock: null, qty: "1" };
}

export default function PartCheckoutsPage({
  stockItems = [],
  technicians = [],
  appointments = [],
  partCheckouts = [],
  currentUser,
  onChanged,
}) {
  const [date, setDate] = useState(todayISO());
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [technicianId, setTechnicianId] = useState("");
  const [productRows, setProductRows] = useState([emptyProductRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reconcileDrafts, setReconcileDrafts] = useState({});
  const [expandedTechIds, setExpandedTechIds] = useState(new Set());
  const [editingReconcileId, setEditingReconcileId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  const [itemEditDraft, setItemEditDraft] = useState({ search: "", selectedStock: null, qty: "1" });
  const itemEditInputRef = useRef(null);
  const productRowInputRefs = useRef({});

  function toggleTechExpanded(techId) {
    setExpandedTechIds((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) next.delete(techId);
      else next.add(techId);
      return next;
    });
  }

  const assignableTechnicians = technicians.filter((t) => t.assignable !== false);

  function stockMatchesFor(term) {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    return stockItems
      .filter(
        (s) =>
          (s.code || "").toLowerCase().includes(t) ||
          (s.name || "").toLowerCase().includes(t) ||
          (s.barcode || "").toLowerCase().includes(t)
      )
      .slice(0, STOCK_RESULT_LIMIT);
  }

  function updateProductRow(key, patch) {
    setProductRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addProductRow() {
    setProductRows((prev) => [...prev, emptyProductRow()]);
  }

  function removeProductRow(key) {
    setProductRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  }

  const dayCheckouts = useMemo(() => partCheckouts.filter((c) => c.date === date), [partCheckouts, date]);

  // Teknisyene göre grupla — dispatcher sabah "kim ne aldı"yı, akşam "kimde
  // ne var, mutabakatı bekleyen ne"yi teknisyen bazlı görmek istiyor.
  const byTechnician = useMemo(() => {
    const groups = new Map();
    for (const c of dayCheckouts) {
      if (!groups.has(c.technicianId)) groups.set(c.technicianId, []);
      groups.get(c.technicianId).push(c);
    }
    return groups;
  }, [dayCheckouts]);

  // İsme göre alfabetik sıralı liste — her teknisyen bir başlık, tıklanınca
  // o günkü zimmetleri açılır/kapanır (accordion) gösterilir.
  const sortedTechnicianEntries = useMemo(() => {
    return [...byTechnician.entries()].sort(([aId], [bId]) => {
      const aName = technicians.find((t) => t.id === aId)?.name || "";
      const bName = technicians.find((t) => t.id === bId)?.name || "";
      return aName.localeCompare(bName, "tr");
    });
  }, [byTechnician, technicians]);

  // Yazdırma çıktısı için aynı (alfabetik sıralı) gruplamayı stok kalemi
  // bilgisiyle zenginleştirir — ekranda görülen sırayla aynı çıksın diye.
  const printGroups = useMemo(
    () =>
      sortedTechnicianEntries.map(([techId, rows]) => ({
        technician: technicians.find((t) => t.id === techId),
        rows: rows.map((checkout) => ({
          checkout,
          stock: stockItems.find((s) => s.id === checkout.stockItemId),
        })),
      })),
    [sortedTechnicianEntries, technicians, stockItems]
  );

  function draftFor(checkoutId) {
    return reconcileDrafts[checkoutId] || emptyDraft();
  }

  function updateDraft(checkoutId, patch) {
    setReconcileDrafts((prev) => ({ ...prev, [checkoutId]: { ...draftFor(checkoutId), ...patch } }));
  }

  function stockOf(stockItemId) {
    return stockItems.find((x) => x.id === stockItemId);
  }

  function resetCheckoutForm() {
    setTechnicianId("");
    setProductRows([emptyProductRow()]);
    setError("");
  }

  async function handleCheckout(e) {
    e.preventDefault();
    setError("");
    if (!technicianId) {
      setError("Teknisyen seçin.");
      return;
    }
    const validRows = productRows.filter((r) => r.selectedStock && Number(r.qty) > 0);
    if (validRows.length === 0) {
      setError("En az bir ürün seçip miktar girin.");
      return;
    }

    for (const r of validRows) {
      if (Number(r.qty) > Number(r.selectedStock.quantity)) {
        const proceed = window.confirm(
          `${r.selectedStock.code}: stokta sadece ${r.selectedStock.quantity} ${r.selectedStock.unit || "adet"} görünüyor. Yine de zimmetlensin mi?`
        );
        if (!proceed) return;
      }
    }

    setSaving(true);
    try {
      // Ard arda (transaction yok) — bir satır başarısız olursa öncekiler
      // zaten kaydedilmiş olur, onChanged() yine de en güncel durumu getirir.
      for (const r of validRows) {
        await window.api.addPartCheckout({
          technicianId,
          stockItemId: r.selectedStock.id,
          date,
          qtyTaken: Number(r.qty),
          actingUserId: currentUser?.id,
        });
      }
      resetCheckoutForm();
      setShowCheckoutModal(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleReconcile(checkout) {
    const draft = draftFor(checkout.id);
    const qtyUsed = Number(draft.qtyUsed) || 0;
    const qtyReturned = Number(draft.qtyReturned) || 0;
    if (qtyUsed + qtyReturned !== checkout.qtyTaken) {
      window.alert(`Kullanılan + iade edilen, alınan miktara (${checkout.qtyTaken}) eşit olmalı.`);
      return;
    }
    try {
      await window.api.reconcilePartCheckout(checkout.id, {
        qtyUsed,
        qtyReturned,
        appointmentId: draft.appointmentId || null,
        actingUserId: currentUser?.id,
      });
      setReconcileDrafts((prev) => {
        const next = { ...prev };
        delete next[checkout.id];
        return next;
      });
      setEditingReconcileId(null);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    }
  }

  // Zaten mutabakatı yapılmış bir kaydı düzeltmek için — mevcut kullanılan/
  // iade/randevu değerlerini forma önceden doldurup aynı formu tekrar açar.
  function startEditReconcile(checkout) {
    setReconcileDrafts((prev) => ({
      ...prev,
      [checkout.id]: {
        qtyUsed: checkout.qtyUsed != null ? String(checkout.qtyUsed) : "",
        qtyReturned: checkout.qtyReturned != null ? String(checkout.qtyReturned) : "",
        appointmentId: checkout.appointmentId || "",
      },
    }));
    setEditingReconcileId(checkout.id);
  }

  function startEditItem(checkout) {
    setEditingItemId(checkout.id);
    setItemEditDraft({ search: "", selectedStock: stockOf(checkout.stockItemId) || null, qty: String(checkout.qtyTaken) });
  }

  function cancelEditItem() {
    setEditingItemId(null);
  }

  async function saveEditItem(checkoutId) {
    if (!itemEditDraft.selectedStock) {
      window.alert("Ürün seçin.");
      return;
    }
    const qtyNum = Number(itemEditDraft.qty);
    if (!qtyNum || qtyNum <= 0) {
      window.alert("Miktar 0'dan büyük olmalı.");
      return;
    }
    try {
      // Alınan ürün/miktar değiştiği için önceki mutabakat (varsa) artık
      // geçersiz — kayıt "outstanding"e döner, dispatcher yeniden mutabakat
      // yapar.
      await window.api.updatePartCheckout(checkoutId, {
        stockItemId: itemEditDraft.selectedStock.id,
        qtyTaken: qtyNum,
        status: "outstanding",
        qtyUsed: null,
        qtyReturned: null,
        appointmentId: null,
        actingUserId: currentUser?.id,
      });
      setEditingItemId(null);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function handleDeleteCheckout(checkout) {
    const stock = stockOf(checkout.stockItemId);
    const label = stock ? `${stock.code} — ${stock.name}` : "bu ürün";
    if (!window.confirm(`${label} (${checkout.qtyTaken} adet) zimmet kaydı silinsin mi?`)) return;
    try {
      await window.api.deletePartCheckout(checkout.id, currentUser?.id);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function handlePrint() {
    window.api.printCurrent();
  }

  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <label style={{ maxWidth: 200, marginBottom: 0 }}>
          Tarih
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="secondary" onClick={handlePrint}>
            Yazdır
          </button>
          <button type="button" className="primary" onClick={() => setShowCheckoutModal(true)}>
            + Zimmet Ekle
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{date} Zimmetleri</h3>
        {byTechnician.size === 0 && <p>Bu tarih için zimmet yok.</p>}
        {sortedTechnicianEntries.map(([techId, rows]) => {
          const tech = technicians.find((t) => t.id === techId);
          const isExpanded = expandedTechIds.has(techId);
          const techAppointments = appointments.filter(
            (a) => a.assignedTechnicianId === techId && a.scheduledDate === date
          );
          return (
            <div key={techId} style={{ marginBottom: "0.75rem" }}>
              <button
                type="button"
                onClick={() => toggleTechExpanded(techId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  width: "100%",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "0.4rem 0",
                  textAlign: "left",
                  color: "inherit",
                  font: "inherit",
                }}
              >
                {isExpanded ? (
                  <ChevronDown size={16} strokeWidth={1.75} />
                ) : (
                  <ChevronRight size={16} strokeWidth={1.75} />
                )}
                <h4 style={{ margin: 0 }}>{tech?.name || "Bilinmeyen teknisyen"}</h4>
                <small style={{ opacity: 0.6 }}>({rows.length} kalem)</small>
              </button>
              {isExpanded &&
                rows.map((c) => {
                  const stock = stockOf(c.stockItemId);
                  const isEditingThisItem = editingItemId === c.id;
                  const editMatches = itemEditDraft.selectedStock ? [] : stockMatchesFor(itemEditDraft.search);
                  const showReconcileForm = c.status !== "reconciled" || editingReconcileId === c.id;
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: "0.5rem 0",
                        borderBottom: "1px solid var(--border)",
                        opacity: c.status === "reconciled" && !showReconcileForm ? 0.6 : 1,
                      }}
                    >
                      {isEditingThisItem ? (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                          <label style={{ position: "relative", flex: 1, minWidth: 200, marginBottom: 0 }}>
                            Ürün
                            <input
                              ref={itemEditInputRef}
                              value={
                                itemEditDraft.selectedStock
                                  ? `${itemEditDraft.selectedStock.code} — ${itemEditDraft.selectedStock.name}`
                                  : itemEditDraft.search
                              }
                              onChange={(e) =>
                                setItemEditDraft((d) => ({ ...d, selectedStock: null, search: e.target.value }))
                              }
                              placeholder="Kod veya isimle ara"
                              autoFocus
                            />
                            {editMatches.length > 0 && (
                              <SuggestionDropdown anchorRef={itemEditInputRef}>
                                {editMatches.map((s) => (
                                  <div
                                    key={s.id}
                                    onClick={() => setItemEditDraft((d) => ({ ...d, selectedStock: s, search: "" }))}
                                    style={{
                                      padding: "0.4rem 0.6rem",
                                      cursor: "pointer",
                                      borderBottom: "1px solid var(--border)",
                                    }}
                                  >
                                    <strong>{s.code}</strong> {s.name}
                                    {s.barcode && (
                                      <QrCode
                                        size={13}
                                        strokeWidth={1.75}
                                        title={`Barkod: ${s.barcode}`}
                                        style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                                      />
                                    )}
                                  </div>
                                ))}
                              </SuggestionDropdown>
                            )}
                          </label>
                          <label style={{ maxWidth: 90, marginBottom: 0 }}>
                            Miktar
                            <input
                              type="number"
                              min="1"
                              value={itemEditDraft.qty}
                              onChange={(e) => setItemEditDraft((d) => ({ ...d, qty: e.target.value }))}
                            />
                          </label>
                          <button
                            type="button"
                            className="primary"
                            style={{ marginTop: "1.6rem" }}
                            onClick={() => saveEditItem(c.id)}
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            style={{ marginTop: "1.6rem" }}
                            onClick={cancelEditItem}
                          >
                            Vazgeç
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                          <div>
                            <strong>{stock ? `${stock.code} — ${stock.name}` : "Bilinmeyen ürün"}</strong> —{" "}
                            {c.qtyTaken} {stock?.unit || "adet"}
                            {stock?.price != null && (
                              <small style={{ opacity: 0.6, marginLeft: "0.4rem" }}>
                                {c.qtyTaken > 1 ? (
                                  <>
                                    (KDV dahil {formatPriceWithVat(stock.price)}/{stock.unit || "adet"} · toplam KDV
                                    dahil {formatPriceWithVat(Number(stock.price) * c.qtyTaken)})
                                  </>
                                ) : (
                                  <>(KDV dahil {formatPriceWithVat(stock.price)})</>
                                )}
                              </small>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Ürünü/miktarı düzelt"
                              aria-label="Ürünü/miktarı düzelt"
                              onClick={() => startEditItem(c)}
                            >
                              <Pencil size={14} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn delete"
                              title="Zimmeti sil"
                              aria-label="Zimmeti sil"
                              onClick={() => handleDeleteCheckout(c)}
                            >
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                      )}

                      {!isEditingThisItem &&
                        (showReconcileForm ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "flex-end",
                              marginTop: "0.3rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <label style={{ maxWidth: 90 }}>
                              Kullanılan
                              <input
                                type="number"
                                min="0"
                                max={c.qtyTaken}
                                value={draftFor(c.id).qtyUsed}
                                onChange={(e) => updateDraft(c.id, { qtyUsed: e.target.value })}
                              />
                            </label>
                            <label style={{ maxWidth: 90 }}>
                              İade
                              <input
                                type="number"
                                min="0"
                                max={c.qtyTaken}
                                value={draftFor(c.id).qtyReturned}
                                onChange={(e) => updateDraft(c.id, { qtyReturned: e.target.value })}
                              />
                            </label>
                            <label style={{ minWidth: 180 }}>
                              Randevu (opsiyonel)
                              <select
                                value={draftFor(c.id).appointmentId}
                                onChange={(e) => updateDraft(c.id, { appointmentId: e.target.value })}
                              >
                                <option value="">{techAppointments.length ? "—" : "Bu tarihte randevusu yok"}</option>
                                {techAppointments.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.customerName}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button type="button" className="secondary" onClick={() => handleReconcile(c)}>
                              Mutabakat Yap
                            </button>
                            {c.status === "reconciled" && (
                              <button type="button" className="secondary" onClick={() => setEditingReconcileId(null)}>
                                Vazgeç
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginTop: "0.2rem",
                            }}
                          >
                            <small style={{ opacity: 0.8 }}>
                              Kullanılan: {c.qtyUsed} · İade: {c.qtyReturned}
                            </small>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startEditReconcile(c)}
                              style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}
                            >
                              Mutabakatı Düzelt
                            </button>
                          </div>
                        ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {showCheckoutModal && (
        <Modal
          onClose={() => {
            setShowCheckoutModal(false);
            resetCheckoutForm();
          }}
          maxWidth={560}
        >
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Yeni Zimmet</h3>
            <form onSubmit={handleCheckout}>
              <label>
                Teknisyen
                <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                  <option value="">Seçin</option>
                  {assignableTechnicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>

              {productRows.map((row, idx) => {
                const matches = row.selectedStock ? [] : stockMatchesFor(row.search);
                return (
                  <div
                    key={row.key}
                    style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.75rem" }}
                  >
                    <label style={{ position: "relative", flex: 1, marginBottom: 0 }}>
                      {idx === 0 ? "Ürün" : ""}
                      <input
                        ref={(el) => (productRowInputRefs.current[row.key] = el)}
                        value={row.selectedStock ? `${row.selectedStock.code} — ${row.selectedStock.name}` : row.search}
                        onChange={(e) => updateProductRow(row.key, { selectedStock: null, search: e.target.value })}
                        placeholder="Kod veya isimle ara"
                        autoFocus={idx === 0}
                      />
                      {matches.length > 0 && (
                        <SuggestionDropdown anchorRef={{ current: productRowInputRefs.current[row.key] }}>
                          {matches.map((s) => (
                            <div
                              key={s.id}
                              onClick={() => updateProductRow(row.key, { selectedStock: s, search: "" })}
                              style={{
                                padding: "0.4rem 0.6rem",
                                cursor: "pointer",
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <strong>{s.code}</strong> {s.name}
                              {s.barcode && (
                                <QrCode
                                  size={13}
                                  strokeWidth={1.75}
                                  title={`Barkod: ${s.barcode}`}
                                  style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                                />
                              )}{" "}
                              <small style={{ opacity: 0.7 }}>
                                ({s.quantity} {s.unit || "adet"}
                                {s.price != null && <> · KDV dahil {formatPriceWithVat(s.price)}</>})
                              </small>
                            </div>
                          ))}
                        </SuggestionDropdown>
                      )}
                      {row.selectedStock?.price != null && (
                        <small style={{ opacity: 0.7, display: "block", marginTop: "0.2rem" }}>
                          Birim fiyat, KDV dahil (bilgi amaçlı, kaydedilmez): {formatPriceWithVat(row.selectedStock.price)}
                        </small>
                      )}
                    </label>
                    <label style={{ maxWidth: 90, marginBottom: 0 }}>
                      {idx === 0 ? "Miktar" : ""}
                      <input
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(e) => updateProductRow(row.key, { qty: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Bu satırı kaldır"
                      aria-label="Bu satırı kaldır"
                      onClick={() => removeProductRow(row.key)}
                      disabled={productRows.length === 1}
                      style={{ marginTop: idx === 0 ? "1.6rem" : 0 }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                className="secondary"
                onClick={addProductRow}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.75rem" }}
              >
                <Plus size={15} strokeWidth={1.75} />
                Ürün Ekle
              </button>

              {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="submit" className="primary" disabled={saving}>
                  Zimmetle
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowCheckoutModal(false);
                    resetCheckoutForm();
                  }}
                >
                  Vazgeç
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      <PartCheckoutsPrintView date={date} groups={printGroups} />
    </div>
  );
}
