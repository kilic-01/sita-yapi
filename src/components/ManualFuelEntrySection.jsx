import { useState } from "react";
import { Plus, Trash2, Pencil, X } from "lucide-react";
import { todayISO, formatDateTR } from "../lib/format.js";

function normalizePlate(plate) {
  return (plate || "").replace(/\s+/g, "").toUpperCase();
}

function formatTL(n) {
  return `${(Number(n) || 0).toLocaleString("tr-TR")} TL`;
}

function emptyForm(defaultPlate) {
  return { plate: defaultPlate || "", amount: "", liter: "", date: todayISO() };
}

// Filotim kartı/takip cihazı OLMAYAN araçlar için elle yakıt tutarı girişi —
// girilen kayıt aynı "fuelTransactions" tablosuna yazıldığı için (bkz.
// electron/db.js addManualFuelEntry) FuelPage'deki "Araç Bazlı Yakıt
// Gideri" tablosu ve FuelConsumptionChart grafiği ekstra kod gerekmeden
// bu kayıtları da otomatik hesaba katar.
export default function ManualFuelEntrySection({
  vehicles = [],
  fuelDevices = [],
  fuelTransactions = [],
  currentUser,
  onChanged,
}) {
  const [form, setForm] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const devicePlates = new Set(fuelDevices.map((d) => normalizePlate(d.plate)));
  const vehiclesWithoutDevice = vehicles.filter((v) => !devicePlates.has(normalizePlate(v.plate)));

  // Filotim satırları hiçbir zaman createdBy doldurmaz (bkz. db.js
  // upsertFuelTransactions) — bu yüzden "createdBy dolu = manuel kayıt".
  const manualEntries = fuelTransactions
    .filter((t) => t.createdBy)
    .sort((a, b) => (a.processDate < b.processDate ? 1 : a.processDate > b.processDate ? -1 : 0));

  function startNew() {
    setEditingId(null);
    setForm(emptyForm(vehiclesWithoutDevice[0]?.plate));
    setError("");
  }

  function startEdit(entry) {
    setEditingId(entry.id);
    setForm({
      plate: entry.plate || "",
      amount: String(entry.amount),
      liter: entry.liter != null ? String(entry.liter) : "",
      date: entry.processDate,
    });
    setError("");
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    const amountNum = Number(form.amount) || 0;
    if (!form.plate) {
      setError("Araç seçilmeli.");
      return;
    }
    if (!(amountNum > 0)) {
      setError("Tutar 0'dan büyük olmalı.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        plate: form.plate,
        amount: amountNum,
        liter: form.liter,
        date: form.date,
        actingUserId: currentUser?.id,
      };
      if (editingId) {
        await window.api.updateManualFuelEntry(editingId, payload);
      } else {
        await window.api.addManualFuelEntry(payload);
      }
      closeForm();
      await window.api.listFuelTransactions().then(onChanged);
    } catch (err) {
      setError(err.message || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(entry) {
    if (!window.confirm(`${entry.plate} — ${formatTL(entry.amount)} kaydını kalıcı olarak silmek istediğinize emin misiniz?`)) return;
    try {
      await window.api.deleteManualFuelEntry(entry.id, currentUser?.id);
      await window.api.listFuelTransactions().then(onChanged);
    } catch (err) {
      window.alert(err.message || "Silinemedi.");
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
        <h4 style={{ margin: 0 }}>Manuel Yakıt Girişi (Takip Cihazı Olmayan Araçlar)</h4>
        <div style={{ flex: 1 }} />
        {!form && vehiclesWithoutDevice.length > 0 && (
          <button
            type="button"
            className="primary"
            style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
            onClick={startNew}
          >
            <Plus size={15} strokeWidth={1.75} />
            Ekle
          </button>
        )}
      </div>

      {vehiclesWithoutDevice.length === 0 && !form && (
        <p style={{ opacity: 0.7 }}>Tüm araçlarınızda takip cihazı var, manuel giriş gerekmiyor.</p>
      )}

      {form && (
        <div className="card" style={{ marginBottom: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ marginTop: 0 }}>{editingId ? "Kaydı Düzenle" : "Yeni Manuel Yakıt Kaydı"}</h3>
            <button type="button" className="icon-btn" title="Kapat" aria-label="Kapat" onClick={closeForm}>
              <X size={15} strokeWidth={1.75} />
            </button>
          </div>
          <form onSubmit={handleSave}>
            <div className="form-row">
              <label>
                Araç
                <select value={form.plate} onChange={(e) => setForm((f) => ({ ...f, plate: e.target.value }))}>
                  <option value="">Seçin…</option>
                  {vehiclesWithoutDevice.map((v) => (
                    <option key={v.id} value={v.plate}>
                      {v.plate}
                    </option>
                  ))}
                  {/* Düzenlenen kayıt sonradan cihaz takılmış bir plakaya aitse
                      (artık vehiclesWithoutDevice'ta yok) seçimi kaybetmemek için. */}
                  {editingId && form.plate && !vehiclesWithoutDevice.some((v) => v.plate === form.plate) && (
                    <option value={form.plate}>{form.plate}</option>
                  )}
                </select>
              </label>
              <label>
                Tarih
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                />
              </label>
            </div>
            <div className="form-row" style={{ marginTop: "0.5rem" }}>
              <label>
                Tutar
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  autoFocus
                  placeholder="0,00"
                />
              </label>
              <label>
                Litre (opsiyonel)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.liter}
                  onChange={(e) => setForm((f) => ({ ...f, liter: e.target.value }))}
                  placeholder="0,00"
                />
              </label>
            </div>
            {error && <p style={{ color: "var(--danger, #e74c3c)" }}>{error}</p>}
            <div style={{ marginTop: "0.75rem", display: "flex", gap: "0.5rem" }}>
              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              <button type="button" className="secondary" onClick={closeForm}>
                Vazgeç
              </button>
            </div>
          </form>
        </div>
      )}

      {manualEntries.length > 0 && (
        <div className="card">
          {manualEntries.map((entry) => (
            <div
              key={entry.id}
              style={{ borderBottom: "1px solid var(--border)", padding: "0.5rem 0", display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
            >
              <strong style={{ minWidth: 100 }}>{entry.plate}</strong>
              <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>{formatDateTR(entry.processDate)}</span>
              {entry.liter != null && (
                <span style={{ opacity: 0.75, fontSize: "0.85rem" }}>
                  {Number(entry.liter).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} L
                </span>
              )}
              <span style={{ flex: 1 }} />
              <strong>{formatTL(entry.amount)}</strong>
              <button type="button" className="icon-btn edit" title="Düzenle" aria-label="Düzenle" onClick={() => startEdit(entry)}>
                <Pencil size={14} strokeWidth={1.75} />
              </button>
              <button type="button" className="icon-btn delete" title="Sil" aria-label="Sil" onClick={() => handleDelete(entry)}>
                <Trash2 size={14} strokeWidth={1.75} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
