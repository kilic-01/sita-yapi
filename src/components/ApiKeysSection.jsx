import { useState } from "react";

function maskKey(key) {
  if (!key) return "(ayarlanmamış)";
  if (key.length <= 8) return "•".repeat(key.length);
  return key.slice(0, 4) + "•".repeat(Math.max(4, key.length - 8)) + key.slice(-4);
}

function ApiKeyRow({ label, value, fieldName, onSaved, currentUser }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEdit() {
    const ok = window.confirm(
      `${label} anahtarını değiştirmek istediğinizden emin misiniz? Yanlış bir değer adres bulma, rota oluşturma veya yapay zeka özelliklerini bozabilir.`
    );
    if (!ok) return;
    setDraft("");
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setDraft("");
  }

  async function saveEdit() {
    if (!draft.trim()) {
      window.alert("Boş bir değer kaydedilemez.");
      return;
    }
    const ok = window.confirm(`${label} anahtarındaki değişikliği kaydetmek istediğinizden emin misiniz?`);
    if (!ok) return;
    const saved = await window.api.updateSettings({ [fieldName]: draft.trim() }, currentUser?.id);
    onSaved(saved);
    setEditing(false);
    setDraft("");
  }

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label style={{ display: "block", marginBottom: "0.3rem" }}>{label}</label>
      {editing ? (
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label style={{ flex: 1 }}>
            Yeni Değer
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Yeni API anahtarını yapıştırın"
            />
          </label>
          <button type="button" className="primary" onClick={saveEdit}>
            Kaydet
          </button>
          <button type="button" className="secondary" onClick={cancelEdit}>
            İptal
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <span style={{ opacity: 0.45, fontFamily: "monospace" }}>{maskKey(value)}</span>
          <button type="button" className="secondary" onClick={startEdit}>
            Düzenle
          </button>
        </div>
      )}
    </div>
  );
}

export default function ApiKeysSection({ settings, onSaved, currentUser }) {
  return (
    <div>
      <p style={{ marginTop: 0 }}>
        Bu anahtarlar adres bulma (Google Maps), şikayet metninden süre tahmini (Gemini) ve
        akaryakıt kartı senkronizasyonu (Filotim) özellikleri için kullanılır. Değiştirmeden
        önce emin olun — yanlış bir değer bu özellikleri bozar.
      </p>
      <ApiKeyRow
        label="Google Maps API Anahtarı"
        value={settings.googleMapsApiKey}
        fieldName="googleMapsApiKey"
        onSaved={onSaved}
        currentUser={currentUser}
      />
      <ApiKeyRow
        label="Gemini API Anahtarı"
        value={settings.geminiApiKey}
        fieldName="geminiApiKey"
        onSaved={onSaved}
        currentUser={currentUser}
      />
      <ApiKeyRow
        label="Filotim API Anahtarı"
        value={settings.filotimApiKey}
        fieldName="filotimApiKey"
        onSaved={onSaved}
        currentUser={currentUser}
      />
    </div>
  );
}
