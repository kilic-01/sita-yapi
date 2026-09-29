import { colorForTechnician } from "../lib/techColors.js";

// Önceki tasarım: her teknisyen kendi "kartını" alıyordu (ad/telefon/adres/not
// alt alta), aralarına makasla kesilebilecek bir çizgi konuyordu. Günlük iş
// sayısı arttıkça bu, birden çok fiziksel sayfaya taşıyordu. Yeni tasarım:
// TÜM teknisyenlerin TÜM durakları tek, yoğun bir Excel-tablosu gibi tek
// sayfaya sığdırılıyor — her durak artık çok satırlı bir "kart" değil, TEK
// satır. Teknisyenler arası ayrım hâlâ korunuyor (kalın kesik çizgi +
// teknisyenin kendi rengi), dispatcher isterse yine o çizgiden kesip
// ayırabilir, sadece artık aynı kağıt üzerinde çok daha az yer kaplıyor.
export default function PrintView({ routes, scheduledDate }) {
  return (
    <div className="print-page landscape">
      <div className="print-header">
        <img src="./logo.svg" alt="Sita Yapı" />
        <div>
          <h2>Günlük Rota</h2>
          <div>{scheduledDate}</div>
        </div>
      </div>
      <table className="print-route-table">
        <thead>
          <tr>
            <th className="col-tech">Teknisyen</th>
            <th className="col-order">#</th>
            <th className="col-customer">Müşteri</th>
            <th className="col-phone">Telefon</th>
            <th className="col-address">Adres</th>
            <th className="col-note">Şikayet / Not</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((route, routeIdx) => {
            const color = colorForTechnician(route.technician.id, routes.map((r) => r.technician));
            const isLastGroup = routeIdx === routes.length - 1;
            const rowCount = Math.max(route.stops.length, 1);
            const techCell = (
              <td className="col-tech" style={{ borderLeftColor: color }}>
                {route.technician.name}
              </td>
            );
            return route.stops.length === 0 ? (
              <tr key={route.technician.id} className={isLastGroup ? undefined : "group-end"}>
                {techCell}
                <td colSpan={5} className="empty-row">
                  Bu teknisyene atanan iş yok.
                </td>
              </tr>
            ) : (
              route.stops.map((s, idx) => (
                <tr
                  key={s.id}
                  className={[
                    s.urgency === "acil" ? "urgent-row" : "",
                    !isLastGroup && idx === rowCount - 1 ? "group-end" : "",
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined}
                >
                  <td className="col-tech" style={{ borderLeftColor: color }}>
                    {route.technician.name}
                  </td>
                  <td className="col-order">{idx + 1}</td>
                  <td className="col-customer">
                    {s.customerName}
                    {s.urgency === "acil" && <span className="urgent-tag"> ACİL</span>}
                  </td>
                  <td className="col-phone">{s.customerPhone}</td>
                  <td className="col-address">{s.address}</td>
                  <td className="col-note">{s.complaint}</td>
                </tr>
              ))
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
