import { useState } from "react";
import { TrashIcon } from "./icons.jsx";

function newChannelRow(nextId) {
  return { id: nextId, name: `Kamera ${nextId}` };
}

function newDvrRow() {
  return {
    id: crypto.randomUUID(),
    locationLabel: "",
    host: "",
    port: 554,
    username: "",
    password: "",
    channels: [{ id: 1, name: "Kamera 1" }],
  };
}

export default function CameraSettingsSection({ cameras, onSaved, currentUser }) {
  const [rows, setRows] = useState((cameras || []).map((d) => ({ ...d, password: "" })));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }

  function patchRow(index, patch) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function addDvr() {
    setRows((rs) => [...rs, newDvrRow()]);
  }

  function discardChanges() {
    setRows((cameras || []).map((d) => ({ ...d, password: "" })));
    setNotice(null);
  }

  function removeDvr(index) {
    const row = rows[index];
    if (!window.confirm(`"${row.locationLabel || "bu DVR"}" kaydını kaldırmak istediğinize emin misiniz?`)) return;
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  function removeCredentials(index) {
    patchRow(index, { hasCredentials: false, clearCredentials: true, password: "" });
  }

  function updateChannel(dvrIndex, chIndex, field, value) {
    setRows((rs) =>
      rs.map((r, i) =>
        i === dvrIndex
          ? { ...r, channels: r.channels.map((c, j) => (j === chIndex ? { ...c, [field]: value } : c)) }
          : r
      )
    );
  }

  function addChannel(dvrIndex) {
    setRows((rs) =>
      rs.map((r, i) => {
        if (i !== dvrIndex) return r;
        const nextId = Math.max(0, ...r.channels.map((c) => Number(c.id) || 0)) + 1;
        return { ...r, channels: [...r.channels, newChannelRow(nextId)] };
      })
    );
  }

  function removeChannel(dvrIndex, chIndex) {
    const ch = rows[dvrIndex].channels[chIndex];
    if (!window.confirm(`"${ch.name || "bu kamera"}" kanalını kaldırmak istediğinize emin misiniz?`)) return;
    setRows((rs) =>
      rs.map((r, i) => (i === dvrIndex ? { ...r, channels: r.channels.filter((_, j) => j !== chIndex) } : r))
    );
  }

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    try {
      // Hiç doldurulmadan "+ DVR Ekle" ile açılıp boş bırakılmış kartlar
      // kaydedilmesin — hem host hem konum adı boşsa o satır atlanır.
      const toSave = rows.filter((r) => r.host.trim() || r.locationLabel.trim() || r.username.trim());
      const saved = await window.api.updateCameraSettings(toSave, currentUser?.id);
      setRows(saved.map((d) => ({ ...d, password: "" })));
      onSaved(saved);
      setNotice({ type: "success", text: "Kamera ayarları kaydedildi." });
    } catch (err) {
      setNotice({ type: "error", text: err.message || "Kaydedilemedi." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave}>
      <p style={{ marginTop: 0 }}>
        Her biri ayrı bir DVR/konum (örn. depo, mağaza). Uygulama her zaman o konumda açık
        olmayacağı için <strong>o DVR'ın bağlı olduğu router'ın dışarıya yönlendirdiği herkese
        açık (public) IP adresi ve port'u</strong> yazılır (yerel 192.168.x.x adresi değil).
        Router'ın IP'si zamanla değişebileceği için mümkünse sabit bir DDNS adresi kullanın.
      </p>

      {rows.map((row, i) => (
        <div
          key={row.id}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "0.75rem",
            marginBottom: "0.75rem",
          }}
        >
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <label>
              Bu Kameraların Bulunduğu Yer (Kameralar sekmesinde başlık olarak gözükür)
              <input
                value={row.locationLabel}
                onChange={(e) => patchRow(i, { locationLabel: e.target.value })}
                placeholder="Örn. Depo ya da Mağaza"
              />
            </label>
            <button
              type="button"
              className="icon-btn delete"
              title="Bu DVR'ı kaldır"
              aria-label="Bu DVR'ı kaldır"
              onClick={() => removeDvr(i)}
            >
              <TrashIcon />
            </button>
          </div>
          <div className="form-row" style={{ alignItems: "flex-end", marginTop: "0.5rem" }}>
            <label>
              Herkese Açık IP / DDNS Adresi
              <input
                value={row.host}
                onChange={(e) => patchRow(i, { host: e.target.value })}
                placeholder="78.161.19.251 ya da sitayapi.ddns.net"
              />
            </label>
            <label style={{ maxWidth: 120 }}>
              Dış Port
              <input
                type="number"
                value={row.port}
                onChange={(e) => patchRow(i, { port: Number(e.target.value) || 554 })}
                placeholder="15541"
              />
            </label>
          </div>
          <div className="form-row" style={{ alignItems: "flex-end", marginTop: "0.5rem" }}>
            <label>
              Kullanıcı Adı
              <input value={row.username} onChange={(e) => patchRow(i, { username: e.target.value })} />
            </label>
            <label>
              Şifre
              <input
                type="password"
                value={row.password || ""}
                onChange={(e) => patchRow(i, { password: e.target.value })}
                placeholder={row.hasCredentials ? "•••••••• (kayıtlı — değiştirmek için yazın)" : ""}
              />
            </label>
            {row.hasCredentials && (
              <button type="button" className="secondary" onClick={() => removeCredentials(i)}>
                Kimlik Bilgilerini Kaldır
              </button>
            )}
          </div>
          <small>
            Şifre bu bilgisayarın güvenli anahtarlığında (Keychain) şifreli saklanır, hiçbir zaman
            ekrana yazılmaz.
          </small>

          <h4 style={{ marginTop: "1rem", marginBottom: "0.5rem" }}>Kanallar</h4>
          {row.channels.map((ch, j) => (
            <div key={j} className="form-row" style={{ alignItems: "flex-end", marginBottom: "0.4rem" }}>
              <label style={{ maxWidth: 100 }}>
                Kanal No
                <input
                  type="number"
                  value={ch.id}
                  onChange={(e) => updateChannel(i, j, "id", Number(e.target.value) || 1)}
                />
              </label>
              <label>
                İsim
                <input value={ch.name} onChange={(e) => updateChannel(i, j, "name", e.target.value)} />
              </label>
              <button
                type="button"
                className="icon-btn delete"
                title="Kanalı kaldır"
                aria-label="Kanalı kaldır"
                onClick={() => removeChannel(i, j)}
              >
                <TrashIcon />
              </button>
            </div>
          ))}
          <button type="button" className="secondary" onClick={() => addChannel(i)}>
            + Kanal Ekle
          </button>
        </div>
      ))}

      <button type="button" className="secondary" onClick={addDvr}>
        + DVR Ekle
      </button>

      {notice && (
        <div className={notice.type} style={{ marginTop: "0.75rem" }}>
          {notice.text}
        </div>
      )}

      <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.6rem" }}>
        <button className="primary" type="submit" disabled={busy}>
          Kamera Ayarlarını Kaydet
        </button>
        <button type="button" className="secondary" onClick={discardChanges} disabled={busy}>
          Vazgeç (Kaydedilmemiş Değişiklikleri Sil)
        </button>
      </div>
    </form>
  );
}
