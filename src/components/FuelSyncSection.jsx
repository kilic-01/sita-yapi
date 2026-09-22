import { useState } from "react";
import { formatDateTime } from "../lib/format.js";

function formatTL(n) {
  return `${Number(n || 0).toLocaleString("tr-TR")} TL`;
}

// Filotim (akaryakıt kartı) API'sinden işlem geçmişini, araç/kart limit
// durumunu ve filo hesap özetini çekip senkronize eder — uygulama her
// açıldığında günde bir kez otomatik de çalışıyor (bkz. electron/main.js),
// bu buton sadece dispatcher hemen tazelemek istediğinde.
export default function FuelSyncSection({
  settings,
  fuelTransactions = [],
  fuelDevices = [],
  currentUser,
  onSynced,
  onDevicesSynced,
}) {
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  async function handleSync() {
    setSyncing(true);
    setError("");
    try {
      await window.api.syncFuelTransactions(currentUser?.id);
      const [list, devices] = await Promise.all([
        window.api.listFuelTransactions(),
        window.api.listFuelDevices(),
      ]);
      onSynced?.(list);
      onDevicesSynced?.(devices);
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  let fleetSummary = null;
  try {
    fleetSummary = settings.filotimFleetSummary ? JSON.parse(settings.filotimFleetSummary) : null;
  } catch {
    fleetSummary = null;
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        Anlaşmalı akaryakıt kartı sağlayıcımızdan (Filotim) araç bazlı yakıt işlemlerini ve
        limit/kart durumunu çeker — yukarıdaki grafik ve rapor bu veriyi kullanır. Uygulama her
        açıldığında günde bir kez otomatik çalışır.
      </p>
      <p>
        <strong>{fuelTransactions.length}</strong> işlem kayıtlı
        {settings.filotimLastSyncAt && (
          <> · Son senkronizasyon: {formatDateTime(settings.filotimLastSyncAt)}</>
        )}
      </p>
      <button type="button" className="secondary" onClick={handleSync} disabled={syncing}>
        {syncing ? "Senkronize ediliyor…" : "Şimdi Senkronize Et"}
      </button>
      {error && <div className="error">{error}</div>}

      {fleetSummary && (
        <div
          style={{
            marginTop: "1rem",
            padding: "0.75rem 1rem",
            border: "1px solid var(--border)",
            borderRadius: 8,
          }}
        >
          <strong>Hesap Durumu{fleetSummary.name ? ` — ${fleetSummary.name}` : ""}</strong>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginTop: "0.4rem", fontSize: "0.9rem" }}>
            <span>Güncel Borç: {formatTL(fleetSummary.totalDebt)}</span>
            <span>Kalan Limit: {formatTL(fleetSummary.remainingLimit)} / {formatTL(fleetSummary.totalLimit)}</span>
            {fleetSummary.averagePaymentDelayDays != null && (
              <span>Ortalama Ödeme Gecikmesi: {fleetSummary.averagePaymentDelayDays} gün</span>
            )}
            {fleetSummary.isOverdue && <span style={{ color: "var(--danger)", fontWeight: 700 }}>Vadesi Geçmiş Ödeme Var</span>}
          </div>
        </div>
      )}

      {fuelDevices.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <strong>Araç Bazlı Aylık Limit Kullanımı</strong>
          <div style={{ overflowX: "auto", marginTop: "0.4rem" }}>
            <table>
              <thead>
                <tr>
                  <th>Plaka</th>
                  <th>Bu Ay Kullanılan</th>
                  <th>Aylık Limit</th>
                  <th>Kullanım Oranı</th>
                </tr>
              </thead>
              <tbody>
                {fuelDevices.map((d) => {
                  const ratio = d.monthlyLimit ? (Number(d.monthlyPurchase) || 0) / d.monthlyLimit : 0;
                  const nearLimit = ratio >= 0.8;
                  return (
                    <tr key={d.plate}>
                      <td>{d.plate}</td>
                      <td>
                        {formatTL(d.monthlyPurchase)}
                        {d.monthlyPurchaseInLiters != null && (
                          <small style={{ opacity: 0.7 }}> ({Number(d.monthlyPurchaseInLiters).toLocaleString("tr-TR")} L)</small>
                        )}
                      </td>
                      <td>{formatTL(d.monthlyLimit)}</td>
                      <td style={{ color: nearLimit ? "var(--danger)" : "inherit", fontWeight: nearLimit ? 700 : 400 }}>
                        {(ratio * 100).toLocaleString("tr-TR", { maximumFractionDigits: 0 })}%
                        {nearLimit && " — limite yaklaşıyor"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
