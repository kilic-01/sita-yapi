import { computeTotals, formatMoney } from "../lib/orderTotals.js";

// Bu belge (Numbers şablonunun birebir kopyası) BİLEREK uygulamanın kendi
// lacivert/teal temasından bağımsız, nötr gri bir renk paleti kullanır —
// orijinal şablondaki gibi. Renkler orijinal .numbers dosyasının önizleme
// görselinden piksel piksel örneklenerek (RGB tam eşleşme) belirlendi.
export const HEADER_DARKEST = "#3f3f3f"; // ürün tablosu başlığı + GENEL TOPLAM etiket hücresi
export const HEADER_DARK = "#595959"; // bilgi kutusu başlıkları + GENEL TOPLAM tutar hücresi
const LABEL_BG = "#e9e9e9";
const VALUE_BG = "#ffffff"; // bilgi/toplam kutularındaki değer hücreleri — düz beyaz
const ITEM_NO_COL_BG = "#e9e9e9"; // ürün tablosunda "No" sütunu
const ITEM_BODY_BG = "#fafafa"; // ürün tablosunun orta sütunları
const ITEM_LAST_COL_BG = "#f2f2f2"; // "Tutar" sütunu
export const BORDER = "#2d2d2d";

// Gerçek PDF/yazdırma çıktısının kök kutusunda kullanılan stil — popup
// önizlemesi (QuotesPage.jsx) DE bunu birebir kullanmalı. Daha önce popup
// kendi ayrı (elle yazılmış) dolgu/renk değerlerine sahipti; PDF'i
// zamanla ayarladıkça (dolgu, renk, logo vb.) popup'ı unutup güncellemedim
// ve ikisi görsel olarak birbirinden ayrıştı. Artık TEK kaynak burası.
export const PRINT_CONTENT_STYLE = {
  fontFamily: "Inter, -apple-system, sans-serif",
  background: "#ffffff",
  padding: "15mm",
  color: "#1a1a1a",
};

export function formatDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

export const CURRENCY_SYMBOLS = { TRY: "₺", USD: "$", EUR: "€" };

const boxHeader = {
  background: HEADER_DARK,
  color: "white",
  padding: "0.28rem 0.55rem",
  fontWeight: 700,
  fontSize: "0.64rem",
  letterSpacing: "0.02em",
  whiteSpace: "nowrap",
  borderBottom: `1px solid ${BORDER}`,
};
export const boxRow = {
  display: "flex",
  borderBottom: `1px solid ${BORDER}`,
};
export const boxLabel = {
  width: "40%",
  padding: "0.22rem 0.55rem",
  fontWeight: 600,
  background: LABEL_BG,
  borderRight: `1px solid ${BORDER}`,
  whiteSpace: "nowrap",
};
export const boxValue = { flex: 1, padding: "0.22rem 0.55rem", background: VALUE_BG };

export function InfoBox({ title, rows, style }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, overflow: "hidden", fontSize: "0.7rem", ...style }}>
      <div style={boxHeader}>{title}</div>
      {rows.map(([label, value], idx, arr) => (
        <div key={label} style={idx === arr.length - 1 ? { ...boxRow, borderBottom: "none" } : boxRow}>
          <div style={boxLabel}>{label}</div>
          <div style={boxValue}>{value}</div>
        </div>
      ))}
    </div>
  );
}

const cellStyle = { padding: "0.26rem 0.35rem", border: `1px solid ${BORDER}`, background: ITEM_BODY_BG };
const noCellStyle = { ...cellStyle, background: ITEM_NO_COL_BG };
const lastCellStyle = { ...cellStyle, background: ITEM_LAST_COL_BG };
const headCellStyle = { ...cellStyle, whiteSpace: "nowrap", fontSize: "0.66rem" };

export function ItemTable({ items, startIndex }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, overflow: "hidden", marginBottom: "0.75rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.68rem" }}>
        <colgroup>
          <col style={{ width: "4%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "27%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "7%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "8%" }} />
          <col style={{ width: "13%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: HEADER_DARKEST, color: "white" }}>
            <th style={{ ...headCellStyle, textAlign: "left" }}>No</th>
            <th style={{ ...headCellStyle, textAlign: "left" }}>Ürün/Kod</th>
            <th style={{ ...headCellStyle, textAlign: "left" }}>Açıklama</th>
            <th style={{ ...headCellStyle, textAlign: "center" }}>Miktar</th>
            <th style={{ ...headCellStyle, textAlign: "center" }}>Birim</th>
            <th style={{ ...headCellStyle, textAlign: "right" }}>Birim Fiyat</th>
            <th style={{ ...headCellStyle, textAlign: "center" }}>İskonto (%)</th>
            <th style={{ ...headCellStyle, textAlign: "center" }}>KDV (%)</th>
            <th style={{ ...headCellStyle, textAlign: "right" }}>Tutar</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => {
            const gross = (Number(item.qty) || 0) * (Number(item.unitPrice) || 0);
            const lineTotal = gross * (1 - (Number(item.discountRate) || 0) / 100);
            return (
              <tr key={startIndex + i}>
                <td style={noCellStyle}>{startIndex + i + 1}</td>
                <td style={cellStyle}>{item.code}</td>
                <td style={cellStyle}>{item.description}</td>
                <td style={{ ...cellStyle, textAlign: "center" }}>{item.qty}</td>
                <td style={{ ...cellStyle, textAlign: "center" }}>{item.unit}</td>
                <td style={{ ...cellStyle, textAlign: "right" }}>{formatMoney(item.unitPrice)}</td>
                <td style={{ ...cellStyle, textAlign: "center" }}>%{item.discountRate || 0}</td>
                <td style={{ ...cellStyle, textAlign: "center" }}>%{item.vatRate || 0}</td>
                <td style={{ ...lastCellStyle, textAlign: "right" }}>{formatMoney(lineTotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function QuoteHeader({ quote }) {
  return (
    <>
      <div
        className="print-header"
        style={{
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `2px solid ${HEADER_DARK}`,
          paddingBottom: "0.3rem",
          marginBottom: "0.6rem",
        }}
      >
        <img
          src="./logo-print.svg"
          alt="Sita Yapı"
          style={{ width: 245, height: "auto", display: "block", marginLeft: "-4px" }}
        />
        <h2 style={{ fontWeight: 400, color: HEADER_DARK, fontSize: "1.3rem", margin: 0 }}>Fiyat Teklifi</h2>
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "0.7rem" }}>
        <InfoBox
          style={{ flex: 1 }}
          title="MÜŞTERİ BİLGİLERİ"
          rows={[
            ["Firma / Kişi", quote.customerName],
            ["Yetkili", quote.contactName],
            ["Telefon", quote.customerPhone],
            ["E-posta", quote.customerEmail],
            ["Adres", quote.customerAddress],
          ]}
        />
        <InfoBox
          style={{ flex: 1 }}
          title="TEKLİF BİLGİLERİ"
          rows={[
            ["Teklif No", quote.quoteNo],
            ["Tarih", formatDate(quote.quoteDate)],
            ["Geçerlilik", `${quote.validityDays || 0} gün`],
            ["Hazırlayan", quote.preparedBy],
            ["Para Birimi", `${quote.currency} (${CURRENCY_SYMBOLS[quote.currency] || quote.currency})`],
          ]}
        />
      </div>
    </>
  );
}

export function QuoteFooter({ quote, totals }) {
  return (
    <>
      <div style={{ display: "flex", gap: "1rem" }}>
        <InfoBox
          style={{ flex: 1.4, height: "fit-content" }}
          title="TEKLİF ŞARTLARI"
          rows={[
            ["Ödeme", quote.paymentTerms],
            ["Garanti", quote.warranty],
            ["Açıklama", <span style={{ fontStyle: "italic" }}>{quote.notes}</span>],
            ["IBAN", quote.iban],
          ]}
        />
        <div style={{ flex: 1, border: `1px solid ${BORDER}`, overflow: "hidden", fontSize: "0.7rem", height: "fit-content" }}>
          {[
            ["Ara Toplam", formatMoney(totals.araToplam)],
            ["İndirim Oranı", `%${quote.discountRate || 0}`],
            ["İndirim Tutarı", formatMoney(totals.indirimTutari)],
            ["KDV Matrahı", formatMoney(totals.kdvMatrahi)],
            ["KDV Toplamı", formatMoney(totals.kdvToplami)],
          ].map(([label, value]) => (
            <div key={label} style={boxRow}>
              <div style={boxLabel}>{label}</div>
              <div style={{ ...boxValue, textAlign: "right" }}>{value}</div>
            </div>
          ))}
          <div style={{ display: "flex", color: "white", fontWeight: 700, fontSize: "0.76rem" }}>
            <div
              style={{
                width: "40%",
                background: HEADER_DARKEST,
                padding: "0.28rem 0.55rem",
                whiteSpace: "nowrap",
                borderRight: `1px solid ${BORDER}`,
              }}
            >
              GENEL TOPLAM
            </div>
            <div style={{ background: HEADER_DARK, flex: 1, padding: "0.28rem 0.55rem", textAlign: "right" }}>
              {formatMoney(totals.genelToplam)} {quote.currency}
            </div>
          </div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: "0.64rem", opacity: 0.65, marginTop: "1rem", lineHeight: 1.5 }}>
        <div>Zeytinoğlu Cad. Beyaz köşk Apt. No:67 80630 Akatlar - Beşiktaş / İstanbul</div>
        <div>0 (212) 351 76 33 - 0 (212) 351 76 88</div>
        <div>info@sitayapi.com - www.sitayapi.com</div>
      </div>
    </>
  );
}

// Tek, sürekli akan bir sayfa: başlık + tablo + alt bilgi sırayla alt alta
// dizilir, özel bir sayfalama hesabı YAPILMAZ. İçerik kısaysa sayfa kısa
// kalır; içerik bir A4 sayfasını (297mm) aşarsa Chromium'un kendi yazdırma
// motoru taşan kısmı otomatik olarak bir sonraki fiziksel sayfaya keser —
// bu, elle yazılmış yükseklik tahminine dayanan bir sayfalama mantığından
// çok daha güvenilir.
export default function QuotePrintView({ quote }) {
  if (!quote) return null;
  const totals = computeTotals(quote.items || [], quote.discountRate);
  const items = quote.items || [];

  return (
    <div
      className="print-page"
      style={PRINT_CONTENT_STYLE}
    >
      <QuoteHeader quote={quote} />
      <ItemTable items={items} startIndex={0} />
      <QuoteFooter quote={quote} totals={totals} />
    </div>
  );
}
