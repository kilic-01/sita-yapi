import { useMemo, useState } from "react";
import { formatDateTime, STATUS_LABELS } from "../lib/format.js";
import TechnicianRevenueModal from "./TechnicianRevenueModal.jsx";
import { FEE_CATEGORIES } from "./AppointmentForm.jsx";

function toDate(scheduledDate) {
  return new Date(`${scheduledDate}T00:00:00`);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function HistoryPage({ appointments, technicians, users, currentUser, isDark }) {
  const isAdmin = currentUser?.role === "admin";
  const [technicianId, setTechnicianId] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedRevenueRow, setSelectedRevenueRow] = useState(null);
  const [search, setSearch] = useState("");

  const routed = useMemo(
    () => appointments.filter((a) => a.status === "routed"),
    [appointments]
  );

  const summary = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(today);
    const monthStart = startOfMonth(today);

    return technicians.map((t) => {
      const techJobs = routed.filter((a) => a.assignedTechnicianId === t.id);
      return {
        technician: t,
        daily: techJobs.filter((a) => toDate(a.scheduledDate).getTime() === today.getTime()).length,
        weekly: techJobs.filter((a) => toDate(a.scheduledDate) >= weekStart).length,
        monthly: techJobs.filter((a) => toDate(a.scheduledDate) >= monthStart).length,
        total: techJobs.length,
      };
    });
  }, [routed, technicians]);

  const revenue = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = startOfWeek(today);
    const monthStart = startOfMonth(today);
    const billable = appointments.filter((a) => a.feeAmount != null && a.assignedTechnicianId);
    const sum = (list) => list.reduce((total, a) => total + a.feeAmount, 0);

    // Her ücret kalemi artık Servis/Montaj/Ürün Satışı kategorilerinden
    // birine etiketleniyor (bkz. AppointmentForm.jsx, FEE_CATEGORIES) — bu
    // sayede "teknisyen bu üç kalemden ne kadar kazandı" sorusuna serbest
    // metin etiketlere göre tahmin YAPMADAN, kesin bir cevap verebiliyoruz.
    // Kategorisi olmayan (eski) kayıtlar "Ürün Satışı"na düşer.
    function itemBreakdown(jobs) {
      const totals = Object.fromEntries(FEE_CATEGORIES.map((c) => [c.value, 0]));
      for (const a of jobs) {
        // Bu kalemli sistemden ÖNCEKİ kayıtlarda feeItems hiç yok ama
        // feeAmount (tek toplam) var — o eski toplam olduğu gibi kaybolmasın
        // diye "Ürün Satışı" kovasına düşürülür (aksi halde bu teknisyenin
        // gerçek, gözle görülür cirosu olsa bile pasta grafiği bomboş kalırdı).
        if (!a.feeItems?.length) {
          if (a.feeAmount) totals.parca += Number(a.feeAmount) || 0;
          continue;
        }
        for (const it of a.feeItems) {
          const cat = totals[it.category] != null ? it.category : "parca";
          totals[cat] += Number(it.amount) || 0;
        }
      }
      return FEE_CATEGORIES.map((c) => ({ category: c.value, label: c.label, amount: totals[c.value] }));
    }

    return technicians.map((t) => {
      const jobs = billable.filter((a) => a.assignedTechnicianId === t.id);
      return {
        technician: t,
        daily: sum(jobs.filter((a) => toDate(a.scheduledDate).getTime() === today.getTime())),
        weekly: sum(jobs.filter((a) => toDate(a.scheduledDate) >= weekStart)),
        monthly: sum(jobs.filter((a) => toDate(a.scheduledDate) >= monthStart)),
        total: sum(jobs),
        breakdown: itemBreakdown(jobs),
      };
    });
  }, [appointments, technicians]);

  function formatTL(amount) {
    return `${amount.toLocaleString("tr-TR")} TL`;
  }

  const hasSearch = search.trim().length > 0;

  const filtered = useMemo(() => {
    if (!hasSearch) return [];
    const term = search.trim().toLocaleLowerCase("tr");
    const phoneTerm = search.replace(/\D/g, "");
    return appointments
      .filter((a) => technicianId === "all" || a.assignedTechnicianId === technicianId)
      .filter((a) => !dateFrom || a.scheduledDate >= dateFrom)
      .filter((a) => !dateTo || a.scheduledDate <= dateTo)
      .filter((a) => {
        const nameOrAddressMatch =
          a.customerName.toLocaleLowerCase("tr").includes(term) ||
          (a.contactName || "").toLocaleLowerCase("tr").includes(term) ||
          a.address.toLocaleLowerCase("tr").includes(term);
        const phoneMatch =
          phoneTerm.length > 0 && (a.customerPhone || "").replace(/\D/g, "").includes(phoneTerm);
        return nameOrAddressMatch || phoneMatch;
      })
      .sort((a, b) => (a.scheduledDate < b.scheduledDate ? 1 : -1) || (a.stopOrder ?? 0) - (b.stopOrder ?? 0));
  }, [appointments, technicianId, dateFrom, dateTo, search, hasSearch]);

  const techName = (id) => technicians.find((t) => t.id === id)?.name || "-";
  const userName = (id) => users.find((u) => u.id === id)?.name || "-";

  return (
    <div>
      <div className="card">
        <h3>Teknisyen Bazlı İş Sayıları</h3>
        <table>
          <thead>
            <tr>
              <th>Teknisyen</th>
              <th>Bugün</th>
              <th>Bu Hafta</th>
              <th>Bu Ay</th>
              <th>Toplam</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.technician.id}>
                <td>{row.technician.name}</td>
                <td>{row.daily}</td>
                <td>{row.weekly}</td>
                <td>{row.monthly}</td>
                <td>{row.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h3>Teknisyen Bazlı Ciro</h3>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th>Teknisyen</th>
                <th>Bugün</th>
                <th>Bu Hafta</th>
                <th>Bu Ay</th>
                <th>Toplam</th>
                <th>Kalem Bazlı Dağılım (Toplam)</th>
              </tr>
            </thead>
            <tbody>
              {revenue.map((row) => (
                <tr key={row.technician.id}>
                  <td>
                    <button
                      type="button"
                      onClick={() => setSelectedRevenueRow(row)}
                      style={{
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: "var(--accent)",
                        cursor: "pointer",
                        font: "inherit",
                        textDecoration: "underline",
                      }}
                    >
                      {row.technician.name}
                    </button>
                  </td>
                  <td>{formatTL(row.daily)}</td>
                  <td>{formatTL(row.weekly)}</td>
                  <td>{formatTL(row.monthly)}</td>
                  <td>{formatTL(row.total)}</td>
                  <td>
                    {row.breakdown.filter((b) => b.amount > 0).length === 0
                      ? "-"
                      : row.breakdown
                          .filter((b) => b.amount > 0)
                          .map((b) => `${b.label}: ${formatTL(b.amount)}`)
                          .join(" · ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {selectedRevenueRow && (
          <TechnicianRevenueModal
            row={selectedRevenueRow}
            onClose={() => setSelectedRevenueRow(null)}
            isDark={isDark}
          />
        )}
      </div>

      <div className="card">
        <h3>Geçmiş Randevu Sorgusu</h3>
        <div className="form-row">
          <label>
            Müşteri / Adres / Telefon Ara
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Müşteri adı, adres veya telefon yazın…"
            />
          </label>
          <label>
            Teknisyen
            <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="all">Tümü</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Başlangıç
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            Bitiş
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
        </div>

        {!hasSearch && <p>Aramak için müşteri adı, adres veya telefon numarası yazın.</p>}

        {hasSearch && filtered.length === 0 && <p>Kayıt bulunamadı.</p>}

        {hasSearch && filtered.length > 0 && (
          <>
            <p>
              <strong>{search}</strong> için <strong>{filtered.length}</strong> ziyaret kaydı bulundu.
            </p>
            <table>
            <thead>
              <tr>
                <th>Gün</th>
                <th>Durum</th>
                <th>Sıra</th>
                <th>Teknisyen</th>
                <th>Müşteri</th>
                <th>Muhatap Kişi</th>
                <th>Telefon</th>
                <th>Adres</th>
                <th>Şikayet</th>
                <th>Tahmini Süre</th>
                <th>Aciliyet</th>
                <th>Ücret</th>
                <th>Kayıt Tarihi</th>
                {isAdmin && <th>Ekleyen</th>}
                {isAdmin && <th>Düzenleyen</th>}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>{a.scheduledDate}</td>
                  <td>{STATUS_LABELS[a.status] || a.status}</td>
                  <td>{a.stopOrder != null ? a.stopOrder + 1 : "-"}</td>
                  <td>{techName(a.assignedTechnicianId)}</td>
                  <td>{a.customerName}</td>
                  <td>{a.contactName || "-"}</td>
                  <td>
                    {a.customerPhone ? (
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `${a.customerName} (${a.customerPhone}) numarasını aramak istediğinize emin misiniz?`
                            )
                          ) {
                            window.api.callPhone(a.customerPhone);
                          }
                        }}
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
                  <td>
                    {a.feeAmount != null ? (
                      <>
                        {formatTL(a.feeAmount)}
                        {a.feeItems?.length > 0 && (
                          <>
                            <br />
                            <small style={{ opacity: 0.7 }}>
                              {a.feeItems.map((it) => `${it.label}: ${formatTL(it.amount || 0)}`).join(" · ")}
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
                  <td>{formatDateTime(a.createdAt)}</td>
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
                </tr>
              ))}
            </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
