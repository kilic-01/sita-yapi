import { useEffect, useState } from "react";
import useTvDevices, { tvLabel } from "./useTvDevices.js";
import ToggleSwitch from "./ToggleSwitch.jsx";

const DEFAULTS = { name: "TV", mode: "customer", workStart: "08:30", workEnd: "19:00", dimOutside: true, offDays: [] };
// Tatil günleri: 1 = Pazartesi … 7 = Pazar (TV tarafıyla aynı numaralama).
const WEEK_DAYS = [
  [1, "Pzt"],
  [2, "Sal"],
  [3, "Çar"],
  [4, "Per"],
  [5, "Cum"],
  [6, "Cmt"],
  [7, "Paz"],
];

// Ayarlar > TV Ekranları — ofisteki her TV'nin adı, modu (mağaza/ofis) ve
// mesai saatleri. Kaydedilen ayar TV'ye anında gönderilir; TV kapalıysa
// açıldığında ("hello") alır (bkz. electron/db.js sendTvConfigTo).
export default function TvDevicesSection({ currentUser, onNotify }) {
  const { online, devices, setDevices } = useTvDevices();
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  async function checkUpdate() {
    setCheckingUpdate(true);
    try {
      await window.api.requestTvUpdateCheck(currentUser?.id);
      onNotify?.("success", "TV'lere güncelleme kontrolü gönderildi. Yeni sürüm varsa TV'de \"OK'e basın\" yazısı çıkar.");
    } catch (err) {
      onNotify?.("error", (err.message || "Gönderilemedi.").replace(/^.*Error: /, ""));
    } finally {
      setCheckingUpdate(false);
    }
  }

  const ids = [...new Set([...online.map((t) => t.tvId), ...Object.keys(devices)])];

  // Kayıtlı ayar değişince (bu ya da başka bir bilgisayar kaydetti) form
  // kayıtlı hale döner; henüz kaydı olmayan TV, TV'nin bildirdiği ad/modla başlar.
  useEffect(() => {
    setDrafts((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const reported = online.find((t) => t.tvId === id);
        if (devices[id]) next[id] = { ...DEFAULTS, ...devices[id] };
        else if (!next[id]) next[id] = { ...DEFAULTS, name: reported?.name || DEFAULTS.name, mode: reported?.mode || DEFAULTS.mode };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, devices]);

  function patch(id, change) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...change } }));
  }

  async function save(id) {
    setSavingId(id);
    try {
      const saved = await window.api.saveTvDevice(id, drafts[id], currentUser?.id);
      setDevices(saved || {});
      onNotify?.("success", "TV ayarları kaydedildi ve TV'ye gönderildi.");
    } catch (err) {
      onNotify?.("error", (err.message || "Kaydedilemedi.").replace(/^.*Error: /, ""));
    } finally {
      setSavingId(null);
    }
  }

  if (ids.length === 0) {
    return <p style={{ marginTop: 0 }}>Bağlı TV yok. TV uygulaması açıldığında burada görünür.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.9rem" }}>
        <span style={{ width: 8, height: 8, borderRadius: 999, background: online.length ? "var(--success)" : "var(--danger)" }} />
        <strong>{online.length ? `${online.length} TV bağlı` : "Bağlı TV yok"}</strong>
        {online.length > 0 && (
          <span style={{ color: "var(--text-muted, inherit)", opacity: 0.8 }}>
            —{" "}
            {online
              .map((t) => `${tvLabel(t.tvId, devices, online)} (${(devices[t.tvId]?.mode || t.mode) === "office" ? "ofis" : "mağaza"})`)
              .join(", ")}
          </span>
        )}
      </div>
      <p style={{ marginTop: 0 }}>
        <strong>Mağaza modu</strong>nda rota ve günlük özet gibi kişisel veri içeren yayınlar gösterilmez.
        Mesai dışında ve seçilen tatil günlerinde ekran karartılır.
      </p>
      <div>
        <button type="button" className="secondary" onClick={checkUpdate} disabled={checkingUpdate || online.length === 0}>
          {checkingUpdate ? "Gönderiliyor…" : "Güncellemeleri kontrol et"}
        </button>
      </div>
      {ids.map((id) => {
        const d = drafts[id] || DEFAULTS;
        const isOnline = online.some((t) => t.tvId === id);
        const version = online.find((t) => t.tvId === id)?.version;
        return (
          <div key={id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "0.75rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", fontSize: "0.85rem" }}>
              <span
                style={{ width: 8, height: 8, borderRadius: 999, background: isOnline ? "var(--success)" : "var(--danger)" }}
              />
              {isOnline ? "Bağlı" : "Bağlı değil"}
              {version && <span style={{ opacity: 0.6 }}>· v{version}</span>}
              <span style={{ opacity: 0.5, marginLeft: "auto", fontFamily: "monospace" }}>{id.slice(0, 8)}</span>
            </div>
            <div className="form-row" style={{ alignItems: "flex-end" }}>
              <label>
                Ad
                <input value={d.name} onChange={(e) => patch(id, { name: e.target.value })} maxLength={40} />
              </label>
              <label>
                Mod
                <select value={d.mode} onChange={(e) => patch(id, { mode: e.target.value })}>
                  <option value="customer">Mağaza</option>
                  <option value="office">Ofis</option>
                </select>
              </label>
              <label>
                Mesai başı
                <input type="time" value={d.workStart} onChange={(e) => patch(id, { workStart: e.target.value })} />
              </label>
              <label>
                Mesai sonu
                <input type="time" value={d.workEnd} onChange={(e) => patch(id, { workEnd: e.target.value })} />
              </label>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
              <span style={{ fontSize: "0.9rem" }}>Tatil günleri</span>
              {WEEK_DAYS.map(([day, label]) => {
                const offDays = d.offDays || [];
                return (
                  <label key={day} style={{ flexDirection: "row", alignItems: "center", gap: "0.3rem", margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={offDays.includes(day)}
                      onChange={(e) =>
                        patch(id, { offDays: e.target.checked ? [...offDays, day] : offDays.filter((x) => x !== day) })
                      }
                    />
                    {label}
                  </label>
                );
              })}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.75rem" }}>
              <label style={{ flexDirection: "row", alignItems: "center", gap: "0.5rem", margin: 0 }}>
                <ToggleSwitch checked={d.dimOutside} onChange={(e) => patch(id, { dimOutside: e.target.checked })} />
                Mesai dışında ve tatil günlerinde ekranı karart
              </label>
              <button type="button" className="primary" style={{ marginLeft: "auto" }} onClick={() => save(id)} disabled={savingId === id}>
                {savingId === id ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
