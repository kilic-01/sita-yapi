import { useState } from "react";
import { TrashIcon } from "./icons.jsx";
import Modal from "./Modal.jsx";
import ToggleSwitch from "./ToggleSwitch.jsx";

function EditHolidayModal({ holiday, holidays, currentUser, onClose, onSaved, onNotify }) {
  const isNew = !holiday;
  const [name, setName] = useState(holiday?.name || "");
  const [startDate, setStartDate] = useState(holiday?.startDate || "");
  const [endDate, setEndDate] = useState(holiday?.endDate || "");
  const [recurring, setRecurring] = useState(holiday?.recurring || false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim() || !startDate || !endDate) {
      setError("Ad, başlangıç ve bitiş tarihi zorunlu.");
      return;
    }
    if (startDate > endDate) {
      setError("Başlangıç tarihi bitiş tarihinden sonra olamaz.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const id = holiday?.id || crypto.randomUUID();
      const patch = { id, name: name.trim(), startDate, endDate, recurring };
      const nextList = isNew
        ? [...holidays, patch]
        : holidays.map((h) => (h.id === id ? { ...h, ...patch } : h));
      const saved = await window.api.setHolidays(nextList, currentUser?.id);
      onSaved(saved);
      onNotify?.("success", isNew ? "Tatil eklendi." : "Tatil güncellendi.");
      onClose();
    } catch (err) {
      setError(err.message || "Kaydedilemedi.");
      onNotify?.("error", err.message || "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{isNew ? "Yeni Tatil" : "Tatili Düzenle"}</h3>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSave}>
          <div className="form-row">
            <label>
              Ad
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Kurban Bayramı" />
            </label>
            <label>
              Başlangıç
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </label>
            <label>
              Bitiş
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: "0.4rem", marginTop: "0.75rem" }}>
            <ToggleSwitch checked={recurring} onChange={(e) => setRecurring(e.target.checked)} />
            <span>Her yıl tekrarla</span>
          </label>
          <small style={{ opacity: 0.7 }}>
            Tarihi hiç değişmeyen resmi bayramlar için işaretleyin (ör. 23 Nisan). Ramazan/Kurban Bayramı
            gibi tarihi her yıl değişenler için işaretlemeyin, her yıl elle güncelleyin.
          </small>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "1.25rem" }}>
            <button className="primary" type="submit" disabled={busy}>
              Kaydet
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              İptal
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

export default function HolidaysSection({ holidays, currentUser, onSaved, onNotify }) {
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const sorted = [...holidays].sort((a, b) => (a.startDate || "").localeCompare(b.startDate || ""));

  async function handleDelete(holiday) {
    if (!window.confirm(`"${holiday.name}" kaydını silmek istediğinize emin misiniz?`)) return;
    try {
      const saved = await window.api.setHolidays(
        holidays.filter((h) => h.id !== holiday.id),
        currentUser?.id
      );
      onSaved(saved);
      onNotify?.("success", "Tatil silindi.");
    } catch (err) {
      onNotify?.("error", err.message || "Silinemedi.");
    }
  }

  return (
    <>
      <p style={{ marginTop: 0 }}>
        Buraya eklenen resmi ve dini bayram günleri, yıllık izin hesaplarında (Çalışanlar bölümündeki izin
        gün sayacı ve Yıllık İzin Tablosu) ve randevu/takvim ekranlarında pazar günleri gibi gösterilir.
        "Her yıl tekrarla" işaretli tatiller (ör. 23 Nisan) siz silmediğiniz sürece her yıl otomatik
        geçerli olur; işaretsiz olanları (dini bayramlar gibi) her yıl elle güncellemeniz gerekir.
      </p>
      {sorted.length === 0 && <p>Henüz tatil eklenmedi.</p>}
      {sorted.map((h) => (
        <div
          key={h.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            borderBottom: "1px solid var(--border)",
            padding: "0.6rem 0",
          }}
        >
          <strong style={{ flex: 1 }}>{h.name}</strong>
          <span style={{ opacity: 0.8 }}>
            {h.startDate === h.endDate ? h.startDate : `${h.startDate} — ${h.endDate}`}
          </span>
          {h.recurring && <span className="badge">Her Yıl Tekrarlar</span>}
          <button type="button" className="secondary" onClick={() => setEditingHoliday(h)}>
            Düzenle
          </button>
          <button
            type="button"
            className="icon-btn delete"
            title="Tatili sil"
            aria-label="Tatili sil"
            onClick={() => handleDelete(h)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}

      <button type="button" className="primary" style={{ marginTop: "0.75rem" }} onClick={() => setShowAdd(true)}>
        + Tatil Ekle
      </button>

      {(editingHoliday || showAdd) && (
        <EditHolidayModal
          holiday={editingHoliday}
          holidays={holidays}
          currentUser={currentUser}
          onClose={() => {
            setEditingHoliday(null);
            setShowAdd(false);
          }}
          onSaved={onSaved}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
