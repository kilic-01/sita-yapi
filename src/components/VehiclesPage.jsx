import { useState } from "react";
import {
  Car,
  Wrench,
  ShieldCheck,
  ReceiptTurkishLira,
  Gauge,
  ImagePlus,
  Plus,
  X,
  TriangleAlert,
  Clock,
} from "lucide-react";
import Modal from "./Modal.jsx";
import { TrashIcon } from "./icons.jsx";
import { todayISO } from "../lib/format.js";
import { CarRepairIllustration } from "./illustrations.jsx";

const DUE_SOON_DAYS = 30;
// Fatura fotoğrafları telefon kamerasından geliyor (genelde 3-10 MB) —
// olduğu gibi base64 kaydetmek "vehicles" tablosunu şişirirdi. Tarayıcıda
// canvas ile küçültüp JPEG'e çeviriyoruz; bu boyutta bir fatura fotoğrafı
// genelde 100-400 KB'a iniyor, okunurluk kaybı olmadan.
const COMPRESS_MAX_DIM = 1600;
const COMPRESS_QUALITY = 0.8;
const MAX_PHOTO_BYTES_AFTER_COMPRESSION = 3 * 1024 * 1024;

const HISTORY_TYPES = [
  { value: "bakim", label: "Bakım/Servis", icon: Wrench },
  { value: "muayene", label: "Muayene", icon: ShieldCheck },
  { value: "diger", label: "Diğer", icon: Wrench },
];

function historyTypeMeta(value) {
  return HISTORY_TYPES.find((t) => t.value === value) || HISTORY_TYPES[2];
}

function newVehicle() {
  return {
    id: crypto.randomUUID(),
    plate: "",
    brand: "",
    model: "",
    year: "",
    inspectionDueDate: "",
    inspectionKm: "",
    serviceDueDate: "",
    serviceKm: "",
    history: [],
  };
}

function newHistoryEntry() {
  return { id: crypto.randomUUID(), date: todayISO(), type: "bakim", km: "", cost: "", note: "", photo: "" };
}

// Bir tarihin durumu: geçti / yaklaşıyor / normal — muayene ve servis/bakım
// için aynı eşik (30 gün) kullanılıyor.
function dueStatus(dateStr) {
  if (!dateStr) return null;
  const diffDays = Math.round((new Date(dateStr) - new Date(todayISO())) / 86400000);
  if (diffDays < 0) return { tone: "overdue", label: `${Math.abs(diffDays)} gün gecikti` };
  if (diffDays <= DUE_SOON_DAYS) return { tone: "soon", label: diffDays === 0 ? "Bugün" : `${diffDays} gün kaldı` };
  return null;
}

function DueBadge({ dateStr }) {
  const status = dueStatus(dateStr);
  if (!status) return null;
  const color = status.tone === "overdue" ? "var(--danger)" : "#a15c00";
  const Icon = status.tone === "overdue" ? TriangleAlert : Clock;
  return (
    <small style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem", color, marginTop: "0.2rem" }}>
      <Icon size={13} strokeWidth={2} />
      {status.label}
    </small>
  );
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > COMPRESS_MAX_DIM || height > COMPRESS_MAX_DIM) {
          const scale = COMPRESS_MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", COMPRESS_QUALITY));
      };
      img.onerror = () => reject(new Error("Görsel okunamadı."));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Dosya okunamadı."));
    reader.readAsDataURL(file);
  });
}

function formatKm(km) {
  if (km === "" || km == null) return null;
  const n = Number(km);
  return Number.isFinite(n) ? `${n.toLocaleString("tr-TR")} km` : null;
}

function formatCost(cost) {
  if (cost === "" || cost == null) return null;
  const n = Number(cost);
  return Number.isFinite(n) ? `${n.toLocaleString("tr-TR")} ₺` : null;
}

// Bir aracın kartta/özet listesinde görünecek etiketi.
function vehicleLabel(v) {
  return v.plate?.trim() || [v.brand, v.model].filter(Boolean).join(" ") || "Plakasız araç";
}

function VehicleCard({ vehicle, onOpen }) {
  const insp = dueStatus(vehicle.inspectionDueDate);
  const serv = dueStatus(vehicle.serviceDueDate);
  return (
    <div
      onClick={onOpen}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "1rem",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        background: "var(--card-bg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <Car size={18} strokeWidth={1.75} style={{ flexShrink: 0, opacity: 0.7 }} />
        <strong style={{ fontSize: "1.05rem" }}>{vehicleLabel(vehicle)}</strong>
      </div>
      <small style={{ opacity: 0.7 }}>
        {[vehicle.brand, vehicle.model, vehicle.year].filter(Boolean).join(" · ") || "Marka/model girilmemiş"}
      </small>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", marginTop: "0.2rem" }}>
        {insp ? (
          <DueBadge dateStr={vehicle.inspectionDueDate} />
        ) : vehicle.inspectionDueDate ? (
          <small style={{ opacity: 0.6 }}>Muayene: {vehicle.inspectionDueDate}</small>
        ) : null}
        {serv ? (
          <DueBadge dateStr={vehicle.serviceDueDate} />
        ) : vehicle.serviceDueDate ? (
          <small style={{ opacity: 0.6 }}>Servis/Bakım: {vehicle.serviceDueDate}</small>
        ) : null}
      </div>
      <small style={{ opacity: 0.6, marginTop: "0.2rem" }}>
        {vehicle.history?.length ? `${vehicle.history.length} geçmiş kayıt` : "Geçmiş kaydı yok"}
      </small>
    </div>
  );
}

function VehicleDetailModal({ vehicle, isNew, onClose, onSave, onDelete, onNotify }) {
  const [draft, setDraft] = useState(() => ({ ...vehicle, history: [...(vehicle.history || [])] }));
  const [addingEntry, setAddingEntry] = useState(false);
  const [newEntry, setNewEntry] = useState(newHistoryEntry);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [lightboxPhoto, setLightboxPhoto] = useState(null);
  const [saving, setSaving] = useState(false);

  function set(field, value) {
    setDraft((d) => ({ ...d, [field]: value }));
  }

  async function handlePhotoChange(file) {
    if (!file) return;
    setPhotoBusy(true);
    try {
      const dataUrl = await compressImage(file);
      if (dataUrl.length > MAX_PHOTO_BYTES_AFTER_COMPRESSION) {
        onNotify?.("error", "Fotoğraf sıkıştırıldıktan sonra bile çok büyük — başka bir görsel deneyin.");
        return;
      }
      setNewEntry((e) => ({ ...e, photo: dataUrl }));
    } catch (err) {
      onNotify?.("error", err.message || "Fotoğraf işlenemedi.");
    } finally {
      setPhotoBusy(false);
    }
  }

  function handleAddEntry() {
    if (!newEntry.date) {
      onNotify?.("error", "Kayıt için bir tarih seçin.");
      return;
    }
    setDraft((d) => ({
      ...d,
      history: [...(d.history || []), newEntry],
    }));
    setNewEntry(newHistoryEntry());
    setAddingEntry(false);
  }

  function handleRemoveEntry(entryId) {
    if (!window.confirm("Bu kaydı silmek istediğinize emin misiniz?")) return;
    setDraft((d) => ({ ...d, history: d.history.filter((h) => h.id !== entryId) }));
  }

  async function handleSaveClick() {
    setSaving(true);
    try {
      await onSave(draft);
      onClose();
    } catch (err) {
      onNotify?.("error", err.message || "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteClick() {
    if (!window.confirm(`"${vehicleLabel(draft)}" aracını silmek istediğinize emin misiniz?`)) return;
    setSaving(true);
    try {
      await onDelete(draft.id);
      onClose();
    } catch (err) {
      onNotify?.("error", err.message || "Silinemedi.");
      setSaving(false);
    }
  }

  const sortedHistory = [...(draft.history || [])].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <Modal onClose={onClose} maxWidth={780}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{isNew ? "Yeni Araç" : vehicleLabel(draft)}</h3>

        {/* İki sütunlu sabit grid — form-row'un flex-wrap'ı tek başına kalan
            kutuyu (ör. 3'ü sığıp 4.'nün alt satıra düşmesi) tam genişliğe
            gerip dev görünmesine yol açıyordu. Grid ile her kutu her zaman
            eşit boyutta ve çiftler (Muayene Tarihi/Km, Servis Tarihi/Km)
            hep aynı satırda kalıyor. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
          <label style={{ margin: 0 }}>
            Plaka
            <input value={draft.plate} onChange={(e) => set("plate", e.target.value)} placeholder="34 ABC 123" />
          </label>
          <label style={{ margin: 0 }}>
            Marka
            <input value={draft.brand} onChange={(e) => set("brand", e.target.value)} />
          </label>
          <label style={{ margin: 0 }}>
            Model
            <input value={draft.model} onChange={(e) => set("model", e.target.value)} />
          </label>
          <label style={{ margin: 0 }}>
            Yıl
            <input value={draft.year} onChange={(e) => set("year", e.target.value)} placeholder="2022" />
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem", marginTop: "1rem" }}>
          <label style={{ margin: 0 }}>
            Muayene Tarihi
            <input
              type="date"
              value={draft.inspectionDueDate || ""}
              onChange={(e) => set("inspectionDueDate", e.target.value)}
            />
            <DueBadge dateStr={draft.inspectionDueDate} />
          </label>
          <label style={{ margin: 0 }}>
            Muayene Km
            <input
              type="number"
              min="0"
              value={draft.inspectionKm ?? ""}
              onChange={(e) => set("inspectionKm", e.target.value)}
              placeholder="Km"
            />
          </label>
          <label style={{ margin: 0 }}>
            Servis/Bakım Tarihi
            <input
              type="date"
              value={draft.serviceDueDate || ""}
              onChange={(e) => set("serviceDueDate", e.target.value)}
            />
            <DueBadge dateStr={draft.serviceDueDate} />
          </label>
          <label style={{ margin: 0 }}>
            Servis/Bakım Km
            <input
              type="number"
              min="0"
              value={draft.serviceKm ?? ""}
              onChange={(e) => set("serviceKm", e.target.value)}
              placeholder="Km"
            />
          </label>
        </div>

        <h3 style={{ marginBottom: "0.5rem" }}>Geçmiş Kayıtlar</h3>
        {sortedHistory.length === 0 && !addingEntry && (
          <p style={{ opacity: 0.7 }}>Henüz bir bakım/muayene kaydı eklenmemiş.</p>
        )}
        {sortedHistory.map((entry) => {
          const meta = historyTypeMeta(entry.type);
          const Icon = meta.icon;
          return (
            <div
              key={entry.id}
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-start",
                padding: "0.6rem 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {entry.photo ? (
                <img
                  src={entry.photo}
                  alt="Fatura"
                  onClick={() => setLightboxPhoto(entry.photo)}
                  style={{
                    width: 56,
                    height: 56,
                    objectFit: "cover",
                    borderRadius: 6,
                    cursor: "pointer",
                    flexShrink: 0,
                    border: "1px solid var(--border)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 6,
                    background: "var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    opacity: 0.5,
                  }}
                >
                  <Icon size={22} strokeWidth={1.5} />
                </div>
              )}
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <strong>{meta.label}</strong>
                  <span style={{ opacity: 0.7 }}>— {entry.date}</span>
                </div>
                <div style={{ display: "flex", gap: "0.9rem", flexWrap: "wrap", fontSize: "0.85rem", opacity: 0.85, marginTop: "0.2rem" }}>
                  {formatKm(entry.km) && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      <Gauge size={13} strokeWidth={2} /> {formatKm(entry.km)}
                    </span>
                  )}
                  {formatCost(entry.cost) && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
                      <ReceiptTurkishLira size={13} strokeWidth={2} /> {formatCost(entry.cost)}
                    </span>
                  )}
                </div>
                {entry.note && <div style={{ fontSize: "0.85rem", marginTop: "0.2rem" }}>{entry.note}</div>}
              </div>
              <button
                type="button"
                className="icon-btn delete"
                title="Kaydı sil"
                aria-label="Kaydı sil"
                onClick={() => handleRemoveEntry(entry.id)}
              >
                <TrashIcon />
              </button>
            </div>
          );
        })}

        {addingEntry ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "0.85rem", marginTop: "0.75rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "1rem" }}>
              <label style={{ margin: 0 }}>
                Tarih
                <input
                  type="date"
                  value={newEntry.date}
                  onChange={(e) => setNewEntry((v) => ({ ...v, date: e.target.value }))}
                />
              </label>
              <label style={{ margin: 0 }}>
                Tür
                <select
                  value={newEntry.type}
                  onChange={(e) => setNewEntry((v) => ({ ...v, type: e.target.value }))}
                >
                  {HISTORY_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ margin: 0 }}>
                Km
                <input
                  type="number"
                  min="0"
                  value={newEntry.km}
                  onChange={(e) => setNewEntry((v) => ({ ...v, km: e.target.value }))}
                  placeholder="Km"
                />
              </label>
              <label style={{ margin: 0 }}>
                Tutar (₺)
                <input
                  type="number"
                  min="0"
                  value={newEntry.cost}
                  onChange={(e) => setNewEntry((v) => ({ ...v, cost: e.target.value }))}
                  placeholder="0"
                />
              </label>
            </div>
            <label>
              Açıklama (ne yapıldı/değişti)
              <input
                value={newEntry.note}
                onChange={(e) => setNewEntry((v) => ({ ...v, note: e.target.value }))}
                placeholder="Örn: Yağ ve filtre değişimi, ön fren balatası"
              />
            </label>
            <label>
              Fatura Fotoğrafı
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                <label
                  className="secondary"
                  style={{
                    display: "inline-flex",
                    flexDirection: "row",
                    alignItems: "center",
                    gap: "0.4rem",
                    cursor: "pointer",
                    width: "fit-content",
                    margin: 0,
                  }}
                >
                  <ImagePlus size={16} strokeWidth={1.75} />
                  {photoBusy ? "İşleniyor…" : "Fotoğraf Seç"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => handlePhotoChange(e.target.files[0])}
                  />
                </label>
                {newEntry.photo && (
                  <img
                    src={newEntry.photo}
                    alt="Önizleme"
                    style={{ width: 44, height: 44, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }}
                  />
                )}
              </div>
            </label>
            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.5rem" }}>
              <button type="button" className="primary" onClick={handleAddEntry} disabled={photoBusy}>
                <Plus size={15} strokeWidth={2} style={{ verticalAlign: "-2px" }} /> Kaydı Ekle
              </button>
              <button type="button" className="secondary" onClick={() => setAddingEntry(false)}>
                Vazgeç
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="secondary" style={{ marginTop: "0.5rem" }} onClick={() => setAddingEntry(true)}>
            + Kayıt Ekle
          </button>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "1.5rem" }}>
          {!isNew ? (
            <button type="button" className="danger" onClick={handleDeleteClick} disabled={saving}>
              Aracı Sil
            </button>
          ) : (
            <span />
          )}
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button type="button" className="secondary" onClick={onClose} disabled={saving}>
              Vazgeç
            </button>
            <button type="button" className="primary" onClick={handleSaveClick} disabled={saving}>
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </div>
      </div>

      {lightboxPhoto && (
        <Modal onClose={() => setLightboxPhoto(null)} maxWidth={900}>
          <div style={{ position: "relative" }}>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setLightboxPhoto(null)}
              // Negatif offset dar ekranlarda (azaltılmış popup dolgusuyla) görünüm
              // dışına taşabiliyordu — fotoğrafın üstüne bindirilmiş bir daire artık
              // viewport dolgusundan bağımsız, her zaman görünür.
              style={{ position: "absolute", top: 8, right: 8, background: "var(--card-bg)", borderRadius: "50%" }}
              title="Kapat"
              aria-label="Kapat"
            >
              <X size={18} />
            </button>
            <img src={lightboxPhoto} alt="Fatura" style={{ width: "100%", borderRadius: 8, display: "block" }} />
          </div>
        </Modal>
      )}
    </Modal>
  );
}

export default function VehiclesPage({ vehicles, currentUser, onSaved, onNotify }) {
  const [editing, setEditing] = useState(null); // { vehicle, isNew } | null

  const companyDueSummary = vehicles.flatMap((v) => {
    const label = vehicleLabel(v);
    const items = [];
    const insp = dueStatus(v.inspectionDueDate);
    if (insp) items.push({ ...insp, text: `${label} — Muayene: ${insp.label}` });
    const serv = dueStatus(v.serviceDueDate);
    if (serv) items.push({ ...serv, text: `${label} — Servis/Bakım: ${serv.label}` });
    return items;
  });

  async function handleSaveVehicle(draft) {
    const exists = vehicles.some((v) => v.id === draft.id);
    const nextList = exists ? vehicles.map((v) => (v.id === draft.id ? draft : v)) : [...vehicles, draft];
    const saved = await window.api.setVehicles(nextList, currentUser?.id);
    onSaved(saved);
    onNotify?.("success", "Araç kaydedildi.");
  }

  async function handleDeleteVehicle(id) {
    const nextList = vehicles.filter((v) => v.id !== id);
    const saved = await window.api.setVehicles(nextList, currentUser?.id);
    onSaved(saved);
    onNotify?.("success", "Araç silindi.");
  }

  // Not: kendi <div className="card"> sarmalayıcısı YOK — bu bileşen artık
  // her zaman bir CollapsibleCard'ın (Diğer sekmesi) içine gömülü render
  // ediliyor, o zaten kart kutusunu ve "Araçlar" başlığını sağlıyor.
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "0.75rem" }}>
        <button type="button" className="primary" onClick={() => setEditing({ vehicle: newVehicle(), isNew: true })}>
          <Plus size={16} strokeWidth={2} style={{ verticalAlign: "-2px" }} /> Araç Ekle
        </button>
      </div>

      {companyDueSummary.length > 0 && (
        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.7rem 0.85rem",
            marginBottom: "1rem",
            display: "flex",
            flexDirection: "column",
            gap: "0.3rem",
          }}
        >
          {companyDueSummary.map((item, idx) => {
            const color = item.tone === "overdue" ? "var(--danger)" : "#a15c00";
            const Icon = item.tone === "overdue" ? TriangleAlert : Clock;
            return (
              <span key={idx} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem", color }}>
                <Icon size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                {item.text}
              </span>
            );
          })}
        </div>
      )}

      {vehicles.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <CarRepairIllustration />
          <p>Henüz araç eklenmemiş.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "0.85rem" }}>
          {vehicles.map((v) => (
            <VehicleCard key={v.id} vehicle={v} onOpen={() => setEditing({ vehicle: v, isNew: false })} />
          ))}
        </div>
      )}

      {editing && (
        <VehicleDetailModal
          vehicle={editing.vehicle}
          isNew={editing.isNew}
          onClose={() => setEditing(null)}
          onSave={handleSaveVehicle}
          onDelete={handleDeleteVehicle}
          onNotify={onNotify}
        />
      )}
    </div>
  );
}
