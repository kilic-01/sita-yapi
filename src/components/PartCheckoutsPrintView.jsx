import { formatDateTR } from "../lib/format.js";

// Bir zimmet satırının kullanılan/iade/arabada dökümünü tek bir metne
// çevirir — mutabakatı henüz yapılmamış (status: "outstanding") kayıtlarda
// bu alanlar hâlâ null olduğu için hiçbiri gösterilmez, sadece "Mutabakat
// bekleniyor" notu çıkar.
function reconcileSummary(checkout, appointment) {
  if (checkout.status !== "reconciled") return "Mutabakat bekleniyor";
  const parts = [];
  if (checkout.qtyUsed > 0) {
    parts.push(appointment ? `Kullanıldı: (${appointment.customerName})` : `Kullanıldı: ${checkout.qtyUsed}`);
  }
  if (checkout.qtyReturned > 0) parts.push(`İade: ${checkout.qtyReturned}`);
  if (checkout.qtyStoredInVehicle > 0) parts.push(`Arabada: ${checkout.qtyStoredInVehicle}`);
  return parts.length > 0 ? parts.join("  ·  ") : null;
}

// Zimmet listesinin günlük çıktısı — her teknisyenin kendi bölümü olduğu düz
// bir liste. Liste birden fazla fiziksel sayfaya taşarsa logo/başlık/tarih
// HER sayfada tekrarlansın diye tüm içerik tek sütunlu bir tabloya
// sarmalanıyor: başlık <thead>'de, gövde <tbody>'de — tarayıcının "thead her
// sayfada tekrar eder ve içerik altına doğru boşluk bırakır" native
// davranışı (RouteBuilder'ın PrintView.jsx'indeki rota tablosuyla aynı
// mekanizma) burada da kullanılıyor. Denenen "position: fixed" damga yöntemi
// sadece ilk sayfada doğru boşluk bırakıyordu, 2. sayfadan itibaren içerik
// başlığın altına gizleniyordu — bu yüzden tablo sarmalayıcısına geçildi
// (gerçek PDF üretilip PyMuPDF ile doğrulandı).
export default function PartCheckoutsPrintView({ date, groups }) {
  return (
    <div className="print-page paginated">
      <table className="checkout-print-page-table">
        <thead>
          <tr>
            <td>
              <div className="print-header">
                <img src="./logo.svg" alt="Sita Yapı" />
                <div>
                  <h2>Parça Zimmeti</h2>
                  <div>{formatDateTR(date)}</div>
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {groups.length === 0 ? (
                <p>Bu tarih için zimmet yok.</p>
              ) : (
                groups.map(({ technician, rows }) => (
                  <div className="checkout-print-group" key={technician?.id || "unknown"}>
                    <div className="checkout-print-tech">
                      <span>{technician?.name || "Bilinmeyen teknisyen"}</span>
                      <span className="checkout-print-tech-count">{rows.length} kalem</span>
                    </div>
                    {rows.map(({ checkout, stock, appointment }) => {
                      const summary = reconcileSummary(checkout, appointment);
                      const isPending = checkout.status !== "reconciled";
                      return (
                        <div className="checkout-print-item" key={checkout.id}>
                          <div className="checkout-print-item-main">
                            <span className="checkout-print-item-qty">
                              {checkout.qtyTaken} {stock?.unit || "adet"}
                            </span>
                            <span className="checkout-print-item-name">
                              {stock ? `${stock.code} — ${stock.name}` : "Bilinmeyen ürün"}
                            </span>
                          </div>
                          {summary && (
                            <div className={`checkout-print-item-summary${isPending ? " pending" : ""}`}>
                              {summary}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
