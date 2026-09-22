import { useMemo, useState } from "react";
import { PencilIcon, TrashIcon } from "./icons.jsx";
import { formatDateTime, STATUS_LABELS, todayISO } from "../lib/format.js";
import { EmptyStateIllustration } from "./illustrations.jsx";

export default function AppointmentList({
  appointments,
  technicians,
  users,
  currentUser,
  onDelete,
  onEdit,
  onStatusChange,
  onOpenCustomerProfile,
}) {
  const [search, setSearch] = useState("");
  // Varsayılan olarak sadece BUGÜNÜN randevuları gösterilir — binlerce
  // randevunun (ör. içe aktarılmış geçmiş kayıtlar) tek listede birikip
  // güncel/aktif randevuları gözden kaybetmesini önler. Tarih alanından
  // başka bir gün seçilince o günün randevuları gösterilir. Arama
  // yapılırken (müşteri bulmak için) tarih sınırı tamamen kaldırılır —
  // tüm tarihlerdeki eşleşmeler (geçmiş kayıtlar dahil) görünür.
  const [dateFilter, setDateFilter] = useState(todayISO());
  const techName = (id) => technicians.find((t) => t.id === id)?.name || "-";
  const userName = (id) => users.find((u) => u.id === id)?.name || "-";
  const isAdmin = currentUser?.role === "admin";

  // Binlerce içe aktarılmış geçmiş kayıt varken kısa/yaygın bir arama terimi
  // (ör. tek bir harf) on binlerce satırla eşleşebiliyor — bunların hepsini
  // aynı anda tabloya basmak sayfayı (hatta tüm uygulamayı) kilitleyip
  // çökertebiliyor. Bu yüzden arama sonuçları bir üst sınırla kesiliyor;
  // kullanıcıya daha spesifik arama yapması için bir uyarı gösteriliyor.
  const MAX_SEARCH_RESULTS = 300;

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("tr");
    const phoneTerm = search.replace(/\D/g, "");
    return appointments.filter((a) => {
      // Arama yokken her zaman tek bir güne kilitli — tarih alanı temizlenirse
      // (elle silinirse) "tüm randevular" değil, boş bir liste gösterilir;
      // binlerce randevunun yeniden tek listede birikmesinin tek yolu budur.
      if (!term) return a.scheduledDate === dateFilter;
      const nameOrAddressMatch =
        a.customerName.toLocaleLowerCase("tr").includes(term) ||
        (a.contactName || "").toLocaleLowerCase("tr").includes(term) ||
        a.address.toLocaleLowerCase("tr").includes(term);
      const phoneMatch =
        phoneTerm.length > 0 && (a.customerPhone || "").replace(/\D/g, "").includes(phoneTerm);
      return nameOrAddressMatch || phoneMatch;
    });
  }, [appointments, search, dateFilter]);

  const isSearching = search.trim().length > 0;
  const visibleRows = isSearching ? filtered.slice(0, MAX_SEARCH_RESULTS) : filtered;
  const hiddenResultCount = filtered.length - visibleRows.length;

  function handleDelete(a) {
    if (window.confirm(`"${a.customerName}" randevusunu silmek istediğinize emin misiniz?`)) {
      onDelete(a.id);
    }
  }

  function handleCall(a) {
    if (window.confirm(`${a.customerName} (${a.customerPhone}) numarasını aramak istediğinize emin misiniz?`)) {
      window.api.callPhone(a.customerPhone);
    }
  }

  return (
    <div className="card">
      <h3>Randevular</h3>
      {appointments.length > 0 && (
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label style={{ maxWidth: 360, flex: 1 }}>
            Ara
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Müşteri adı, adres veya telefon…"
            />
          </label>
          <label>
            Tarih
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
          </label>
          {dateFilter !== todayISO() && (
            <button type="button" className="secondary" onClick={() => setDateFilter(todayISO())}>
              Bugün
            </button>
          )}
        </div>
      )}
      {appointments.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <EmptyStateIllustration />
          <p>Henüz randevu eklenmedi.</p>
        </div>
      ) : filtered.length === 0 ? (
        <p>{dateFilter ? "Bu tarihte randevu bulunamadı." : "Aramanızla eşleşen randevu bulunamadı."}</p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {hiddenResultCount > 0 && (
            <p style={{ color: "var(--danger)" }}>
              {filtered.length} sonuç bulundu, ilk {MAX_SEARCH_RESULTS} tanesi gösteriliyor. Daha spesifik bir
              arama yapın (ör. tam ad veya telefon numarası) — {hiddenResultCount} sonuç daha var.
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>Müşteri</th>
                <th>Muhatap Kişi</th>
                <th>Telefon</th>
                <th>Adres</th>
                <th>Şikayet</th>
                <th>Tahmini Süre</th>
                <th>Aciliyet</th>
                <th>Gün</th>
                <th>Kayıt Tarihi</th>
                <th>Durum</th>
                <th>Ücret</th>
                <th>Teknisyen</th>
                {isAdmin && <th>Ekleyen</th>}
                {isAdmin && <th>Düzenleyen</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((a) => (
                <tr key={a.id}>
                  <td>
                    {onOpenCustomerProfile ? (
                      <button
                        type="button"
                        onClick={() => onOpenCustomerProfile(a)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--accent)",
                          cursor: "pointer",
                          textDecoration: "underline",
                          font: "inherit",
                        }}
                      >
                        {a.customerName}
                      </button>
                    ) : (
                      a.customerName
                    )}
                  </td>
                  <td>{a.contactName || "-"}</td>
                  <td>
                    {a.customerPhone ? (
                      <button
                        onClick={() => handleCall(a)}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          color: "var(--accent)",
                          cursor: "pointer",
                          font: "inherit",
                          textDecoration: "underline",
                        }}
                        title="Ara"
                      >
                        {a.customerPhone}
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{a.address}</td>
                  <td>{a.complaint}</td>
                  <td>{a.estimatedDurationMinutes ? `${a.estimatedDurationMinutes} dk` : "-"}</td>
                  <td>
                    <span className={`badge ${a.urgency}`}>
                      {a.urgency === "acil" ? "Acil" : "Normal"}
                    </span>
                  </td>
                  <td>{a.scheduledDate}</td>
                  <td>{formatDateTime(a.createdAt)}</td>
                  <td>
                    <select value={a.status} onChange={(e) => onStatusChange(a.id, e.target.value)}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {a.feeAmount != null ? (
                      <>
                        {a.feeAmount.toLocaleString("tr-TR")} TL
                        {a.feeItems?.length > 0 && (
                          <>
                            <br />
                            <small style={{ opacity: 0.7 }}>
                              {a.feeItems
                                .map((it) => `${it.label}: ${(it.amount || 0).toLocaleString("tr-TR")}`)
                                .join(" · ")}
                            </small>
                          </>
                        )}
                        <br />
                        <small style={{ color: a.feePaid ? "var(--accent)" : "var(--danger)" }}>
                          {a.feePaid ? "Tahsil edildi" : "Bekliyor"}
                        </small>
                      </>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{a.assignedTechnicianId ? techName(a.assignedTechnicianId) : "-"}</td>
                  {isAdmin && <td>{userName(a.createdBy)}</td>}
                  {isAdmin && (
                    <td>
                      {a.updatedBy ? (
                        <>
                          {userName(a.updatedBy)}
                          <br />
                          <small>{formatDateTime(a.updatedAt)}</small>
                        </>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                  <td>
                    <button className="icon-btn edit" title="Düzenle" aria-label="Düzenle" onClick={() => onEdit(a)}>
                      <PencilIcon />
                    </button>
                    <button className="icon-btn delete" title="Sil" aria-label="Sil" onClick={() => handleDelete(a)}>
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
