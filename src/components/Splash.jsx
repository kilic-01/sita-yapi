import { version } from "../../package.json";
import { WifiOff } from "lucide-react";
import { useSyncStatus } from "../lib/useHeaderAlerts.js";

// Açılış ekranı normalde bir-iki saniye sürer (kullanıcı listesi gelene
// kadar) — ama internet yoksa bu veri hiç gelmez ve ekran SONSUZA KADAR bu
// ekranda takılı kalır. O anda kullanıcı "program mı bozuk, internet mi yok"
// ayırt edemiyordu — Supabase Realtime bağlantı durumunu (App.jsx'in geri
// kalanıyla aynı window.api.onSyncStatusChange) burada da gösteriyoruz.
export default function Splash({ isDark }) {
  const syncInfo = useSyncStatus();
  return (
    <div className="splash">
      <img src={isDark ? "./logo-white.svg" : "./logo.svg"} alt="Sita Yapı" />
      <span className="splash-version">v{version}</span>
      {syncInfo.isProblem && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "var(--danger)",
            fontSize: "0.85rem",
            marginTop: "1.25rem",
          }}
        >
          <WifiOff size={16} strokeWidth={1.75} />
          <span>İnternet bağlantısında sorun var — bağlantı sağlanınca devam edecek.</span>
        </div>
      )}
    </div>
  );
}
