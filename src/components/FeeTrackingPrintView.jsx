import { formatDateTR } from "../lib/format.js";
import { CATEGORIES, categoryLabel, donutSlicePath, formatMoney, monthLabel } from "./FeeTrackingPage.jsx";

// Ekrandaki DonutChart ile aynı dilim geometrisi (donutSlicePath), ama
// hover durumu olmayan sabit bir sürüm — kağıtta etkileşim yok, ve delik
// rengi tema değişkeni (var(--card-bg)) yerine SABİT beyaz olmalı: sayfa
// karanlık modda açık olsa bile çıktı hep beyaz kağıt üzerine basılıyor
// (bkz. styles.css .print-page notu).
function PrintDonutChart({ byCategory, total }) {
  let cumulative = 0;
  const slices = CATEGORIES.map((c) => {
    const value = byCategory[c.id] || 0;
    const pct = total > 0 ? (value / total) * 100 : 0;
    const startAngle = (cumulative / 100) * 360;
    cumulative += pct;
    const endAngle = (cumulative / 100) * 360;
    return { ...c, value, pct, startAngle, endAngle };
  });

  return (
    <div className="fee-print-donut">
      <svg viewBox="0 0 100 100">
        {total > 0 ? (
          slices
            .filter((s) => s.pct > 0)
            .map((s) => (
              <path
                key={s.id}
                d={donutSlicePath(50, 50, 48, 29, s.startAngle, s.endAngle)}
                fill={s.color}
                stroke="#fff"
                strokeWidth="1"
              />
            ))
        ) : (
          <circle cx="50" cy="50" r="48" fill="#ddd" />
        )}
        {total > 0 && <circle cx="50" cy="50" r="29" fill="#fff" />}
      </svg>
      <div className="fee-print-donut-center">
        <span>TOPLAM</span>
        <strong>{formatMoney(total)}</strong>
      </div>
    </div>
  );
}

// PartCheckoutsPrintView.jsx / PendingPartsPrintView.jsx ile aynı desen:
// liste birden fazla fiziksel sayfaya taşabildiği için başlık her sayfada
// tekrarlansın diye tüm içerik tek sütunlu bir tabloya sarmalanıyor
// (başlık <thead>'de, gövde <tbody>'de). Sadece seçili ay (grafik + kayıt
// listesi) detaylı çıkar; diğer aylar ekrandaki "Önceki Aylar" bloğu gibi
// tek satırda ay adı + toplam olarak listelenir.
export default function FeeTrackingPrintView({ monthKey, summary, entries, otherMonths }) {
  return (
    <div className="print-page paginated">
      <table className="checkout-print-page-table">
        <thead>
          <tr>
            <td>
              <div className="print-header">
                <img src="./logo.svg" alt="Sita Yapı" />
                <div>
                  <h2>Ücret Takip</h2>
                  <div>{monthLabel(monthKey)}</div>
                </div>
              </div>
            </td>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div className="fee-print-summary">
                <PrintDonutChart byCategory={summary.byCategory} total={summary.total} />
                <div className="fee-print-summary-legend">
                  {CATEGORIES.map((c) => {
                    const value = summary.byCategory[c.id] || 0;
                    const pct = summary.total > 0 ? (value / summary.total) * 100 : 0;
                    return (
                      <div className="fee-print-summary-row" key={c.id}>
                        <span className="fee-print-swatch" style={{ background: c.color }} />
                        <span className="fee-print-summary-label">{c.label}</span>
                        <span className="fee-print-summary-pct">
                          %{pct.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                        </span>
                        <strong>{formatMoney(value)}</strong>
                      </div>
                    );
                  })}
                  <div className="fee-print-summary-row total">
                    <span className="fee-print-summary-label">Toplam</span>
                    <strong>{formatMoney(summary.total)}</strong>
                  </div>
                </div>
              </div>

              {entries.length === 0 ? (
                <p>Bu ayda kayıt yok.</p>
              ) : (
                entries.map((entry) => (
                  <div className="fee-print-row" key={entry.id}>
                    <div className="fee-print-row-main">
                      <strong>{categoryLabel(entry.category)}</strong>
                      <span>{formatDateTR(entry.date)}</span>
                      {entry.description && <span>{entry.description}</span>}
                      <span className="fee-print-row-total">{formatMoney(entry.totalAmount)}</span>
                    </div>
                  </div>
                ))
              )}

              {otherMonths.length > 0 && (
                <div className="fee-print-other-months">
                  <h3>Diğer Aylar</h3>
                  {otherMonths.map((m) => (
                    <div className="fee-print-other-month-row" key={m.key}>
                      <span>{monthLabel(m.key)}</span>
                      <strong>{formatMoney(m.total)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
