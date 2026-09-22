import { Scissors } from "lucide-react";

// Kağıt israfını azaltmak için teknisyen başına ayrı bir A4 yerine, TÜM
// teknisyenler TEK, doğal akışta uzayan bir kutuda art arda basılır —
// aralarına bir kesme çizgisi konur, dispatcher makasla ayırabilir. Kaç
// fiziksel sayfa çıkacağı ve hangi teknisyenlerin aynı sayfayı paylaşacağı
// TAMAMEN içeriğin doğal uzunluğuna göre belirlenir (bkz. .print-stop'taki
// page-break-inside:avoid, .print-header'daki page-break-after:avoid).
//
// ÖNCEDEN teknisyenler ikişerli sabit gruplara ayrılıp HER ÇİFT kendi
// sayfasına ZORLANIYORDU (page-break-before:always) — bir çiftin toplam
// içeriği tam bir sayfaya sığmadığında (ör. üçüncü teknisyenin son bir
// durağı taşınca) o taşan kısım kendi başına neredeyse boş bir sayfada
// yalnız kalıyor, dispatcher'ın gördüğü "fazladan boş sayfa/büyük boşluk"
// sorununun asıl kaynağı buydu. Doğal akışa geçmek bunu tamamen ortadan
// kaldırıyor: içerik her sayfayı olabildiğince doldurur, gereksiz sayfa
// veya boşluk kalmaz.
function TechnicianSection({ route, scheduledDate }) {
  return (
    <div className="print-page-section">
      <div className="print-header">
        <img src="./logo.svg" alt="Sita Yapı" />
        <div>
          <h2>{route.technician.name}</h2>
          <div>{scheduledDate}</div>
        </div>
      </div>
      {route.stops.length === 0 ? (
        <p>Bu teknisyene atanan iş yok.</p>
      ) : (
        route.stops.map((s, idx) => (
          <div className="print-stop" key={s.id}>
            <div className="order">
              {idx + 1}. {s.customerName} {s.urgency === "acil" ? "(ACİL)" : ""}
            </div>
            {s.contactName && <div>Muhatap: {s.contactName}</div>}
            {s.customerPhone && <div>Telefon: {s.customerPhone}</div>}
            <div>{s.address}</div>
            {s.complaint && (
              <div className="print-note">
                <strong>Şikayet / Not:</strong> {s.complaint}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

export default function PrintView({ routes, scheduledDate }) {
  return (
    <div className="print-page landscape">
      {routes.map((route, i) => (
        <div key={route.technician.id}>
          {i > 0 && (
            <div className="print-cut-line">
              <Scissors size={14} strokeWidth={1.75} />
              <span className="print-cut-rule" />
            </div>
          )}
          <TechnicianSection route={route} scheduledDate={scheduledDate} />
        </div>
      ))}
    </div>
  );
}
