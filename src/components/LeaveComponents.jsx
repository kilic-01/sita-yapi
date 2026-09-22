import { useMemo, useState } from "react";
import { TrashIcon } from "./icons.jsx";
import {
  suggestAnnualLeaveDays,
  countDeductibleLeaveDays,
  countDeductibleLeaveDaysInYear,
  fullYearsOfService,
  totalDeductibleLeaveDaysUpTo,
  todayISO,
} from "../lib/format.js";
import Modal from "./Modal.jsx";

// Teknisyenler VE ofis çalışanları için ortak izin-aralığı düzenleme
// listesi — her ikisinde de aynı {id, startDate, endDate} şeklinde.
export function LeaveRangesEditor({ leaves, onChange, holidays = [] }) {
  function addLeave() {
    onChange([...leaves, { id: crypto.randomUUID(), startDate: "", endDate: "" }]);
  }
  function updateLeave(leaveId, field, value) {
    onChange(leaves.map((l) => (l.id === leaveId ? { ...l, [field]: value } : l)));
  }
  function removeLeave(leaveId) {
    onChange(leaves.filter((l) => l.id !== leaveId));
  }

  return (
    <div style={{ marginTop: "1rem" }}>
      <label style={{ display: "block", marginBottom: "0.4rem" }}>Yıllık İzinler</label>
      {leaves.length === 0 && <small style={{ opacity: 0.7 }}>Kayıtlı izin yok.</small>}
      {leaves.map((l) => (
        <div key={l.id} style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.4rem" }}>
          <input type="date" value={l.startDate} onChange={(e) => updateLeave(l.id, "startDate", e.target.value)} />
          <span>—</span>
          <input type="date" value={l.endDate} onChange={(e) => updateLeave(l.id, "endDate", e.target.value)} />
          {l.startDate && l.endDate && l.startDate <= l.endDate && (
            <small style={{ opacity: 0.7, whiteSpace: "nowrap" }}>
              ({countDeductibleLeaveDays(l.startDate, l.endDate, holidays)} gün)
            </small>
          )}
          <button
            type="button"
            className="icon-btn delete"
            title="İzni kaldır"
            aria-label="İzni kaldır"
            onClick={() => removeLeave(l.id)}
          >
            <TrashIcon />
          </button>
        </div>
      ))}
      <button type="button" className="secondary" onClick={addLeave}>
        + İzin Ekle
      </button>
    </div>
  );
}

function formatDateOnly(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

// Teknisyenler VE ofis çalışanları için ortak yıllık izin tablosu —
// `people` en azından {id, name, leaves, annualLeaveDays, hireDate} alanları
// olan herhangi bir liste olabilir. Sadece yönetici hesapların erişebildiği
// Ayarlar > Çalışanlar bölümünden açılır (bkz. App.jsx: "settings" sekmesi
// `currentUser.role === "admin"` şartına bağlı).
export function LeaveSummaryModal({ title = "Yıllık İzin Tablosu", people, holidays = [], onClose }) {
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => {
    const set = new Set([currentYear]);
    people.forEach((p) =>
      (p.leaves || []).forEach((l) => {
        if (l.startDate) set.add(Number(l.startDate.slice(0, 4)));
        if (l.endDate) set.add(Number(l.endDate.slice(0, 4)));
      })
    );
    return [...set].sort((a, b) => b - a);
  }, [people, currentYear]);
  const [year, setYear] = useState(currentYear);
  const [expandedId, setExpandedId] = useState(null);

  // "Kalan" izin, kullanılmayan yıllardan devreder — o yüzden seçili yılı
  // tek başına izole etmiyoruz, o yılın SONUNA (ya da güncel yılsa bugüne)
  // kadar hak edilmiş TOPLAM gün ile o ana kadar kullanılmış TOPLAM günü
  // kıyaslayan kümülatif bir bakiye hesaplıyoruz.
  const asOfDateISO = year === currentYear ? todayISO() : `${year}-12-31`;
  const asOfDate = year === currentYear ? new Date() : new Date(year, 11, 31);

  const rows = people.map((p) => {
    const leavesInYear = (p.leaves || [])
      .map((l) => ({ ...l, days: countDeductibleLeaveDaysInYear(l.startDate, l.endDate, year, holidays) }))
      .filter((l) => l.days > 0)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    const used = leavesInYear.reduce((sum, l) => sum + l.days, 0);

    const perYearRate = p.annualLeaveDays ?? suggestAnnualLeaveDays(p.hireDate);
    // İşe başlama tarihi bilinmiyorsa kaç yıldır çalıştığını (dolayısıyla
    // devreden bakiyeyi) hesaplayamayız — o durumda eski, tek-yıllık
    // davranışa (devretme yok) geri düşülür.
    const yearsEarned = p.hireDate ? Math.max(1, fullYearsOfService(p.hireDate, asOfDate)) : 1;
    const totalEarned = perYearRate * yearsEarned;
    const totalUsed = totalDeductibleLeaveDaysUpTo(p.leaves, asOfDateISO, holidays);
    const remaining = totalEarned - totalUsed;

    return { person: p, used, perYearRate, remaining, leavesInYear };
  });

  return (
    <Modal onClose={onClose} maxWidth={720}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>{title}</h3>
        <label style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
          Yıl
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        {rows.length === 0 ? (
          <p>Henüz kimse eklenmedi.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.4rem 0.4rem 0.4rem 0" }}>İsim</th>
                <th style={{ padding: "0.4rem" }}>Yıllık Hak</th>
                <th style={{ padding: "0.4rem" }}>Bu Yıl Kullanılan</th>
                <th style={{ padding: "0.4rem" }}>Toplam Kalan</th>
                <th style={{ padding: "0.4rem" }} />
              </tr>
            </thead>
            {rows.map(({ person, used, perYearRate, remaining, leavesInYear }) => (
              <tbody key={person.id}>
                <tr style={{ borderBottom: expandedId === person.id ? "none" : "1px solid var(--border)" }}>
                    <td style={{ padding: "0.4rem 0.4rem 0.4rem 0" }}>{person.name}</td>
                    <td style={{ padding: "0.4rem" }}>{perYearRate} gün</td>
                    <td style={{ padding: "0.4rem" }}>{used} gün</td>
                    <td
                      style={{
                        padding: "0.4rem",
                        fontWeight: 700,
                        color: remaining < 0 ? "var(--danger)" : undefined,
                      }}
                    >
                      {remaining} gün
                    </td>
                    <td style={{ padding: "0.4rem", textAlign: "right" }}>
                      {leavesInYear.length > 0 && (
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => setExpandedId(expandedId === person.id ? null : person.id)}
                        >
                          {expandedId === person.id ? "Gizle" : "Tarihler"}
                        </button>
                      )}
                    </td>
                </tr>
                {expandedId === person.id && (
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <td colSpan={5} style={{ padding: "0 0.4rem 0.6rem 0" }}>
                      {leavesInYear.map((l) => (
                        <div key={l.id} style={{ display: "flex", gap: "0.75rem", padding: "0.2rem 0" }}>
                          <span>
                            {formatDateOnly(l.startDate)} — {formatDateOnly(l.endDate)}
                          </span>
                          <small style={{ opacity: 0.7 }}>({l.days} gün)</small>
                        </div>
                      ))}
                    </td>
                  </tr>
                )}
              </tbody>
            ))}
          </table>
        )}
        <p style={{ marginTop: "0.75rem" }}>
          <small style={{ opacity: 0.7 }}>
            "Toplam Kalan", o kişinin işe başladığından bu yana hak ettiği TÜM izin günlerinden bugüne kadar
            kullandığı TÜM günler çıkarılarak hesaplanır — kullanılmayan izin bir sonraki yıla devreder, her
            yıl sıfırlanmaz. Seçtiğiniz yıl güncel yıldan eskiyse bakiye o yılın SONU itibarıyladır. İşe
            başlama tarihi girilmemiş kişilerde devir hesaplanamaz, sadece o yılın hakkı esas alınır.
            Cumartesi günleri izin süresinden düşülür, pazar günleri (haftalık tatil) düşülmez. Resmi/dini
            bayram günleri henüz hesaba katılmıyor.
          </small>
        </p>
        <div style={{ marginTop: "0.5rem" }}>
          <button type="button" className="primary" onClick={onClose}>
            Kapat
          </button>
        </div>
      </div>
    </Modal>
  );
}
