import { useState } from "react";

const DEFAULT_MINUTES = 5;

export default function SecuritySettingsSection({ settings, onSaved, currentUser, onTestScreensaver, onNotify }) {
  const current = settings.idleTimeoutMinutes ?? DEFAULT_MINUTES;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(current));
  const [error, setError] = useState("");
  const [backingUp, setBackingUp] = useState(false);

  async function handleBackup() {
    setBackingUp(true);
    try {
      const filePath = await window.api.exportBackup();
      if (filePath) onNotify?.("success", `Yedek kaydedildi: ${filePath}`);
    } catch (err) {
      onNotify?.("error", err.message || "Yedek alınamadı.");
    } finally {
      setBackingUp(false);
    }
  }

  function startEdit() {
    setDraft(String(current));
    setError("");
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();
    const minutes = Number(draft);
    if (!Number.isFinite(minutes) || minutes < 1) {
      setError("En az 1 dakika olmalı.");
      return;
    }
    setError("");
    const saved = await window.api.updateSettings({ idleTimeoutMinutes: minutes }, currentUser?.id);
    onSaved(saved);
    setEditing(false);
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        Program bu süre kadar hiç kullanılmadığında (fare/klavye hareketsiz kalırsa), bilgisayar açık
        kalsa bile ekran koruyucu devreye girer ve dokunulduğunda kullanıcı adı/şifre ekranına döner —
        şirket verilerinin gözetimsiz bırakılmaması için.
      </p>
      {error && <div className="error">{error}</div>}
      {editing ? (
        <form onSubmit={handleSave} className="form-row" style={{ alignItems: "flex-end" }}>
          <label>
            Hareketsizlik Süresi (dakika)
            <input
              type="number"
              min={1}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
            />
          </label>
          <button className="primary" type="submit">
            Kaydet
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            İptal
          </button>
        </form>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span>
            <strong>{current}</strong> dakika
          </span>
          <button type="button" className="secondary" onClick={startEdit}>
            Düzenle
          </button>
          {onTestScreensaver && (
            <button type="button" className="secondary" onClick={onTestScreensaver}>
              Ekran Koruyucuyu Şimdi Dene
            </button>
          )}
        </div>
      )}

      <hr style={{ margin: "1.25rem 0", border: "none", borderTop: "1px solid var(--border)" }} />

      <p>
        Supabase Pro'da günlük otomatik yedekleme zaten aktif. Buna ek olarak, istediğiniz an tüm verileri
        kendi bilgisayarınıza tek bir dosya olarak indirebilirsiniz.
      </p>
      <button type="button" className="secondary" onClick={handleBackup} disabled={backingUp}>
        {backingUp ? "Hazırlanıyor…" : "Tüm Veriyi Yedekle"}
      </button>
    </div>
  );
}
