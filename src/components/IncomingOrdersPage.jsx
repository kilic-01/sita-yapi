import { useState } from "react";
import { Plus, Trash2, Pencil, Search, Printer, FileDown, ChevronDown, ChevronRight } from "lucide-react";
import IncomingOrderForm, { STATUS_OPTIONS } from "./IncomingOrderForm.jsx";
import IncomingOrderPrintView from "./IncomingOrderPrintView.jsx";
import { EmptyStateIllustration } from "./illustrations.jsx";
import { computeTotals, formatMoney } from "../lib/orderTotals.js";

const STATUS_LABELS = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

const STATUS_COLORS = {
  yeni: "#3b82f6",
  hazirlaniyor: "#f59e0b",
  kargoda: "#8b5cf6",
  teslim_edildi: "#10b981",
  odendi: "#6b7280",
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || "#6b7280";
  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.15rem 0.55rem",
        borderRadius: 999,
        fontSize: "0.75rem",
        fontWeight: 600,
        color: "#fff",
        background: color,
      }}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

export default function IncomingOrdersPage({ incomingOrders, onSaved, currentUser, users = [], stockItems = [] }) {
  const [view, setView] = useState("list"); // "list" | "form"
  const [editingOrder, setEditingOrder] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortOrder, setSortOrder] = useState("newest");
  const [expandedId, setExpandedId] = useState(null);
  const [previewOrder, setPreviewOrder] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }

  function startNew() {
    setEditingOrder(null);
    setView("form");
  }

  function startEdit(order) {
    setEditingOrder(order);
    setView("form");
  }

  function toggleExpanded(order) {
    setExpandedId((id) => (id === order.id ? null : order.id));
  }

  function handleSaved(order) {
    onSaved(order);
    setView("list");
    setEditingOrder(null);
  }

  async function handleDelete(order) {
    if (!window.confirm(`"${order.orderNo}" siparişini silmek istediğinize emin misiniz?`)) return;
    await window.api.deleteIncomingOrder(order.id, currentUser?.id);
    onSaved(null, order.id);
  }

  // QuotesPage.jsx'teki aynı desen: yazdırma/PDF öncesi gizli ".print-page"
  // görünümünün DOM'a işlenmesini bekleyip sonra ana süreçteki genel (sadece
  // ekrandaki .print-page içeriğini yazdıran/PDF'e çeviren) IPC'yi çağırır.
  async function withPreview(order, action) {
    setPreviewOrder(order);
    setBusy(true);
    setNotice(null);
    await new Promise((r) => setTimeout(r, 60));
    try {
      await action();
    } catch (err) {
      setNotice({ type: "error", text: err.message || "İşlem başarısız oldu." });
    } finally {
      setBusy(false);
    }
  }

  function handlePrint(order) {
    withPreview(order, async () => {
      window.api.printCurrent();
    });
  }

  function handlePdf(order) {
    withPreview(order, async () => {
      const fileName = `Siparis-${order.orderNo}-${order.customerName}.pdf`.replace(/[/\\]/g, "-");
      const path = await window.api.generateQuotePdf(fileName);
      if (path) setNotice({ type: "success", text: `PDF oluşturuldu: ${path}` });
    });
  }

  if (view === "form") {
    return (
      <IncomingOrderForm
        order={editingOrder}
        onSaved={handleSaved}
        onCancel={() => setView("list")}
        currentUser={currentUser}
        users={users}
        stockItems={stockItems}
        incomingOrders={incomingOrders}
      />
    );
  }

  const term = search.trim().toLowerCase();
  const filtered = incomingOrders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (!term) return true;
    return [o.orderNo, o.customerName, o.contactName, o.customerPhone].some((v) =>
      (v || "").toLowerCase().includes(term)
    );
  });
  const sorted = [...filtered].sort((a, b) => {
    const cmp = (a.orderDate || "") < (b.orderDate || "") ? -1 : (a.orderDate || "") > (b.orderDate || "") ? 1 : 0;
    return sortOrder === "newest" ? -cmp : cmp;
  });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Firmalardan Gelen Siparişler</h3>
        <button
          type="button"
          className="primary"
          onClick={startNew}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Plus size={16} strokeWidth={1.75} />
          Yeni Sipariş
        </button>
      </div>

      {notice && (
        <div className={notice.type} style={{ marginTop: "0.75rem" }}>
          {notice.text}
        </div>
      )}

      {incomingOrders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <EmptyStateIllustration />
          <p>Henüz gelen sipariş kaydedilmedi.</p>
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <label style={{ maxWidth: 340, flex: 1 }}>
              Ara (firma, sipariş no, telefon)
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  strokeWidth={1.75}
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Örn. Eyap ya da 2026-001"
                  style={{ paddingLeft: "2rem", width: "100%" }}
                />
              </div>
            </label>
            <label style={{ maxWidth: 200 }}>
              Durum
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">Tümü</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ maxWidth: 200 }}>
              Sıralama
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="newest">En Yeniden En Eskiye</option>
                <option value="oldest">En Eskiden En Yeniye</option>
              </select>
            </label>
          </div>
          {sorted.length === 0 ? (
            <p style={{ marginTop: "1rem" }}>Bu aramaya uyan sipariş bulunamadı.</p>
          ) : (
            sorted.map((order) => {
              const totals = computeTotals(order.items || [], order.discountRate);
              const isExpanded = expandedId === order.id;
              return (
                <div key={order.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.6rem 0",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => toggleExpanded(order)}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.4rem",
                        textAlign: "left",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        color: "inherit",
                      }}
                    >
                      {isExpanded ? (
                        <ChevronDown size={15} strokeWidth={1.75} style={{ opacity: 0.6, flexShrink: 0 }} />
                      ) : (
                        <ChevronRight size={15} strokeWidth={1.75} style={{ opacity: 0.6, flexShrink: 0 }} />
                      )}
                      <span style={{ minWidth: 0 }}>
                        <strong>{order.orderNo}</strong> — {order.customerName}
                        <div style={{ opacity: 0.7, fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.15rem" }}>
                          <span>
                            {order.orderDate} · {formatMoney(totals.genelToplam)} {order.currency}
                          </span>
                          <StatusBadge status={order.status} />
                        </div>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="icon-btn edit"
                      title="Düzenle"
                      aria-label="Düzenle"
                      onClick={() => startEdit(order)}
                    >
                      <Pencil size={15} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Yazdır"
                      aria-label="Yazdır"
                      disabled={busy}
                      onClick={() => handlePrint(order)}
                    >
                      <Printer size={15} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="PDF Oluştur"
                      aria-label="PDF Oluştur"
                      disabled={busy}
                      onClick={() => handlePdf(order)}
                    >
                      <FileDown size={15} strokeWidth={1.75} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Sil"
                      aria-label="Sil"
                      onClick={() => handleDelete(order)}
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  </div>

                  {isExpanded && (
                    <div style={{ padding: "0 0 0.75rem 1.6rem", overflowX: "auto" }}>
                      {order.items?.length ? (
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
                          <thead>
                            <tr style={{ textAlign: "left", opacity: 0.7 }}>
                              <th style={{ padding: "0.25rem 0.4rem" }}>Kod</th>
                              <th style={{ padding: "0.25rem 0.4rem" }}>Açıklama</th>
                              <th style={{ padding: "0.25rem 0.4rem" }}>Miktar</th>
                              <th style={{ padding: "0.25rem 0.4rem" }}>Birim</th>
                              <th style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>Birim Fiyat</th>
                              <th style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>Tutar</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items.map((it, i) => {
                              const gross = (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
                              const lineTotal = gross * (1 - (Number(it.discountRate) || 0) / 100);
                              return (
                                <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                                  <td style={{ padding: "0.25rem 0.4rem" }}>{it.code}</td>
                                  <td style={{ padding: "0.25rem 0.4rem" }}>{it.description}</td>
                                  <td style={{ padding: "0.25rem 0.4rem" }}>{it.qty}</td>
                                  <td style={{ padding: "0.25rem 0.4rem" }}>{it.unit}</td>
                                  <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>{formatMoney(it.unitPrice)}</td>
                                  <td style={{ padding: "0.25rem 0.4rem", textAlign: "right" }}>{formatMoney(lineTotal)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : (
                        <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>Bu siparişte kalem yok.</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      <IncomingOrderPrintView order={previewOrder} />
    </div>
  );
}
