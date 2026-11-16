import { useCallback, useEffect, useState } from "react";

// Bağlı TV'ler (Supabase presence) + Ayarlar > TV Ekranları'nda kayıtlı TV
// ayarları + eşleştirme bekleyen / eşleşmiş TV'ler. Main process presence
// değiştikçe "tv:presence", eşleştirme isteği gelince "tv:pairing" gönderir.
export default function useTvDevices() {
  const [online, setOnline] = useState([]);
  const [devices, setDevices] = useState({});
  // Eşleştirme bekleyen TV'ler ve eşleşmiş TV kimlikleri (null: okunamadı).
  const [pairing, setPairing] = useState([]);
  const [paired, setPaired] = useState(null);

  const refresh = useCallback(() => {
    if (!window.api?.listTvDevices) return;
    window.api
      .listTvDevices()
      .then((r) => {
        setDevices(r?.devices || {});
        setOnline(r?.online || []);
        setPairing(r?.pairing || []);
        setPaired(r?.paired ?? null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!window.api?.listTvDevices) return undefined;
    refresh();
    const offPresence = window.api.onTvPresenceChange(({ online: list }) => {
      setOnline(list || []);
      refresh();
    });
    const offPairing = window.api.onTvPairingChange?.(({ pairing: list }) => {
      setPairing(list || []);
    });
    return () => {
      offPresence?.();
      offPairing?.();
    };
  }, [refresh]);

  return { online, devices, setDevices, pairing, paired, refresh };
}

// TV'nin görünen adı: Ayarlar'da verilen ad, yoksa TV'nin bildirdiği ad.
export function tvLabel(tvId, devices, online) {
  return devices[tvId]?.name || online.find((t) => t.tvId === tvId)?.name || `TV ${tvId.slice(0, 4)}`;
}
