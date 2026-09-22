import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, QrCode } from "lucide-react";
import { todayISO } from "../lib/format.js";
import { computeTotals, formatMoney } from "../lib/orderTotals.js";
import { normalizeForMatch } from "../lib/customerMatch.js";
import SuggestionDropdown from "./SuggestionDropdown.jsx";

const STATUS_OPTIONS = [
  { value: "yeni", label: "Yeni" },
  { value: "hazirlaniyor", label: "Hazırlanıyor" },
  { value: "kargoda", label: "Kargoda" },
  { value: "teslim_edildi", label: "Teslim Edildi" },
  { value: "odendi", label: "Ödendi" },
];

function emptyItem() {
  return { code: "", description: "", qty: 1, unit: "Adet", unitPrice: "", discountRate: 0, vatRate: 20 };
}

function emptyForm() {
  return {
    customerName: "",
    contactName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    orderDate: todayISO(),
    currency: "TRY",
    items: [emptyItem()],
    discountRate: 0,
    status: "yeni",
    deliveryType: "kendi_aracimiz",
    deliveryNote: "",
    notes: "",
    reminderAt: "",
    reminderNote: "",
    reminderUserIds: [],
  };
}

export default function IncomingOrderForm({
  order,
  onSaved,
  onCancel,
  currentUser,
  users = [],
  stockItems = [],
  incomingOrders = [],
}) {
  const [form, setForm] = useState(() =>
    order
      ? {
          customerName: order.customerName,
          contactName: order.contactName || "",
          customerPhone: order.customerPhone || "",
          customerEmail: order.customerEmail || "",
          customerAddress: order.customerAddress || "",
          orderDate: order.orderDate,
          currency: order.currency || "TRY",
          items: order.items?.length ? order.items : [emptyItem()],
          discountRate: order.discountRate ?? 0,
          status: order.status || "yeni",
          deliveryType: order.deliveryType || "kendi_aracimiz",
          deliveryNote: order.deliveryNote || "",
          notes: order.notes || "",
          reminderAt: order.reminderAt ? order.reminderAt.slice(0, 16) : "",
          reminderNote: order.reminderNote || "",
          reminderUserIds: order.reminderUserIds || [],
        }
      : emptyForm()
  );
  const [suggestFor, setSuggestFor] = useState(null); // satır index
  const [suggestField, setSuggestField] = useState(null); // "code" | "description" — kutucuğun hangi alanın altında gösterileceği
  const [suggestCustomer, setSuggestCustomer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const customerNameInputRef = useRef(null);
  const codeInputRefs = useRef({});
  const descriptionInputRefs = useRef({});

  // Aynı firma daha önce sipariş verdiyse (isim eşleşmesiyle) en güncel
  // kaydındaki iletişim/teslimat bilgilerini hatırlayıp tekrar yazmaya
  // gerek kalmasın diye — firma adı başına SADECE en son (createdAt'e göre)
  // siparişi tutan bir dizin.
  const customerDirectory = useMemo(() => {
    const map = new Map();
    for (const o of incomingOrders) {
      if (order && o.id === order.id) continue;
      const norm = normalizeForMatch(o.customerName);
      if (!norm) continue;
      const existing = map.get(norm);
      if (!existing || (o.createdAt || "") > (existing.createdAt || "")) {
        map.set(norm, o);
      }
    }
    return [...map.values()];
  }, [incomingOrders, order]);

  function pickCustomer(match) {
    setForm((f) => ({
      ...f,
      customerName: match.customerName,
      contactName: match.contactName || "",
      customerPhone: match.customerPhone || "",
      customerEmail: match.customerEmail || "",
      customerAddress: match.customerAddress || "",
      deliveryType: match.deliveryType || f.deliveryType,
      deliveryNote: match.deliveryNote || "",
    }));
    setSuggestCustomer(false);
  }

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Genel indirim, tüm satırların KENDİ iskonto (%) alanını aynı değere
  // doldurur — QuoteForm'daki aynı desen (bkz. computeTotals).
  function setDiscountRate(value) {
    setForm((f) => ({
      ...f,
      discountRate: value,
      items: f.items.map((it) => ({ ...it, discountRate: value })),
    }));
  }

  function setItem(idx, patch) {
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }

  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }));
  }

  function removeItem(idx) {
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  }

  function pickStockItem(idx, stockItem) {
    setItem(idx, {
      code: stockItem.code,
      description: stockItem.name || "",
      unitPrice: stockItem.price != null ? String(stockItem.price) : "",
    });
    setSuggestFor(null);
  }

  function toggleReminderUser(userId) {
    setForm((f) => ({
      ...f,
      reminderUserIds: f.reminderUserIds.includes(userId)
        ? f.reminderUserIds.filter((id) => id !== userId)
        : [...f.reminderUserIds, userId],
    }));
  }

  const totals = computeTotals(form.items, form.discountRate);

  // Kalemler stok kalemlerine bağlı değil (kod serbest metin) — bu yüzden
  // düşüm otomatik değil, her kayıtta kullanıcıya sorulur. Sadece kodu
  // GERÇEK bir stok kalemiyle birebir eşleşen satırlar düşülebilir;
  // eşleşmeyenler sessizce atlanır (uyarı notu gösterilir).
  async function deductFromStock(items) {
    const skipped = [];
    for (const it of items) {
      if (!it.code || !it.qty) continue;
      const stockItem = stockItems.find((s) => (s.code || "").toLowerCase() === it.code.toLowerCase());
      if (!stockItem) {
        skipped.push(it.code);
        continue;
      }
      const newQty = Math.max(0, Number(stockItem.quantity || 0) - Number(it.qty));
      await window.api.updateStockItem(stockItem.id, { quantity: newQty }, currentUser?.id);
    }
    if (skipped.length) {
      window.alert(`Stokta eşleşen kod bulunamadığı için düşülemeyen kalemler: ${skipped.join(", ")}`);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const cleanItems = form.items
        .filter((it) => it.description.trim() || it.code.trim())
        .map((it) => ({
          code: it.code.trim(),
          description: it.description.trim(),
          qty: Number(it.qty) || 0,
          unit: it.unit || "Adet",
          unitPrice: Number(it.unitPrice) || 0,
          discountRate: Number(it.discountRate) || 0,
          vatRate: Number(it.vatRate) || 0,
        }));
      const payload = {
        ...form,
        items: cleanItems,
        discountRate: Number(form.discountRate) || 0,
        reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
        actingUserId: currentUser?.id,
      };
      const saved = order
        ? await window.api.updateIncomingOrder(order.id, payload)
        : await window.api.addIncomingOrder(payload);
      if (cleanItems.length && window.confirm("Bu sipariş kalemleri stoktan düşülsün mü?")) {
        await deductFromStock(cleanItems);
      }
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>{order ? `Sipariş Düzenle — ${order.orderNo}` : "Yeni Gelen Sipariş"}</h3>

      <div className="form-row">
        <label style={{ flex: 1, position: "relative" }}>
          Firma / Kişi
          <input
            ref={customerNameInputRef}
            required
            value={form.customerName}
            onChange={(e) => setField("customerName", e.target.value)}
            onFocus={() => setSuggestCustomer(true)}
            onBlur={() => setTimeout(() => setSuggestCustomer(false), 150)}
            autoComplete="off"
          />
          {suggestCustomer &&
            form.customerName.trim() &&
            (() => {
              const q = normalizeForMatch(form.customerName);
              const matches = customerDirectory
                .filter((o) => normalizeForMatch(o.customerName).includes(q))
                .slice(0, 8);
              if (matches.length === 0) return null;
              return (
                <SuggestionDropdown anchorRef={customerNameInputRef}>
                  {matches.map((o) => (
                    <button
                      type="button"
                      key={o.id}
                      onMouseDown={() => pickCustomer(o)}
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
                      <strong>{o.customerName}</strong>
                      {o.customerPhone && <span style={{ opacity: 0.7 }}> · {o.customerPhone}</span>}
                      {o.contactName && <span style={{ opacity: 0.7 }}> · {o.contactName}</span>}
                    </button>
                  ))}
                </SuggestionDropdown>
              );
            })()}
        </label>
        <label>
          Yetkili
          <input value={form.contactName} onChange={(e) => setField("contactName", e.target.value)} />
        </label>
        <label>
          Telefon
          <input value={form.customerPhone} onChange={(e) => setField("customerPhone", e.target.value)} />
        </label>
        <label>
          E-posta
          <input
            type="email"
            value={form.customerEmail}
            onChange={(e) => setField("customerEmail", e.target.value)}
          />
        </label>
      </div>
      <div className="form-row">
        <label style={{ flex: 1 }}>
          Adres
          <input
            value={form.customerAddress}
            onChange={(e) => setField("customerAddress", e.target.value)}
          />
        </label>
        <label>
          Tarih
          <input type="date" value={form.orderDate} onChange={(e) => setField("orderDate", e.target.value)} />
        </label>
        <label>
          Para Birimi
          <select value={form.currency} onChange={(e) => setField("currency", e.target.value)} style={{ width: 100 }}>
            <option value="TRY">TRY (₺)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
          </select>
        </label>
        <label>
          Durum
          <select value={form.status} onChange={(e) => setField("status", e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ overflowX: "auto", margin: "1rem 0" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "0.4rem" }}>No</th>
              <th style={{ padding: "0.4rem" }}>Ürün/Kod</th>
              <th style={{ padding: "0.4rem" }}>Açıklama</th>
              <th style={{ padding: "0.4rem", width: 70 }}>Miktar</th>
              <th style={{ padding: "0.4rem", width: 80 }}>Birim</th>
              <th style={{ padding: "0.4rem", width: 100 }}>Birim Fiyat</th>
              <th style={{ padding: "0.4rem", width: 80 }}>İskonto (%)</th>
              <th style={{ padding: "0.4rem", width: 80 }}>KDV (%)</th>
              <th style={{ padding: "0.4rem", width: 100, textAlign: "right" }}>Tutar</th>
              <th style={{ padding: "0.4rem", width: 36 }} />
            </tr>
          </thead>
          <tbody>
            {form.items.map((item, idx) => {
              const gross = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
              const lineTotal = gross * (1 - (Number(item.discountRate) || 0) / 100);
              // Kod VEYA açıklama alanına yazılan metinle stoktan kod/ad/barkod
              // eşleşmesi aranır — hangi alan odaktaysa onun değeri kullanılır.
              const query = (suggestField === "description" ? item.description : item.code).trim().toLowerCase();
              const matches =
                suggestFor === idx && query
                  ? stockItems
                      .filter(
                        (s) =>
                          (s.code || "").toLowerCase().includes(query) ||
                          (s.name || "").toLowerCase().includes(query) ||
                          (s.barcode || "").toLowerCase().includes(query)
                      )
                      .slice(0, 8)
                  : [];
              const renderSuggestBox = (anchorRef) =>
                matches.length > 0 && (
                  <SuggestionDropdown anchorRef={anchorRef} minWidth={260}>
                    {matches.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onMouseDown={() => pickStockItem(idx, s)}
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
                        {s.barcode && (
                          <QrCode
                            size={13}
                            strokeWidth={1.75}
                            title={`Barkod: ${s.barcode}`}
                            style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                          />
                        )}
                        {s.price != null && <span style={{ opacity: 0.7 }}> · {formatMoney(s.price)}</span>}
                      </button>
                    ))}
                  </SuggestionDropdown>
                );
              return (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem" }}>{idx + 1}</td>
                  <td style={{ padding: "0.4rem", position: "relative" }}>
                    <input
                      ref={(el) => (codeInputRefs.current[idx] = el)}
                      value={item.code}
                      onChange={(e) => setItem(idx, { code: e.target.value })}
                      onFocus={() => {
                        setSuggestFor(idx);
                        setSuggestField("code");
                      }}
                      onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
                      placeholder="Kod ara..."
                      style={{ width: "100%" }}
                    />
                    {suggestField === "code" && renderSuggestBox({ current: codeInputRefs.current[idx] })}
                  </td>
                  <td style={{ padding: "0.4rem", position: "relative" }}>
                    <input
                      ref={(el) => (descriptionInputRefs.current[idx] = el)}
                      value={item.description}
                      onChange={(e) => setItem(idx, { description: e.target.value })}
                      onFocus={() => {
                        setSuggestFor(idx);
                        setSuggestField("description");
                      }}
                      onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
                      placeholder="Ürün adı ara..."
                      style={{ width: "100%" }}
                    />
                    {suggestField === "description" && renderSuggestBox({ current: descriptionInputRefs.current[idx] })}
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <input
                      type="number"
                      min="0"
                      value={item.qty}
                      onChange={(e) => setItem(idx, { qty: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <input
                      value={item.unit}
                      onChange={(e) => setItem(idx, { unit: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => setItem(idx, { unitPrice: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={item.discountRate}
                      onChange={(e) => setItem(idx, { discountRate: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={item.vatRate}
                      onChange={(e) => setItem(idx, { vatRate: e.target.value })}
                      style={{ width: "100%" }}
                    />
                  </td>
                  <td style={{ padding: "0.4rem", textAlign: "right" }}>{formatMoney(lineTotal)}</td>
                  <td style={{ padding: "0.4rem" }}>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Satırı sil"
                      aria-label="Satırı sil"
                      onClick={() => removeItem(idx)}
                    >
                      <Trash2 size={15} strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <button
          type="button"
          className="secondary"
          onClick={addItem}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.6rem" }}
        >
          <Plus size={15} strokeWidth={1.75} />
          Satır Ekle
        </button>
      </div>

      <div className="form-row">
        <label>
          Teslimat Tipi
          <select value={form.deliveryType} onChange={(e) => setField("deliveryType", e.target.value)}>
            <option value="kendi_aracimiz">Kendi Aracımız</option>
            <option value="kargo">Kargo</option>
          </select>
        </label>
        <label style={{ flex: 1 }}>
          Teslimat Notu
          <input value={form.deliveryNote} onChange={(e) => setField("deliveryNote", e.target.value)} />
        </label>
        <label>
          Genel İndirim Oranı (%)
          <input
            type="number"
            min="0"
            max="100"
            value={form.discountRate}
            onChange={(e) => setDiscountRate(e.target.value)}
            style={{ width: 100 }}
            title="Tüm satırların iskonto (%) alanını bu değere doldurur — sonrasında satır bazında ayrıca değiştirilebilir."
          />
        </label>
      </div>
      <div className="form-row">
        <label style={{ flex: 1 }}>
          Not
          <input value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        </label>
      </div>

      <div style={{ marginTop: "1rem", padding: "0.85rem", border: "1px solid var(--border)", borderRadius: 8 }}>
        <strong style={{ fontSize: "0.9rem" }}>Hatırlatma</strong>
        <div className="form-row" style={{ marginTop: "0.5rem" }}>
          <label>
            Tarih / Saat
            <input
              type="datetime-local"
              value={form.reminderAt}
              onChange={(e) => setField("reminderAt", e.target.value)}
            />
          </label>
          <label style={{ flex: 1 }}>
            Hatırlatma Notu
            <input value={form.reminderNote} onChange={(e) => setField("reminderNote", e.target.value)} />
          </label>
        </div>
        <div style={{ marginTop: "0.6rem" }}>
          <small style={{ opacity: 0.7 }}>Bildirim gidecek kullanıcılar:</small>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.3rem" }}>
            {users.map((u) => (
              <label
                key={u.id}
                style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 400 }}
              >
                <input
                  type="checkbox"
                  checked={form.reminderUserIds.includes(u.id)}
                  onChange={() => toggleReminderUser(u.id)}
                />
                {u.name}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          marginLeft: "auto",
          width: 280,
          display: "flex",
          flexDirection: "column",
          gap: "0.3rem",
          marginTop: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>Ara Toplam</span>
          <span>{formatMoney(totals.araToplam)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>İndirim Tutarı</span>
          <span>{formatMoney(totals.indirimTutari)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>KDV Matrahı</span>
          <span>{formatMoney(totals.kdvMatrahi)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>KDV Toplamı</span>
          <span>{formatMoney(totals.kdvToplami)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
          <span>GENEL TOPLAM</span>
          <span>{formatMoney(totals.genelToplam)} {form.currency}</span>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      <div style={{ marginTop: "1rem" }}>
        <button className="primary" type="submit" disabled={saving}>
          {saving ? "Kaydediliyor..." : "Kaydet"}
        </button>
        <button type="button" className="secondary" style={{ marginLeft: "0.6rem" }} onClick={onCancel}>
          Vazgeç
        </button>
      </div>
    </form>
  );
}

export { STATUS_OPTIONS };
