import {
  PRINT_CONTENT_STYLE,
  InfoBox,
  HEADER_DARK,
  HEADER_DARKEST,
  BORDER,
  formatDate,
} from "./QuotePrintView.jsx";

export function OrderHeader({ order }) {
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
        <h2 style={{ fontWeight: 400, color: HEADER_DARK, fontSize: "1.3rem", margin: 0 }}>Sipariş Formu</h2>
      </div>

      <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "0.7rem" }}>
        <InfoBox
          style={{ flex: 1 }}
          title="FİRMA BİLGİLERİ"
          rows={[
            ["Firma / Kişi", order.customerName],
            ["Yetkili", order.contactName],
            ["Telefon", order.customerPhone],
            ["E-posta", order.customerEmail],
            ["Adres", order.customerAddress],
          ]}
        />
        <InfoBox
          style={{ flex: 1 }}
          title="SİPARİŞ BİLGİLERİ"
          rows={[
            ["Sipariş No", order.orderNo],
            ["Tarih", formatDate(order.orderDate)],
          ]}
        />
      </div>
    </>
  );
}

// Fiyat teklifindeki ItemTable'ın fiyatsız hali — bu belge (Sipariş Formu)
// müşteriye/kuryeye gösterilebileceği için fiyat, iskonto, KDV ve tutar
// bilgisi KESİNLİKLE gösterilmez, sadece "ne, ne kadar" bilgisi kalır.
const ITEM_NO_COL_BG = "#e9e9e9";
const ITEM_BODY_BG = "#fafafa";
const cellStyle = { padding: "0.3rem 0.4rem", border: `1px solid ${BORDER}`, background: ITEM_BODY_BG };
const noCellStyle = { ...cellStyle, background: ITEM_NO_COL_BG };
const headCellStyle = { ...cellStyle, whiteSpace: "nowrap", fontSize: "0.68rem" };

function NoPriceItemTable({ items }) {
  return (
    <div style={{ border: `1px solid ${BORDER}`, overflow: "hidden", marginBottom: "0.75rem" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
        <colgroup>
          <col style={{ width: "6%" }} />
          <col style={{ width: "18%" }} />
          <col style={{ width: "56%" }} />
          <col style={{ width: "10%" }} />
          <col style={{ width: "10%" }} />
        </colgroup>
        <thead>
          <tr style={{ background: HEADER_DARKEST, color: "white" }}>
            <th style={{ ...headCellStyle, textAlign: "left" }}>No</th>
            <th style={{ ...headCellStyle, textAlign: "left" }}>Ürün/Kod</th>
            <th style={{ ...headCellStyle, textAlign: "left" }}>Açıklama</th>
            <th style={{ ...headCellStyle, textAlign: "center" }}>Miktar</th>
            <th style={{ ...headCellStyle, textAlign: "center" }}>Birim</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={noCellStyle}>{i + 1}</td>
              <td style={cellStyle}>{item.code}</td>
              <td style={cellStyle}>{item.description}</td>
              <td style={{ ...cellStyle, textAlign: "center" }}>{item.qty}</td>
              <td style={{ ...cellStyle, textAlign: "center" }}>{item.unit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrderFooter({ order }) {
  return (
    <>
      <InfoBox
        title="TESLİMAT / NOT"
        rows={[
          ["Teslimat Notu", order.deliveryNote],
          ["Açıklama", <span style={{ fontStyle: "italic" }}>{order.notes}</span>],
        ]}
      />

      <div style={{ textAlign: "center", fontSize: "0.64rem", opacity: 0.65, marginTop: "1rem", lineHeight: 1.5 }}>
        <div>Zeytinoğlu Cad. Beyaz köşk Apt. No:67 80630 Akatlar - Beşiktaş / İstanbul</div>
        <div>0 (212) 351 76 33 - 0 (212) 351 76 88</div>
        <div>info@sitayapi.com - www.sitayapi.com</div>
      </div>
    </>
  );
}

// Tek, sürekli akan bir sayfa — QuotePrintView.jsx'teki aynı desen (bkz.
// oradaki yorum: sayfalama Chromium'un kendi yazdırma motoruna bırakılır).
export default function IncomingOrderPrintView({ order }) {
  if (!order) return null;
  const items = order.items || [];

  return (
    <div className="print-page" style={PRINT_CONTENT_STYLE}>
      <OrderHeader order={order} />
      <NoPriceItemTable items={items} />
      <OrderFooter order={order} />
    </div>
  );
}
