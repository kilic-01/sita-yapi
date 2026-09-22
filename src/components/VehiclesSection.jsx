import { useState } from "react";
import { TrashIcon } from "./icons.jsx";

function newVehicleRow() {
  return { id: crypto.randomUUID(), plate: "", brand: "", model: "", year: "" };
}

export default function VehiclesSection({ vehicles, currentUser, onSaved, onNotify }) {
  const [rows, setRows] = useState(vehicles.map((v) => ({ ...v })));

  function updateRow(index, field, value) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addVehicle() {
    setRows((rs) => [...rs, newVehicleRow()]);
  }

  function removeVehicle(index) {
    const row = rows[index];
    const label = row.plate || "bu araç";
    if (!window.confirm(`"${label}" aracını silmek istediğinize emin misiniz?`)) return;
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      const saved = await window.api.setVehicles(rows, currentUser?.id);
      onSaved(saved);
      onNotify?.("success", "Araçlar kaydedildi.");
    } catch (err) {
      onNotify?.("error", err.message || "Kaydedilemedi.");
    }
  }

  return (
    <form onSubmit={handleSave}>
      {rows.map((row, i) => (
        <div key={row.id} className="form-row" style={{ alignItems: "flex-end" }}>
          <label>
            Plaka
            <input
              value={row.plate}
              onChange={(e) => updateRow(i, "plate", e.target.value)}
              placeholder="34 ABC 123"
            />
          </label>
          <label>
            Marka
            <input value={row.brand} onChange={(e) => updateRow(i, "brand", e.target.value)} />
          </label>
          <label>
            Model
            <input value={row.model} onChange={(e) => updateRow(i, "model", e.target.value)} />
          </label>
          <label>
            Yıl
            <input
              value={row.year}
              onChange={(e) => updateRow(i, "year", e.target.value)}
              placeholder="2022"
            />
          </label>
          <button
            type="button"
            className="icon-btn delete"
            title="Aracı sil"
            aria-label="Aracı sil"
            onClick={() => removeVehicle(i)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={addVehicle}>
        + Araç Ekle
      </button>
      <button className="primary" type="submit" style={{ marginLeft: "0.6rem" }}>
        Araçları Kaydet
      </button>
    </form>
  );
}
