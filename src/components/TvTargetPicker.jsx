import { useEffect, useState } from "react";
import { Airplay } from "lucide-react";
import useTvDevices, { tvLabel } from "./useTvDevices.js";

// Birden fazla TV bağlıyken yayının hangi TV'ye gideceği. Tek TV varken
// görünmez (yayın hepsine gider). Seçim main process'te tutulur ve sonraki
// tüm "TV'de Yayınla"lara uygulanır.
export default function TvTargetPicker() {
  const { online, devices } = useTvDevices();
  const [target, setTarget] = useState("");

  // Seçim ana süreçte tutuluyor; sayfa değişip seçici yeniden açılınca oradan okunur
  // (yoksa "Tüm TV'ler" görünürken yayın hâlâ önceki seçili TV'ye giderdi).
  useEffect(() => {
    window.api?.getTvTarget?.().then((t) => setTarget(t || "")).catch(() => {});
  }, []);

  useEffect(() => {
    // Seçili TV kapandıysa "Tüm TV'ler"e dön.
    if (target && !online.some((t) => t.tvId === target)) {
      setTarget("");
      window.api?.setTvTarget?.(null);
    }
  }, [online, target]);

  if (online.length < 2) return null;

  return (
    <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
      <Airplay size={16} strokeWidth={1.75} />
      Yayın:
      <select
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          window.api.setTvTarget(e.target.value || null);
        }}
      >
        <option value="">Tüm TV'ler</option>
        {online.map((t) => (
          <option key={t.tvId} value={t.tvId}>
            {tvLabel(t.tvId, devices, online)}
          </option>
        ))}
      </select>
    </label>
  );
}
