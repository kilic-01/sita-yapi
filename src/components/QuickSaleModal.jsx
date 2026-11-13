import { useRef, useState } from "react";
import { Plus, Trash2, QrCode } from "lucide-react";
import { computeTotals, formatMoney } from "../lib/orderTotals.js";
import Modal from "./Modal.jsx";
import SuggestionDropdown from "./SuggestionDropdown.jsx";

// Anasayfadaki "Satış" butonundan açılan hızlı satış popup'ı — bir çalışan
// barkod okutarak/ürün kodu yazarak birden çok kalemi hızlıca ekleyip
// toplamı (KDV dahil) görebilsin, müşteriye anında fiyat söyleyebilsin diye.
// QuoteForm.jsx'teki satır/arama/toplam mantığı (computeTotals, "Genel
// İndirim Oranı" satırlara yayma deseni) BİREBİR aynı şekilde kullanılıyor —
// burada yeniden icat edilmedi.

// App Store/Google Pay'deki ödeme onayı gibi kısa, pozitif bir "ding" sesi —
// ayrı bir ses dosyası gömmeye gerek kalmadan Web Audio API ile anlık üretilir
// (iki kısa, yükselen nota). Satış gerçekten kaydedildiğinde çalınır.
function playSaleConfirmSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes = [880, 1318.5]; // A5 -> E6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
    setTimeout(() => ctx.close(), 500);
  } catch {
    // Ses çalınamazsa (ör. tarayıcı kısıtlaması) satış akışı hiç etkilenmesin.
  }
}

function emptyItem() {
  return {
    code: "",
    description: "",
    qty: 1,
    unitPrice: "",
    discountRate: 0,
    vatRate: 20,
    stockItemId: null,
    // Bir ürün birden fazla depoda olabildiği için (bkz. electron/db.js
    // stockItemDepots) hangi depodan düşüleceği net değilse (depotOptions'ta
    // birden fazla satır varsa) kullanıcı seçene kadar null kalır.
    depotId: null,
    depotOptions: null,
  };
}

export default function QuickSaleModal({ stockItems = [], depots = [], currentUser, onClose, onSaved }) {
  const [items, setItems] = useState([emptyItem()]);
  const [suggestFor, setSuggestFor] = useState(null);
  const [generalDiscountRate, setGeneralDiscountRateState] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const codeInputRefs = useRef({});

  function setItem(idx, patch) {
    setItems((its) => its.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((its) => [...its, emptyItem()]);
  }

  function removeItem(idx) {
    setItems((its) => its.filter((_, i) => i !== idx));
  }

  function depotName(id) {
    return depots.find((d) => d.id === id)?.name || "Bilinmeyen depo";
  }

  // Satışlar normalde dükkanda yapılıyor — depo seçimi varsayılan olarak
  // hep "Dükkan" olmalı, orada stok yoksa kayıtlı olduğu depodan düşülüp
  // kullanıcı satış sonrası uyarılır (bkz. handleComplete).
  const shopDepotId = depots.find((d) => d.name === "Dükkan")?.id;

  async function pickStockItem(idx, stockItem) {
    setItem(idx, {
      code: stockItem.code,
      description: stockItem.name || "",
      unitPrice: stockItem.price != null ? String(stockItem.price) : "",
      stockItemId: stockItem.id,
      depotId: null,
      depotOptions: null,
    });
    setSuggestFor(null);
    const rows = (await window.api.listStockItemDepots(stockItem.id)).filter((r) => Number(r.quantity) > 0);
    // Dükkanda stok varsa SORU SORMADAN dükkan seçilir. Dükkanda yoksa,
    // stoğu olan TEK bir başka depo varsa oradan düşülür; birden fazla
    // başka depoda varsa aşağıdaki seçiciden kullanıcı kendisi seçer.
    const shopRow = shopDepotId && rows.find((r) => r.depotId === shopDepotId);
    const resolvedDepotId = shopRow ? shopDepotId : rows.length === 1 ? rows[0].depotId : null;
    setItem(idx, {
      depotOptions: rows,
      depotId: resolvedDepotId,
    });
  }

  // "Genel İndirim Oranı" tüm satırların KENDİ iskonto (%) alanını aynı
  // değere doldurur (QuoteForm.jsx'teki setDiscountRate ile aynı desen) —
  // sonrasında bir satırın iskontosu yine bağımsız olarak değiştirilebilir,
  // bu "ürün bazlı" indirim ihtiyacını da karşılar.
  function setGeneralDiscountRate(value) {
    setGeneralDiscountRateState(value);
    setItems((its) => its.map((it) => ({ ...it, discountRate: value })));
  }

  const validItems = items.filter((it) => it.code.trim() && Number(it.unitPrice) > 0);
  const totals = computeTotals(validItems);

  async function handleComplete() {
    if (validItems.length === 0) {
      setError("En az bir ürün ekleyip fiyat girin.");
      return;
    }
    // Onay akışı kullanıcı isteğiyle birebir: önce stoktan düşülsün mü
    // sorulur; hayır denirse satışın gerçekten olup olmadığı ayrıca
    // sorulur — ikisine de hayır denirse hiçbir şey kaydedilmez.
    const deduct = window.confirm("Ürünler stoktan düşülsün mü?");
    if (deduct) {
      const ambiguous = validItems.find(
        (it) => it.stockItemId && !it.depotId && it.depotOptions && it.depotOptions.length > 1
      );
      if (ambiguous) {
        setError(`"${ambiguous.code}" birden fazla depoda var — hangi depodan düşüleceğini seçin.`);
        return;
      }
    }
    const shouldSave = deduct || window.confirm("Satış gerçekleşti mi?");
    if (!shouldSave) return;

    setSaving(true);
    setError("");
    try {
      await window.api.addSale({
        items: validItems.map((it) => ({
          stockItemId: it.stockItemId,
          depotId: it.depotId,
          code: it.code,
          name: it.description,
          qty: Number(it.qty) || 0,
          unitPrice: Number(it.unitPrice) || 0,
          discountRate: Number(it.discountRate) || 0,
        })),
        generalDiscountRate: Number(generalDiscountRate) || 0,
        subtotal: totals.araToplam,
        vatTotal: totals.kdvToplami,
        total: totals.genelToplam,
        deductedFromStock: deduct,
        actingUserId: currentUser?.id,
      });
      playSaleConfirmSound();
      // Satışlar normalde dükkanda yapılıyor — bir satır dükkan DIŞINDA bir
      // depodan düşüldüyse (dükkanda stoğu yoktu) kullanıcıyı açıkça
      // uyarıyoruz, yanlışlıkla fark edilmeyip dükkandaki rafın boşalmasına
      // rağmen "stok var" sanılmasın.
      if (deduct) {
        const warnings = validItems
          .filter((it) => it.depotId && it.depotId !== shopDepotId)
          .map((it) => `"${it.code}" ürününün stoğu dükkanda yok, ${depotName(it.depotId)} deposundaki stoktan düşüldü.`);
        if (warnings.length > 0) {
          window.alert(warnings.join("\n") + "\n\nKontrol edin.");
        }
      }
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={860}>
      <div className="card">
        <h3>Satış</h3>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.4rem" }}>Ürün (barkod okutun ya da kod/isim yazın)</th>
                <th style={{ padding: "0.4rem", width: 70 }}>Adet</th>
                <th style={{ padding: "0.4rem", width: 110 }}>Birim Fiyat</th>
                <th style={{ padding: "0.4rem", width: 90 }}>İskonto (%)</th>
                <th style={{ padding: "0.4rem", width: 130 }}>Depo</th>
                <th style={{ padding: "0.4rem", width: 110, textAlign: "right" }}>Tutar</th>
                <th style={{ padding: "0.4rem", width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const gross = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
                const lineTotal = gross * (1 - (Number(item.discountRate) || 0) / 100);
                const term = item.code.trim().toLowerCase();
                const matches =
                  suggestFor === idx && term
                    ? stockItems
                        .filter(
                          (s) =>
                            (s.code || "").toLowerCase().includes(term) ||
                            (s.barcode || "").toLowerCase().includes(term) ||
                            (s.name || "").toLowerCase().includes(term)
                        )
                        .slice(0, 8)
                    : [];
                return (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.4rem", position: "relative" }}>
                      <input
                        ref={(el) => (codeInputRefs.current[idx] = el)}
                        value={item.code}
                        onChange={(e) => setItem(idx, { code: e.target.value, stockItemId: null })}
                        onFocus={() => setSuggestFor(idx)}
                        onBlur={() => setTimeout(() => setSuggestFor(null), 150)}
                        placeholder="Barkod / kod / ürün adı"
                        style={{ width: "100%" }}
                        autoFocus={idx === 0}
                      />
                      {item.description && (
                        <small style={{ opacity: 0.7, display: "block" }}>{item.description}</small>
                      )}
                      {matches.length > 0 && (
                        <SuggestionDropdown anchorRef={{ current: codeInputRefs.current[idx] }} minWidth={300}>
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
                              <strong>{s.code}</strong>
                              {s.barcode && (
                                <QrCode
                                  size={13}
                                  strokeWidth={1.75}
                                  title={`Barkod: ${s.barcode}`}
                                  style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                                />
                              )}
                              {" — "}
                              {s.name}
                              <small style={{ opacity: 0.7 }}>
                                {" "}
                                · {s.quantity} {s.unit || "adet"} stokta
                              </small>
                            </button>
                          ))}
                        </SuggestionDropdown>
                      )}
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
                      {!item.stockItemId ? (
                        <small style={{ opacity: 0.5 }}>—</small>
                      ) : !item.depotOptions ? (
                        <small style={{ opacity: 0.5 }}>Yükleniyor…</small>
                      ) : item.depotOptions.length === 0 ? (
                        <small style={{ color: "var(--danger, #e74c3c)" }}>Stokta yok</small>
                      ) : item.depotOptions.length === 1 ? (
                        <small>{depotName(item.depotOptions[0].depotId)}</small>
                      ) : (
                        <select
                          value={item.depotId || ""}
                          onChange={(e) => setItem(idx, { depotId: e.target.value })}
                          style={{ width: "100%" }}
                        >
                          <option value="">Seçin…</option>
                          {item.depotOptions.map((r) => (
                            <option key={r.depotId} value={r.depotId}>
                              {depotName(r.depotId)} ({r.quantity})
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td style={{ padding: "0.4rem", textAlign: "right" }}>{formatMoney(lineTotal)}</td>
                    <td style={{ padding: "0.4rem" }}>
                      {items.length > 1 && (
                        <button
                          type="button"
                          className="icon-btn delete"
                          onClick={() => removeItem(idx)}
                          title="Satırı sil"
                          aria-label="Satırı sil"
                        >
                          <Trash2 size={14} strokeWidth={1.75} />
                        </button>
                      )}
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
            Ürün Ekle
          </button>
        </div>

        <div className="form-row" style={{ marginTop: "0.75rem" }}>
          <label>
            Genel İndirim Oranı (%)
            <input
              type="number"
              min="0"
              max="100"
              value={generalDiscountRate}
              onChange={(e) => setGeneralDiscountRate(e.target.value)}
              style={{ width: 100 }}
              title="Tüm satırların iskonto (%) alanını bu değere doldurur — sonrasında satır bazında ayrıca değiştirilebilir."
            />
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
            <span>KDV Toplamı</span>
            <span>{formatMoney(totals.kdvToplami)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "1.1rem" }}>
            <span>GENEL TOPLAM</span>
            <span>{formatMoney(totals.genelToplam)} ₺</span>
          </div>
        </div>

        {error && <div className="error">{error}</div>}

        <div style={{ marginTop: "1rem", display: "flex", gap: "0.6rem" }}>
          <button type="button" className="primary" onClick={handleComplete} disabled={saving}>
            {saving ? "Kaydediliyor…" : "Satışı Tamamla"}
          </button>
          <button type="button" className="secondary" onClick={onClose}>
            Vazgeç
          </button>
        </div>
      </div>
    </Modal>
  );
}
