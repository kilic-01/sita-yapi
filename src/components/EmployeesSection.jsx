import { useState } from "react";
import { TrashIcon } from "./icons.jsx";
import { TechnicianAvatar, PhotoCropEditor } from "../lib/avatars.jsx";
import { isOnLeave, todayISO, suggestAnnualLeaveDays } from "../lib/format.js";
import { LeaveRangesEditor, LeaveSummaryModal } from "./LeaveComponents.jsx";
import Modal from "./Modal.jsx";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

// Teknisyenler VE ofis çalışanları TEK bir "Çalışanlar" listesi olarak
// gösteriliyor, ama veri tabanında iki ayrı tablo olarak kalmaya devam
// ediyor (technicians / officeStaff) — çünkü randevu atama, rota
// oluşturma ve haritadaki teknisyen renkleri gibi pek çok yer SADECE
// "technicians" tablosuna bağlı. Popup'taki "Tür" seçimi hangi tabloya
// kaydedileceğini belirliyor; tür sonradan değiştirilirse kayıt bir
// tablodan silinip diğerine taşınır.
function EditEmployeeModal({
  employee,
  technicians,
  officeStaff,
  holidays,
  vehicles,
  appointments,
  currentUser,
  onClose,
  onTechniciansSaved,
  onOfficeStaffSaved,
  onNotify,
  onLeaveConflicts,
}) {
  const isNew = !employee;
  const [kind, setKind] = useState(employee?.kind || "technician");
  const [name, setName] = useState(employee?.name || "");
  const [phone, setPhone] = useState(employee?.phone || "");
  const [vehicleId, setVehicleId] = useState(employee?.vehicleId || "");
  const [assignable, setAssignable] = useState(employee?.assignable ?? true);
  const [photo, setPhoto] = useState(employee?.photo || "");
  const [photoPosition, setPhotoPosition] = useState(employee?.photoPosition || { x: 50, y: 50 });
  const [leaves, setLeaves] = useState(employee?.leaves || []);
  const [hireDate, setHireDate] = useState(employee?.hireDate || "");
  const [annualLeaveDays, setAnnualLeaveDays] = useState(
    employee?.annualLeaveDays ?? suggestAnnualLeaveDays(employee?.hireDate)
  );
  const [daysManuallySet, setDaysManuallySet] = useState(false);
  const [cropTarget, setCropTarget] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function handleHireDateChange(value) {
    setHireDate(value);
    if (!daysManuallySet) setAnnualLeaveDays(suggestAnnualLeaveDays(value));
  }
  function handleDaysChange(value) {
    setDaysManuallySet(true);
    setAnnualLeaveDays(value);
  }

  function handleFileChange(file) {
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      window.alert("Fotoğraf dosyası çok büyük (2 MB üstü). Daha küçük bir görsel seçin.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropTarget(reader.result);
    reader.readAsDataURL(file);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Ad Soyad boş olamaz.");
      return;
    }
    const cleanLeaves = leaves
      .filter((l) => l.startDate && l.endDate)
      .map((l) => ({ id: l.id, startDate: l.startDate, endDate: l.endDate }));
    if (cleanLeaves.some((l) => l.startDate > l.endDate)) {
      setError("İzin başlangıç tarihi bitiş tarihinden sonra olamaz.");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const id = employee?.id || crypto.randomUUID();
      const common = {
        id,
        name: name.trim(),
        phone,
        photo,
        photoPosition,
        leaves: cleanLeaves,
        hireDate: hireDate || null,
        annualLeaveDays: Number(annualLeaveDays) || 0,
      };
      const kindChanged = employee && employee.kind !== kind;

      let savedTechnicians = technicians;
      let savedOfficeStaff = officeStaff;

      if (kind === "technician") {
        const patch = { ...common, vehicleId: vehicleId || null, assignable };
        const nextTechnicians = employee && !kindChanged
          ? technicians.map((t) => (t.id === id ? { ...t, ...patch } : t))
          : [...technicians, patch];
        savedTechnicians = await window.api.setTechnicians(nextTechnicians, currentUser?.id);
        onTechniciansSaved(savedTechnicians);
        if (kindChanged) {
          savedOfficeStaff = await window.api.setOfficeStaff(
            officeStaff.filter((s) => s.id !== id),
            currentUser?.id
          );
          onOfficeStaffSaved(savedOfficeStaff);
        }
      } else {
        const nextOfficeStaff = employee && !kindChanged
          ? officeStaff.map((s) => (s.id === id ? { ...s, ...common } : s))
          : [...officeStaff, common];
        savedOfficeStaff = await window.api.setOfficeStaff(nextOfficeStaff, currentUser?.id);
        onOfficeStaffSaved(savedOfficeStaff);
        if (kindChanged) {
          savedTechnicians = await window.api.setTechnicians(
            technicians.filter((t) => t.id !== id),
            currentUser?.id
          );
          onTechniciansSaved(savedTechnicians);
        }
      }

      onNotify("success", isNew ? "Çalışan eklendi." : "Çalışan güncellendi.");

      onClose();

      if (kind === "technician") {
        const savedTechnician = savedTechnicians.find((t) => t.id === id);
        const conflicts = (appointments || []).filter(
          (a) =>
            a.assignedTechnicianId === id &&
            a.status === "routed" &&
            !a.heldForLeave &&
            isOnLeave(savedTechnician, a.scheduledDate)
        );
        if (conflicts.length && onLeaveConflicts) {
          onLeaveConflicts(savedTechnician, conflicts);
        }
      }
    } catch (err) {
      setError(err.message || "Kaydedilemedi.");
      onNotify("error", err.message || "Kaydedilemedi.");
    } finally {
      setBusy(false);
    }
  }

  if (cropTarget) {
    return (
      <Modal onClose={() => setCropTarget(null)}>
        <div className="card">
          <PhotoCropEditor
            photo={cropTarget}
            initialPosition={{ x: 50, y: 50 }}
            onCancel={() => setCropTarget(null)}
            onSave={(pos) => {
              setPhoto(cropTarget);
              setPhotoPosition(pos);
              setCropTarget(null);
            }}
          />
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{isNew ? "Yeni Çalışan" : "Çalışanı Düzenle"}</h3>
        {error && <div className="error">{error}</div>}
        <form onSubmit={handleSave}>
          <div className="form-row">
            <label>
              Tür
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="technician">Teknisyen</option>
                <option value="office">Ofis Çalışanı</option>
              </select>
            </label>
            <label>
              Ad Soyad
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              Telefon
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="05xx xxx xx xx" />
            </label>
          </div>

          {kind === "technician" && (
            <div className="form-row" style={{ marginTop: "0.75rem", alignItems: "flex-end" }}>
              <label>
                Araç
                <select value={vehicleId || ""} onChange={(e) => setVehicleId(e.target.value || null)}>
                  <option value="">Araç seçilmedi</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {[v.plate, v.brand, v.model].filter(Boolean).join(" - ") || "(isimsiz araç)"}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexDirection: "row" }}>
                <input
                  type="checkbox"
                  checked={assignable}
                  onChange={(e) => setAssignable(e.target.checked)}
                />
                İş Atanabilir
              </label>
            </div>
          )}

          <div className="form-row" style={{ marginTop: "0.75rem" }}>
            <label>
              İşe Başlama Tarihi
              <input type="date" value={hireDate} onChange={(e) => handleHireDateChange(e.target.value)} />
            </label>
            <label>
              Yıllık İzin Hakkı (gün)
              <input
                type="number"
                min={0}
                value={annualLeaveDays}
                onChange={(e) => handleDaysChange(e.target.value)}
              />
              <small style={{ opacity: 0.7 }}>
                İşe başlama tarihine göre İş Kanunu'na uygun önerilir (1-5 yıl: 14, 5-15 yıl: 20, 15+ yıl: 26
                gün), gerekirse elle değiştirebilirsiniz.
              </small>
            </label>
          </div>

          <LeaveRangesEditor leaves={leaves} onChange={setLeaves} holidays={holidays} />

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "1rem" }}>
            <TechnicianAvatar
              technician={{ id: employee?.id, name, photo, photoPosition }}
              technicians={technicians.concat(officeStaff)}
              size={56}
            />
            <label style={{ flex: 1 }}>
              Profil Fotoğrafı (opsiyonel — yoksa otomatik bir avatar atanır)
              <input type="file" accept="image/*" onChange={(e) => handleFileChange(e.target.files[0])} />
            </label>
            {photo && (
              <button type="button" className="secondary" onClick={() => setPhoto("")}>
                Fotoğrafı Kaldır
              </button>
            )}
          </div>

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

function LeaveConflictModal({ technician, conflicts, technicians, currentUser, onClose, onNotify }) {
  const [resolvedIds, setResolvedIds] = useState(new Set());
  const [reassignTarget, setReassignTarget] = useState({});
  const [busyId, setBusyId] = useState(null);

  const remaining = conflicts.filter((c) => !resolvedIds.has(c.id));

  async function handleReassign(appointment) {
    const targetId = reassignTarget[appointment.id];
    if (!targetId) {
      onNotify("error", "Önce bir teknisyen seçin.");
      return;
    }
    setBusyId(appointment.id);
    try {
      await window.api.reassignAppointment(appointment.id, targetId, currentUser?.id);
      setResolvedIds((prev) => new Set(prev).add(appointment.id));
      onNotify("success", `${appointment.customerName} başka teknisyene atandı.`);
    } catch (err) {
      onNotify("error", err.message || "Atanamadı.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleHold(appointment) {
    setBusyId(appointment.id);
    try {
      await window.api.holdAppointmentForLeave(appointment.id, currentUser?.id);
      setResolvedIds((prev) => new Set(prev).add(appointment.id));
      onNotify("success", `${appointment.customerName} bu teknisyende beklemeye alındı.`);
    } catch (err) {
      onNotify("error", err.message || "İşlem başarısız.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={640}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{technician.name} İzinliyken Atanmış Randevular</h3>
        <p>
          Bu teknisyene, eklediğiniz izin tarihlerinde zaten atanmış {conflicts.length} randevu var. Her biri
          için başka bir teknisyene atayın ya da bu teknisyende bekletin — bekletilenler, teknisyen izinden
          dönünce Anasayfa'da tekrar hatırlatılır.
        </p>
        {remaining.length === 0 && (
          <p>
            <strong>Tüm çakışmalar çözüldü.</strong>
          </p>
        )}
        {remaining.map((a) => (
          <div key={a.id} style={{ borderBottom: "1px solid var(--border)", padding: "0.6rem 0" }}>
            <strong>{a.customerName}</strong> — {a.scheduledDate}
            <div>{a.address}</div>
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
              <select
                value={reassignTarget[a.id] || ""}
                onChange={(e) => setReassignTarget((prev) => ({ ...prev, [a.id]: e.target.value }))}
              >
                <option value="">Teknisyen seç…</option>
                {technicians
                  .filter((t) => t.id !== technician.id && !isOnLeave(t, a.scheduledDate) && t.assignable !== false)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                className="secondary"
                disabled={busyId === a.id}
                onClick={() => handleReassign(a)}
              >
                Başka Teknisyene Ata
              </button>
              <button type="button" className="secondary" disabled={busyId === a.id} onClick={() => handleHold(a)}>
                Bu Teknisyende Beklet
              </button>
            </div>
          </div>
        ))}
        <div style={{ marginTop: "1rem" }}>
          <button type="button" className="primary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function EmployeesSection({
  technicians,
  officeStaff,
  holidays,
  vehicles,
  appointments,
  currentUser,
  onTechniciansSaved,
  onOfficeStaffSaved,
  onNotify,
}) {
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [conflictState, setConflictState] = useState(null);
  const [showLeaveSummary, setShowLeaveSummary] = useState(false);

  const employees = [
    ...technicians.map((t) => ({ ...t, kind: "technician" })),
    ...officeStaff.map((s) => ({ ...s, kind: "office" })),
  ].sort((a, b) => a.name.localeCompare(b.name, "tr"));

  async function handleDelete(employee) {
    if (!window.confirm(`"${employee.name}" adlı çalışanı silmek istediğinize emin misiniz?`)) return;
    try {
      if (employee.kind === "technician") {
        const saved = await window.api.setTechnicians(
          technicians.filter((t) => t.id !== employee.id),
          currentUser?.id
        );
        onTechniciansSaved(saved);
      } else {
        const saved = await window.api.setOfficeStaff(
          officeStaff.filter((s) => s.id !== employee.id),
          currentUser?.id
        );
        onOfficeStaffSaved(saved);
      }
      onNotify("success", "Çalışan silindi.");
    } catch (err) {
      onNotify("error", err.message || "Silinemedi.");
    }
  }

  return (
    <>
      {employees.length === 0 && <p>Henüz çalışan eklenmedi.</p>}
      {employees.map((e) => (
        <div
          key={e.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            borderBottom: "1px solid var(--border)",
            padding: "0.6rem 0",
          }}
        >
          <TechnicianAvatar technician={e} technicians={employees} size={32} />
          <strong style={{ flex: 1 }}>{e.name}</strong>
          <span className="badge">{e.kind === "technician" ? "Teknisyen" : "Ofis"}</span>
          {e.kind === "technician" && e.assignable === false && <span className="badge">Atanamaz</span>}
          {isOnLeave(e, todayISO()) && <span className="badge">İzinli</span>}
          <button type="button" className="secondary" onClick={() => setEditingEmployee(e)}>
            Düzenle
          </button>
          <button
            type="button"
            className="icon-btn delete"
            title="Çalışanı sil"
            aria-label="Çalışanı sil"
            onClick={() => handleDelete(e)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
        <button type="button" className="primary" onClick={() => setShowAdd(true)}>
          + Çalışan Ekle
        </button>
        <button type="button" className="secondary" onClick={() => setShowLeaveSummary(true)}>
          Yıllık İzin Tablosu
        </button>
      </div>

      {showLeaveSummary && (
        <LeaveSummaryModal
          title="Çalışanlar — Yıllık İzin Tablosu"
          people={employees}
          holidays={holidays}
          onClose={() => setShowLeaveSummary(false)}
        />
      )}

      {(editingEmployee || showAdd) && (
        <EditEmployeeModal
          employee={editingEmployee}
          technicians={technicians}
          officeStaff={officeStaff}
          holidays={holidays}
          vehicles={vehicles}
          appointments={appointments}
          currentUser={currentUser}
          onClose={() => {
            setEditingEmployee(null);
            setShowAdd(false);
          }}
          onTechniciansSaved={onTechniciansSaved}
          onOfficeStaffSaved={onOfficeStaffSaved}
          onNotify={onNotify}
          onLeaveConflicts={(technician, conflicts) => setConflictState({ technician, conflicts })}
        />
      )}
      {conflictState && (
        <LeaveConflictModal
          technician={conflictState.technician}
          conflicts={conflictState.conflicts}
          technicians={technicians}
          currentUser={currentUser}
          onClose={() => setConflictState(null)}
          onNotify={onNotify}
        />
      )}
    </>
  );
}
