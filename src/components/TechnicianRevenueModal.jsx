import Modal from "./Modal.jsx";
import { X } from "lucide-react";

// Sabit kategori -> renk eşlemesi (dataviz kılavuzunun doğrulanmış varsayılan
// paletinin ilk 3 dilimi — SADECE 3 kategori olduğu için "tüm çiftler"
// (all-pairs) eşiğini de geçiyor, en güvenli bölge). Aynı kategori HER
// teknisyende AYNI rengi taşır (rastgele/döngüsel atama değil) — böylece
// popup'lar arasında karşılaştırma yapmak kolaylaşır.
const CATEGORY_COLORS_LIGHT = { servis: "#2a78d6", montaj: "#eb6834", parca: "#1baf7a" };
const CATEGORY_COLORS_DARK = { servis: "#3987e5", montaj: "#d95926", parca: "#199e70" };

function formatTL(amount) {
  return `${(Number(amount) || 0).toLocaleString("tr-TR")} TL`;
}

function polarToCartesian(cx, cy, r, angle) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

// Bir dilimin SVG path'i — tek kalem toplamın %100'ü olduğunda (tam daire)
// standart yay formülü bozulduğu için (başlangıç/bitiş noktası çakışıyor)
// bunu ayrıca ele alıyoruz.
function describeSlice(cx, cy, r, startAngle, endAngle, isFullCircle) {
  if (isFullCircle) {
    // İki yarım daire olarak çizilir — SVG'de tek arc komutuyla tam daire
    // çizilemiyor (başlangıç noktası bitiş noktasıyla çakışır).
    const mid = startAngle + Math.PI;
    const p1 = polarToCartesian(cx, cy, r, startAngle);
    const p2 = polarToCartesian(cx, cy, r, mid);
    return `M ${p1.x} ${p1.y} A ${r} ${r} 0 1 1 ${p2.x} ${p2.y} A ${r} ${r} 0 1 1 ${p1.x} ${p1.y} Z`;
  }
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

export default function TechnicianRevenueModal({ row, onClose, isDark }) {
  if (!row) return null;
  const colors = isDark ? CATEGORY_COLORS_DARK : CATEGORY_COLORS_LIGHT;

  // row.breakdown HER ZAMAN üç kategoriyi (servis/montaj/parça) sabit
  // sırada içerir (bkz. HistoryPage.jsx itemBreakdown) — hiç kazanç yoksa
  // 0 TL olarak gelir, filtrelenmez; sadece pasta grafiğinde 0'lık dilimler
  // (görünmez olacakları için) çizimden çıkarılır.
  const all = row.breakdown || [];
  const total = all.reduce((sum, b) => sum + b.amount, 0);
  const nonZero = all.filter((b) => b.amount > 0);

  const size = 220;
  const r = size / 2 - 4;
  const cx = size / 2;
  const cy = size / 2;
  let angle = -Math.PI / 2;
  const paths = nonZero.map((b) => {
    const fraction = total > 0 ? b.amount / total : 0;
    const startAngle = angle;
    const endAngle = angle + fraction * 2 * Math.PI;
    angle = endAngle;
    return {
      ...b,
      fraction,
      color: colors[b.category],
      d: describeSlice(cx, cy, r, startAngle, endAngle, fraction >= 0.9999),
    };
  });

  return (
    <Modal onClose={onClose} maxWidth={620}>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.75rem 1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <strong style={{ flex: 1 }}>{row.technician.name} — Ciro Detayı</strong>
          <button type="button" className="icon-btn" title="Kapat" aria-label="Kapat" onClick={onClose}>
            <X size={15} strokeWidth={1.75} />
          </button>
        </div>

        <div style={{ padding: "1rem" }}>
          <div className="form-row" style={{ marginBottom: "1rem" }}>
            {[
              ["Bugün", row.daily],
              ["Bu Hafta", row.weekly],
              ["Bu Ay", row.monthly],
              ["Toplam", row.total],
            ].map(([label, value]) => (
              <div key={label} style={{ flex: 1 }}>
                <small style={{ opacity: 0.7 }}>{label}</small>
                <div style={{ fontWeight: 700 }}>{formatTL(value)}</div>
              </div>
            ))}
          </div>

          {total === 0 ? (
            <p>Bu teknisyene ait kalem bazlı ücret kaydı yok.</p>
          ) : (
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap" }}>
              <svg width={size} height={size} role="img" aria-label="Servis/Montaj/Ürün Satışı dağılımı">
                {paths.map((s) => (
                  <path key={s.category} d={s.d} fill={s.color} stroke="var(--card-bg)" strokeWidth={2}>
                    <title>
                      {s.label}: {formatTL(s.amount)} (%{(s.fraction * 100).toFixed(1)})
                    </title>
                  </path>
                ))}
              </svg>
              <div style={{ flex: 1, minWidth: 200 }}>
                {all.map((b) => (
                  <div
                    key={b.category}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.3rem 0",
                      fontSize: "0.85rem",
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: colors[b.category],
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>{b.label}</span>
                    <strong>{formatTL(b.amount)}</strong>
                    <span style={{ opacity: 0.7, width: 46, textAlign: "right" }}>
                      %{total > 0 ? ((b.amount / total) * 100).toFixed(1) : "0.0"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
