// Zimmet listesinin günlük çıktısı — RouteBuilder'ın PrintView.jsx'iyle aynı
// ".print-page" mekanizmasını kullanır (normal ekranda gizli, @media print'te
// görünür olur). Tek sayfa yeterli olduğu için QuotePrintView.jsx'teki gibi
// "sarmalayıcısız tek .print-page" yaklaşımı izlenir.
export default function PartCheckoutsPrintView({ date, groups }) {
  return (
    <div className="print-page">
      <div className="print-header">
        <img src="./logo.svg" alt="Sita Yapı" />
        <div>
          <h2>Parça Zimmeti</h2>
          <div>{date}</div>
        </div>
      </div>
      {groups.length === 0 ? (
        <p>Bu tarih için zimmet yok.</p>
      ) : (
        groups.map(({ technician, rows }) => (
          <div key={technician?.id || "unknown"} style={{ marginBottom: "1.25rem" }}>
            <div style={{ marginBottom: "0.4rem", fontWeight: 700, fontSize: "1.1rem" }}>
              {technician?.name || "Bilinmeyen teknisyen"}
            </div>
            {rows.map(({ checkout, stock }) => (
              <div className="print-stop" key={checkout.id}>
                <div>
                  {stock ? `${stock.code} — ${stock.name}` : "Bilinmeyen ürün"} — {checkout.qtyTaken}{" "}
                  {stock?.unit || "adet"}
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
