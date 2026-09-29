import { formatDateTR, daysSince, daysBetween, todayISO } from "../lib/format.js";

// PartCheckoutsPrintView.jsx ile aynı desen: liste birden fazla fiziksel
// sayfaya taşabildiği için başlık her sayfada tekrarlansın diye tüm içerik
// tek sütunlu bir tabloya sarmalanıyor (başlık <thead>'de, gövde <tbody>'de).
export default function PendingPartsPrintView({ title, rows, mode }) {
  return (
    <div className="print-page paginated">
      <table className="checkout-print-page-table">
        <thead>
          <tr>
            <td>
              <div className="print-header">
                <img src="./logo.svg" alt="Sita Yapı" />
                <div>
                  <h2>{title}</h2>
                  <div>{formatDateTR(todayISO())}</div>
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {rows.length === 0 ? (
                <p>Kayıt yok.</p>
              ) : (
                rows.map((p) => {
                  const orderedDate = (p.orderedAt || p.createdAt || "").slice(0, 10);
                  const since = daysSince(orderedDate);
                  const waitedDays = daysBetween(p.orderedAt, p.arrivedAt);
                  return (
                    <div className="pendingpart-print-row" key={p.id}>
                      <div className="pendingpart-print-name">
                        {p.customerName}
                        {p.customerPhone ? ` — ${p.customerPhone}` : ""}
                      </div>
                      <div className="pendingpart-print-desc">{p.description}</div>
                      <div className="pendingpart-print-meta">
                        {p.vitraReceiptNo && `Vitra Fiş No: ${p.vitraReceiptNo}  ·  `}
                        {mode === "waiting"
                          ? `Sipariş: ${formatDateTR(orderedDate)}  ·  ${since === 0 ? "bugün sipariş edildi" : `${since} gündür bekliyor`}`
                          : `Sipariş: ${formatDateTR(orderedDate)}  ·  Geldi: ${formatDateTR(p.arrivedAt)}${
                              waitedDays != null ? `  ·  ${waitedDays} gün bekledi` : ""
                            }`}
                      </div>
                    </div>
                  );
                })
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
