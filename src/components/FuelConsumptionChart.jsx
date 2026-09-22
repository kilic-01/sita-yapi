import { useMemo, useState } from "react";

// Filotim'in kendi "Aylık Litre Tüketimi" grafiğiyle aynı fikir (bir zaman
// çizgisi) ama üç ek seçenekle: periyot (haftalık/aylık/yıllık), araç
// seçimi (tek tek bir araca odaklanma ya da hepsini karşılaştırma) ve ölçü
// (Litre/TL). "Karşılaştır" modunda her plaka kendi renginde ayrı bir
// çizgi olarak AYNI grafik üzerinde — kim daha çok/az harcamış tek bakışta
// görülebiliyor (legend toplam tutara göre büyükten küçüğe sıralı).
const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#16a34a",
  "#d97706",
  "#9333ea",
  "#0891b2",
  "#db2777",
  "#65a30d",
  "#ea580c",
  "#4f46e5",
  "#0d9488",
  "#b91c1c",
];

function startOfWeekDate(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day; // Pazartesi başlangıçlı
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function bucketKey(dateStr, granularity) {
  const d = new Date(dateStr);
  if (granularity === "yearly") return `${d.getFullYear()}`;
  if (granularity === "weekly") return startOfWeekDate(d).toISOString().slice(0, 10);
  return `${d.getFullYear()}/${d.getMonth() + 1}`;
}

function bucketSortValue(key, granularity) {
  if (granularity === "yearly") return Number(key);
  if (granularity === "weekly") return new Date(key).getTime();
  const [y, m] = key.split("/").map(Number);
  return y * 12 + m;
}

function nextBucketKey(key, granularity) {
  if (granularity === "yearly") return String(Number(key) + 1);
  if (granularity === "weekly") {
    const d = new Date(key);
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }
  const [y, m] = key.split("/").map(Number);
  const v = y * 12 + (m - 1) + 1;
  return `${Math.floor(v / 12)}/${(v % 12) + 1}`;
}

function bucketLabel(key, granularity) {
  if (granularity === "weekly") {
    return new Date(key).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  }
  return key;
}

const GRANULARITY_OPTIONS = [
  { value: "weekly", label: "Haftalık" },
  { value: "monthly", label: "Aylık" },
  { value: "yearly", label: "Yıllık" },
];

export default function FuelConsumptionChart({ fuelTransactions = [] }) {
  const [granularity, setGranularity] = useState("monthly");
  const [vehicleSelection, setVehicleSelection] = useState("compare"); // "total" | "compare" | <plaka>
  const [metric, setMetric] = useState("liter"); // "liter" | "amount"

  const { buckets, byPlateBucket, totalByBucket, plateTotals } = useMemo(() => {
    const bucketSet = new Set();
    const byPlateBucketMap = new Map(); // plate -> Map(bucket -> {liter, amount})
    const totalByBucketMap = new Map();
    const plateTotalsMap = new Map(); // plate -> {liter, amount}

    for (const t of fuelTransactions) {
      if (!t.processDate) continue;
      const key = bucketKey(t.processDate, granularity);
      bucketSet.add(key);
      const plate = t.plate || "Bilinmeyen";
      const liter = Number(t.liter) || 0;
      const amount = Number(t.amount) || 0;

      if (!byPlateBucketMap.has(plate)) byPlateBucketMap.set(plate, new Map());
      const pm = byPlateBucketMap.get(plate);
      const cur = pm.get(key) || { liter: 0, amount: 0 };
      cur.liter += liter;
      cur.amount += amount;
      pm.set(key, cur);

      const tot = totalByBucketMap.get(key) || { liter: 0, amount: 0 };
      tot.liter += liter;
      tot.amount += amount;
      totalByBucketMap.set(key, tot);

      const pt = plateTotalsMap.get(plate) || { liter: 0, amount: 0 };
      pt.liter += liter;
      pt.amount += amount;
      plateTotalsMap.set(plate, pt);
    }

    const sortedKeys = [...bucketSet].sort((a, b) => bucketSortValue(a, granularity) - bucketSortValue(b, granularity));
    const fullBuckets = [];
    if (sortedKeys.length) {
      let cur = sortedKeys[0];
      const endVal = bucketSortValue(sortedKeys[sortedKeys.length - 1], granularity);
      while (bucketSortValue(cur, granularity) <= endVal) {
        fullBuckets.push(cur);
        cur = nextBucketKey(cur, granularity);
      }
    }

    return {
      buckets: fullBuckets,
      byPlateBucket: byPlateBucketMap,
      totalByBucket: totalByBucketMap,
      plateTotals: plateTotalsMap,
    };
  }, [fuelTransactions, granularity]);

  // Dropdown'da ve "Karşılaştır" modunun çizim/legend sırasında en çok
  // harcayan en üstte olsun diye toplam tutara göre büyükten küçüğe sıralı.
  const plates = useMemo(
    () => [...plateTotals.keys()].sort((a, b) => plateTotals.get(b)[metric] - plateTotals.get(a)[metric]),
    [plateTotals, metric]
  );

  if (buckets.length === 0) {
    return <p>Henüz grafik için yeterli veri yok.</p>;
  }

  const series =
    vehicleSelection === "total"
      ? [{ key: "total", label: "Toplam", color: "#64748b", values: buckets.map((b) => totalByBucket.get(b)?.[metric] || 0) }]
      : vehicleSelection === "compare"
      ? plates.map((plate, i) => ({
          key: plate,
          label: plate,
          color: PALETTE[i % PALETTE.length],
          values: buckets.map((b) => byPlateBucket.get(plate)?.get(b)?.[metric] || 0),
        }))
      : [
          {
            key: vehicleSelection,
            label: vehicleSelection,
            color: PALETTE[0],
            values: buckets.map((b) => byPlateBucket.get(vehicleSelection)?.get(b)?.[metric] || 0),
          },
        ];

  const maxValue = Math.max(1, ...series.flatMap((s) => s.values));
  const unit = metric === "liter" ? "L" : "TL";

  const width = 900;
  const height = 320;
  const marginLeft = 60;
  const marginRight = 10;
  const marginTop = 10;
  const marginBottom = 60;
  const plotWidth = width - marginLeft - marginRight;
  const plotHeight = height - marginTop - marginBottom;

  function xFor(i) {
    return marginLeft + (buckets.length === 1 ? plotWidth / 2 : (i / (buckets.length - 1)) * plotWidth);
  }
  function yFor(v) {
    return marginTop + plotHeight - (v / maxValue) * plotHeight;
  }

  // Çok fazla nokta varsa (uzun geçmiş, özellikle haftalık) her etiketi
  // göstermek karışıklık yaratıyor — belli bir aralıkla atlanır.
  const labelStep = Math.max(1, Math.ceil(buckets.length / 18));
  const gridLines = 4;

  return (
    <div>
      <div className="form-row" style={{ marginBottom: "0.5rem" }}>
        <label style={{ maxWidth: 240 }}>
          Araç
          <select value={vehicleSelection} onChange={(e) => setVehicleSelection(e.target.value)}>
            <option value="compare">Tüm Araçlar (Karşılaştır)</option>
            <option value="total">Tüm Araçlar (Toplam)</option>
            {plates.map((plate) => (
              <option key={plate} value={plate}>
                {plate}
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 160 }}>
          Periyot
          <select value={granularity} onChange={(e) => setGranularity(e.target.value)}>
            {GRANULARITY_OPTIONS.map((g) => (
              <option key={g.value} value={g.value}>
                {g.label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ maxWidth: 160 }}>
          Ölçü
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="liter">Litre</option>
            <option value="amount">TL</option>
          </select>
        </label>
      </div>

      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", minWidth: 700, height: "auto" }}>
          {[...Array(gridLines + 1)].map((_, i) => {
            const v = (maxValue / gridLines) * i;
            const y = yFor(v);
            return (
              <g key={i}>
                <line x1={marginLeft} y1={y} x2={width - marginRight} y2={y} stroke="var(--border)" strokeWidth={1} />
                <text x={marginLeft - 8} y={y + 4} fontSize={11} textAnchor="end" fill="var(--text-muted, currentColor)">
                  {Math.round(v).toLocaleString("tr-TR")}
                </text>
              </g>
            );
          })}

          {buckets.map((b, i) =>
            i % labelStep === 0 ? (
              <text
                key={b}
                x={xFor(i)}
                y={height - marginBottom + 16}
                fontSize={10}
                textAnchor="end"
                fill="var(--text-muted, currentColor)"
                transform={`rotate(-45 ${xFor(i)} ${height - marginBottom + 16})`}
              >
                {bucketLabel(b, granularity)}
              </text>
            ) : null
          )}

          {series.map((s) => (
            <polyline
              key={s.key}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              points={s.values.map((v, i) => `${xFor(i)},${yFor(v)}`).join(" ")}
            />
          ))}
        </svg>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.6rem 1.2rem", marginTop: "0.5rem" }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
            <span style={{ width: 12, height: 12, borderRadius: "50%", background: s.color, display: "inline-block" }} />
            <strong>{s.label}</strong>
            <span style={{ opacity: 0.75 }}>
              {vehicleSelection === "total"
                ? Math.round(s.values.reduce((a, b) => a + b, 0)).toLocaleString("tr-TR")
                : Math.round(plateTotals.get(s.key)?.[metric] || 0).toLocaleString("tr-TR")}{" "}
              {unit}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
