import { useState } from "react";
import { TrashIcon } from "./icons.jsx";

function newDepotRow() {
  return { id: crypto.randomUUID(), name: "" };
}

export default function DepotsSection({ depots, currentUser, onSaved, onNotify }) {
  const [rows, setRows] = useState(depots.map((d) => ({ ...d })));

  function updateRow(index, field, value) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addDepot() {
    setRows((rs) => [...rs, newDepotRow()]);
  }

  function removeDepot(index) {
    const row = rows[index];
    const label = row.name || "bu depo";
    if (!window.confirm(`"${label}" deposunu silmek istediğinize emin misiniz?`)) return;
    setRows((rs) => rs.filter((_, i) => i !== index));
  }

  async function handleSave(e) {
    e.preventDefault();
    try {
      const saved = await window.api.setDepots(rows, currentUser?.id);
      onSaved(saved);
      onNotify?.("success", "Depolar kaydedildi.");
    } catch (err) {
      onNotify?.("error", err.message || "Kaydedilemedi.");
    }
  }

  return (
    <form onSubmit={handleSave}>
      <p style={{ marginTop: 0 }}>
        Stok sekmesinde ürünlerin hangi depoda olduğunu işaretleyebilmeniz için depolarınızı
        buradan tanımlayın.
      </p>
      {rows.map((row, i) => (
        <div key={row.id} className="form-row" style={{ alignItems: "flex-end" }}>
          <label>
            Depo Adı
            <input
              value={row.name}
              onChange={(e) => updateRow(i, "name", e.target.value)}
              placeholder="Örn. Merkez Depo"
            />
          </label>
          <button
            type="button"
            className="icon-btn delete"
            title="Depoyu sil"
            aria-label="Depoyu sil"
            onClick={() => removeDepot(i)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={addDepot}>
        + Depo Ekle
      </button>
      <button className="primary" type="submit" style={{ marginLeft: "0.6rem" }}>
        Depoları Kaydet
      </button>
    </form>
  );
}
