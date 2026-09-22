import { useRef, useState } from "react";
import { Plus, Trash2, QrCode } from "lucide-react";
import { todayISO } from "../lib/format.js";
import { computeTotals, formatMoney } from "../lib/orderTotals.js";
import SuggestionDropdown from "./SuggestionDropdown.jsx";

const DEFAULT_PAYMENT_TERMS = "Nakit · Anlaşmalı Kredi ve Banka Kartları · Havale/EFT";
const DEFAULT_WARRANTY = "2 Yıl";
const DEFAULT_NOTES = "Fiyatlara aksi belirtilmedikçe nakliye ve montaj dahil değildir.";

function emptyItem() {
  return { code: "", description: "", qty: 1, unit: "Adet", unitPrice: "", discountRate: 0, vatRate: 20 };
}

function emptyForm(currentUser) {
  return {
    customerName: "",
    contactName: "",
    customerPhone: "",
    customerEmail: "",
    customerAddress: "",
    quoteDate: todayISO(),
    validityDays: 15,
    preparedBy: currentUser?.name || "",
    currency: "TRY",
    items: [emptyItem()],
    paymentTerms: DEFAULT_PAYMENT_TERMS,
    warranty: DEFAULT_WARRANTY,
    notes: DEFAULT_NOTES,
    iban: "",
    discountRate: 0,
  };
}

export default function QuoteForm({ quote, onSaved, onCancel, stockItems = [], currentUser }) {
  const [form, setForm] = useState(() =>
    quote
      ? {
          customerName: quote.customerName,
          contactName: quote.contactName || "",
          customerPhone: quote.customerPhone || "",
          customerEmail: quote.customerEmail || "",
          customerAddress: quote.customerAddress || "",
          quoteDate: quote.quoteDate,
          validityDays: quote.validityDays ?? 15,
          preparedBy: quote.preparedBy || "",
          currency: quote.currency || "TRY",
          items: quote.items?.length ? quote.items : [emptyItem()],
          paymentTerms: quote.paymentTerms || DEFAULT_PAYMENT_TERMS,
          warranty: quote.warranty || DEFAULT_WARRANTY,
          notes: quote.notes || DEFAULT_NOTES,
          iban: quote.iban || "",
          discountRate: quote.discountRate ?? 0,
        }
      : emptyForm(currentUser)
  );
  const [suggestFor, setSuggestFor] = useState(null); // satır index
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const codeInputRefs = useRef({});

  function setField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Genel indirim, tüm satırların KENDİ iskonto (%) alanını aynı değere
  // doldurur — satır iskontosu bundan sonra yine bağımsız olarak
  // değiştirilebilir (bkz. computeTotals: genel indirim ayrıca ek bir
  // düşüm olarak uygulanmaz, sadece satırlara yayılır).
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

  const totals = computeTotals(form.items, form.discountRate);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = {
        ...form,
        items: form.items
          .filter((it) => it.description.trim() || it.code.trim())
          .map((it) => ({
            code: it.code.trim(),
            description: it.description.trim(),
            qty: Number(it.qty) || 0,
            unit: it.unit || "Adet",
            unitPrice: Number(it.unitPrice) || 0,
            discountRate: Number(it.discountRate) || 0,
            vatRate: Number(it.vatRate) || 0,
          })),
        discountRate: Number(form.discountRate) || 0,
        actingUserId: currentUser?.id,
      };
      const saved = quote
        ? await window.api.updateQuote(quote.id, payload)
        : await window.api.addQuote(payload);
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>{quote ? `Teklif Düzenle — ${quote.quoteNo}` : "Yeni Fiyat Teklifi"}</h3>

      <div className="form-row">
        <label style={{ flex: 1 }}>
          Firma / Kişi
          <input
            required
            value={form.customerName}
            onChange={(e) => setField("customerName", e.target.value)}
          />
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
          <input type="date" value={form.quoteDate} onChange={(e) => setField("quoteDate", e.target.value)} />
        </label>
        <label>
          Geçerlilik (gün)
          <input
            type="number"
            min="0"
            style={{ width: 90 }}
            value={form.validityDays}
            onChange={(e) => setField("validityDays", e.target.value)}
          />
        </label>
        <label>
          Hazırlayan
          <input value={form.preparedBy} onChange={(e) => setField("preparedBy", e.target.value)} />
        </label>
        <label>
          Para Birimi
          <select value={form.currency} onChange={(e) => setField("currency", e.target.value)} style={{ width: 100 }}>
            <option value="TRY">TRY (₺)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
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
              const matches =
                suggestFor === idx && item.code.trim()
                  ? stockItems
                      .filter((s) => {
                        const q = item.code.trim().toLowerCase();
                        return (s.code || "").toLowerCase().includes(q) || (s.barcode || "").toLowerCase().includes(q);
                      })
                      .slice(0, 8)
                  : [];
              return (
                <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.4rem" }}>{idx + 1}</td>
                  <td style={{ padding: "0.4rem", position: "relative" }}>
                    <input
                      ref={(el) => (codeInputRefs.current[idx] = el)}
                      value={item.code}
                      onChange={(e) => setItem(idx, { code: e.target.value })}
                      onFocus={() => setSuggestFor(idx)}
                      onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
                      placeholder="Kod ara..."
                      style={{ width: "100%" }}
                    />
                    {matches.length > 0 && (
                      <SuggestionDropdown anchorRef={{ current: codeInputRefs.current[idx] }} minWidth={260}>
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
                          </button>
                        ))}
                      </SuggestionDropdown>
                    )}
                  </td>
                  <td style={{ padding: "0.4rem" }}>
                    <input
                      value={item.description}
                      onChange={(e) => setItem(idx, { description: e.target.value })}
                      style={{ width: "100%" }}
                    />
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
        <label style={{ flex: 1 }}>
          Ödeme
          <input value={form.paymentTerms} onChange={(e) => setField("paymentTerms", e.target.value)} />
        </label>
        <label>
          Garanti
          <input value={form.warranty} onChange={(e) => setField("warranty", e.target.value)} style={{ width: 100 }} />
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
          Açıklama
          <input value={form.notes} onChange={(e) => setField("notes", e.target.value)} />
        </label>
        <label style={{ flex: 1 }}>
          IBAN
          <input value={form.iban} onChange={(e) => setField("iban", e.target.value)} />
        </label>
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
