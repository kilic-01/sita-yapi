import { useMemo } from "react";
import { Fuel } from "lucide-react";
import CollapsibleCard from "./CollapsibleCard.jsx";
import FuelConsumptionChart from "./FuelConsumptionChart.jsx";
import FuelSyncSection from "./FuelSyncSection.jsx";

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// Filotim'den gelen plaka ile araç kayıtlarındaki plaka elle girildiği için
// (boşluk/büyük-küçük harf farkı olabilir) karşılaştırmadan önce normalize
// edilir — aksi halde biçim uyuşmazlığında eşleşme sessizce sıfır çıkardı.
function normalizePlate(plate) {
  return (plate || "").replace(/\s+/g, "").toUpperCase();
}

// "Diğer" sekmesindeki Yakıt Takibi bölümü — eskiden Geçmiş (grafik+tablo)
// ve Ayarlar (senkronizasyon) sekmelerine dağılmıştı, tek yerde toplandı.
export default function FuelPage({
  technicians = [],
  vehicles = [],
  fuelTransactions = [],
  fuelDevices = [],
  settings,
  currentUser,
  onFuelSynced,
  onFuelDevicesSynced,
}) {
  const isAdmin = currentUser?.role === "admin";

  const fuelCost = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(today);
    const monthStart = startOfMonth(today);

    function txDate(t) {
      const d = new Date(t.processDate);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    const sumTL = (list) => list.reduce((total, t) => total + (Number(t.amount) || 0), 0);
    const sumLiter = (list) => list.reduce((total, t) => total + (Number(t.liter) || 0), 0);

    const technicianByPlate = new Map();
    for (const t of technicians) {
      if (!t.vehicleId) continue;
      const plate = normalizePlate(vehicles.find((v) => v.id === t.vehicleId)?.plate);
      if (plate) technicianByPlate.set(plate, t);
    }

    // Kaynak HAM Filotim işlem geçmişi değil, GÜNCEL "vehicles" tablosu —
    // satılan/elden çıkarılan bir aracın plakası Ayarlar > Araçlar'dan
    // silindiğinde bu raporda da otomatik kaybolsun diye.
    return vehicles
      .map((v) => {
        const plate = normalizePlate(v.plate);
        const txs = plate ? fuelTransactions.filter((tx) => normalizePlate(tx.plate) === plate) : [];
        const technician = technicianByPlate.get(plate) || null;
        return {
          key: v.id,
          label: technician ? technician.name : `${v.plate} (atanmamış)`,
          daily: sumTL(txs.filter((tx) => txDate(tx).getTime() === today.getTime())),
          weekly: sumTL(txs.filter((tx) => txDate(tx) >= weekStart)),
          monthly: sumTL(txs.filter((tx) => txDate(tx) >= monthStart)),
          total: sumTL(txs),
          totalLiter: sumLiter(txs),
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "tr"));
  }, [technicians, vehicles, fuelTransactions]);

  function formatTL(amount) {
    return `${amount.toLocaleString("tr-TR")} TL`;
  }

  return (
    <div>
      <CollapsibleCard title="Yakıt Takibi" icon={<Fuel size={18} strokeWidth={1.75} />} defaultOpen>
        <div>
          <h4 style={{ marginBottom: "0.5rem" }}>Aylık Yakıt Tüketimi</h4>
          <FuelConsumptionChart fuelTransactions={fuelTransactions} />
        </div>

        <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
          <h4 style={{ marginBottom: "0.5rem" }}>Araç Bazlı Yakıt Gideri</h4>
          {fuelCost.length === 0 ? (
            <p>Henüz senkronize edilmiş bir yakıt işlemi yok.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead>
                  <tr>
                    <th>Teknisyen / Plaka</th>
                    <th>Bugün</th>
                    <th>Bu Hafta</th>
                    <th>Bu Ay</th>
                    <th>Toplam</th>
                    <th>Toplam Litre</th>
                  </tr>
                </thead>
                <tbody>
                  {fuelCost.map((row) => (
                    <tr key={row.key}>
                      <td>{row.label}</td>
                      <td>{formatTL(row.daily)}</td>
                      <td>{formatTL(row.weekly)}</td>
                      <td>{formatTL(row.monthly)}</td>
                      <td>{formatTL(row.total)}</td>
                      <td>{row.totalLiter.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} L</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {isAdmin && settings && (
          <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border)" }}>
            <h4 style={{ marginBottom: "0.5rem" }}>Senkronizasyon ve Hesap Durumu</h4>
            <FuelSyncSection
              settings={settings}
              fuelTransactions={fuelTransactions}
              fuelDevices={fuelDevices}
              currentUser={currentUser}
              onSynced={onFuelSynced}
              onDevicesSynced={onFuelDevicesSynced}
            />
          </div>
        )}
      </CollapsibleCard>
    </div>
  );
}
