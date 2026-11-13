import { useEffect, useState } from "react";

// Bağlı TV'ler (Supabase presence) + Ayarlar > TV Ekranları'nda kayıtlı TV
// ayarları. Main process presence değiştikçe "tv:presence" gönderir.
export default function useTvDevices() {
  const [online, setOnline] = useState([]);
  const [devices, setDevices] = useState({});

  useEffect(() => {
    if (!window.api?.listTvDevices) return undefined;
    const refresh = () =>
      window.api
        .listTvDevices()
        .then((r) => {
          setDevices(r?.devices || {});
          setOnline(r?.online || []);
        })
        .catch(() => {});
    refresh();
    return window.api.onTvPresenceChange(({ online: list }) => {
      setOnline(list || []);
      refresh();
    });
  }, []);

  return { online, devices, setDevices };
}

// TV'nin görünen adı: Ayarlar'da verilen ad, yoksa TV'nin bildirdiği ad.
export function tvLabel(tvId, devices, online) {
  return devices[tvId]?.name || online.find((t) => t.tvId === tvId)?.name || `TV ${tvId.slice(0, 4)}`;
}
