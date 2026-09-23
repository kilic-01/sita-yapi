import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Pencil, QrCode } from "lucide-react";
import AddressFields from "./AddressFields.jsx";
import { composeAddress } from "../lib/turkeyAddressData.js";
import { STATUS_LABELS, toLocalISODate, toTitleCase, holidayOnDate } from "../lib/format.js";
import { findCustomerAppointments, normalizeForMatch } from "../lib/customerMatch.js";
import SuggestionDropdown from "./SuggestionDropdown.jsx";
import ToggleSwitch from "./ToggleSwitch.jsx";

// Teknisyen ciro raporunda (HistoryPage.jsx) her kalemin hangi kovaya
// gireceğini belirleyen sabit kategori — serbest metin etikete göre tahmin
// yerine, satır girilirken açıkça seçiliyor.
export const FEE_CATEGORIES = [
  { value: "servis", label: "Servis Ücreti" },
  { value: "montaj", label: "Montaj Ücreti" },
  { value: "parca", label: "Ürün Satışı" },
];

function emptyFeeItem(label = "", category = "servis") {
  return { label, amount: "", category };
}

// Etiket metninden en iyi tahminle kategori çıkarır — SADECE kategorisi
// olmayan eski kayıtlar için (bkz. feeItemsFromLegacy).
function guessCategory(label) {
  const l = (label || "").toLocaleLowerCase("tr");
  if (l.includes("montaj")) return "montaj";
  if (l.includes("servis")) return "servis";
  return "parca";
}

// Eski kayıtlarda ücret tek bir "feeAmount" toplamıydı, sonra kısa bir süre
// sabit üç alan (serviceFee/laborFee/partsFee) olarak tutuldu, sonra da
// kategorisiz feeItems eklendi — hiçbiri artık kullanılmıyor ama geçmiş
// kayıtlarda bulunabilir. Bir randevu düzenlemeye açıldığında bunlardan
// HANGİSİ varsa ona göre en iyi tahminle bir satır listesi kurar,
// kaybolmasınlar diye.
function feeItemsFromLegacy(a) {
  if (Array.isArray(a.feeItems) && a.feeItems.length) {
    return a.feeItems.map((it) => ({
      label: it.label || "",
      amount: it.amount != null ? String(it.amount) : "",
      category: it.category || guessCategory(it.label),
    }));
  }
  const legacy = [];
  if (a.serviceFee != null) legacy.push({ label: "Servis Ücreti", amount: String(a.serviceFee), category: "servis" });
  if (a.laborFee != null) legacy.push({ label: "Montaj Ücreti", amount: String(a.laborFee), category: "montaj" });
  if (a.partsFee != null) legacy.push({ label: "Yedek Parça Ücreti", amount: String(a.partsFee), category: "parca" });
  if (legacy.length) return legacy;
  if (a.feeAmount != null) return [{ label: "Servis Ücreti", amount: String(a.feeAmount), category: "servis" }];
  return [emptyFeeItem("Servis Ücreti")];
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toLocalISODate(d);
}

const emptyAddress = {
  il: "",
  ilce: "",
  mahalle: "",
  street: "",
  buildingName: "",
  apartmentNo: "",
};

const emptyForm = {
  customerName: "",
  contactName: "",
  // Başında "0" hazır gelsin diye — randevu kaydeden kişi genelde numarayı
  // baştaki sıfır olmadan yazıyor, sonra bilgisayardan arama özelliği
  // (tel: linki) sıfırsız numarayla çalışmıyordu. Kullanıcı yine de elle
  // sıfır yazarsa (ör. "0" + "0532...") çifte sıfır olmaması handleChange'de
  // ayrıca engelleniyor (bkz. Telefon input'unun onChange'i).
  customerPhone: "0",
  complaint: "",
  internalNote: "",
  urgency: "normal",
  scheduledDate: tomorrowISO(),
  addressDetail: emptyAddress,
  feeItems: [emptyFeeItem("Servis Ücreti")],
  feePaid: false,
  technicianId: "",
};

export default function AppointmentForm({
  editingAppointment,
  onSaved,
  onCancelEdit,
  actingUserId,
  appointments = [],
  holidays = [],
  stockItems = [],
  prefillCustomer = null,
  pendingParts = [],
  users = [],
  technicians = [],
  onSavedPendingPart,
  onCreateFollowUp,
}) {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [warning, setWarning] = useState("");
  const [status, setStatus] = useState(editingAppointment?.status || "pending");
  const [statusSaving, setStatusSaving] = useState(false);
  const [nameSuggestOpen, setNameSuggestOpen] = useState(false);
  const [feeSuggestFor, setFeeSuggestFor] = useState(null); // ücret satırı index
  // Stoktan seçilen bir kalemin KDV notu — satırın kendisine (label) DEĞİL,
  // sadece ekranda satırın altına bilgi amaçlı gösterilir, kaydedilmez.
  const [feeVatNotes, setFeeVatNotes] = useState({}); // { [satırIndex]: "Gösterilen Fiyata %20 KDV Dahildir. KDV Hariç Fiyatı: ... TL" }
  // "Bekleyen Parça" sekmesi SADECE düzenleme sırasında görünür — yeni
  // randevu oluştururken henüz bir "parça bekleniyor" tespiti yapılmış
  // olamaz (bkz. onlarca satır aşağıdaki sekme anahtarı).
  const [formTab, setFormTab] = useState("randevu"); // "randevu" | "parca"
  const customerNameInputRef = useRef(null);
  const feeInputRefs = useRef({});

  useEffect(() => {
    if (editingAppointment) {
      setForm({
        customerName: editingAppointment.customerName,
        contactName: editingAppointment.contactName || "",
        customerPhone: editingAppointment.customerPhone || "",
        complaint: editingAppointment.complaint || "",
        internalNote: editingAppointment.internalNote || "",
        urgency: editingAppointment.urgency,
        scheduledDate: editingAppointment.scheduledDate,
        addressDetail: editingAppointment.addressDetail || emptyAddress,
        feeItems: feeItemsFromLegacy(editingAppointment),
        feePaid: Boolean(editingAppointment.feePaid),
        technicianId: editingAppointment.assignedTechnicianId || "",
      });
      setStatus(editingAppointment.status || "pending");
      setWarning("");
      setFormTab("randevu");
    } else if (prefillCustomer) {
      // Bekleyen parça geldiğinde "Bu Müşteri İçin Yeni Randevu Oluştur"
      // butonuyla buraya taşınan müşteri bilgileri — geri kalan alanlar
      // (şikayet, ücret vb.) bilerek boş bırakılır, bu YENİ bir ziyaret.
      setForm({
        ...emptyForm,
        customerName: prefillCustomer.customerName || "",
        contactName: prefillCustomer.contactName || "",
        customerPhone: prefillCustomer.customerPhone || "0",
        addressDetail: prefillCustomer.addressDetail || emptyAddress,
      });
    } else {
      setForm(emptyForm);
    }
  }, [editingAppointment, prefillCustomer]);

  // Durum değişikliği, ana "Güncelle" formundan bağımsız olarak hemen
  // kaydedilir (AppointmentList.jsx'teki durum seçiciyle aynı desen) —
  // içerik değişikliklerinin durumu otomatik "Bekliyor"a çekmesinden
  // etkilenmez.
  async function handleStatusChange(newStatus) {
    if (!editingAppointment) return;
    setStatus(newStatus);
    setStatusSaving(true);
    try {
      await window.api.setAppointmentStatus(editingAppointment.id, newStatus, actingUserId);
    } finally {
      setStatusSaving(false);
    }
  }

  // Aynı müşteriye ait daha önceki randevular — firma müşterilerinde tekrar
  // arıza/geçmiş şikayet takibi için (eşleştirme mantığı CustomerProfilePage
  // ile paylaşılıyor, bkz. src/lib/customerMatch.js).
  const customerHistory = useMemo(
    () =>
      findCustomerAppointments(
        appointments,
        { name: form.customerName, phone: form.customerPhone, addressQuery: form.addressDetail?.street },
        editingAppointment?.id
      ),
    [appointments, form.customerPhone, form.customerName, form.addressDetail, editingAppointment]
  );

  // Yeni randevu oluştururken isim yazılırken, daha önce kaydı olan
  // müşterileri (isim + telefon) öneri olarak gösterir — QuoteForm'daki
  // stok kodu önerisiyle aynı desen. Sadece YENİ randevuda çalışır
  // (mevcut bir randevuyu düzenlerken müşteri kimliğini değiştirmeye
  // yaramamalı). Aynı müşteri birden çok kez geçebildiği için isim+telefon
  // ikilisine göre tekilleştirilir.
  const nameMatches = useMemo(() => {
    if (editingAppointment || !nameSuggestOpen) return [];
    const term = normalizeForMatch(form.customerName);
    if (term.length < 2) return [];
    const seen = new Set();
    const results = [];
    for (const a of appointments) {
      const aName = normalizeForMatch(a.customerName);
      if (!aName || !aName.includes(term)) continue;
      const key = `${aName}|${(a.customerPhone || "").replace(/\D/g, "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(a);
      if (results.length >= 8) break;
    }
    return results;
  }, [appointments, form.customerName, editingAppointment, nameSuggestOpen]);

  function pickCustomer(a) {
    setForm((f) => ({
      ...f,
      customerName: a.customerName || "",
      customerPhone: a.customerPhone || "",
      contactName: a.contactName || "",
      // Tarih ve şikayet BİLEREK dokunulmuyor — bu yeni bir randevu, yeni
      // bir arıza için, sadece müşteri bilgileri tekrar kullanılıyor.
      addressDetail:
        a.addressDetail && (a.addressDetail.il || a.addressDetail.street)
          ? a.addressDetail
          : { ...emptyAddress, street: a.address || "" },
    }));
    setNameSuggestOpen(false);
  }

  function setField(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  function setFeeItem(idx, patch) {
    setForm((f) => ({
      ...f,
      feeItems: f.feeItems.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }

  function addFeeItem() {
    setForm((f) => ({ ...f, feeItems: [...f.feeItems, emptyFeeItem("", "parca")] }));
  }

  function removeFeeItem(idx) {
    setForm((f) => ({ ...f, feeItems: f.feeItems.filter((_, i) => i !== idx) }));
    // Silinen satırdan sonraki notların index'lerini bir geri kaydırıyoruz,
    // yoksa yanlış satırın altında kalırlardı.
    setFeeVatNotes((notes) => {
      const next = {};
      for (const [i, v] of Object.entries(notes)) {
        const ni = Number(i);
        if (ni < idx) next[ni] = v;
        else if (ni > idx) next[ni - 1] = v;
      }
      return next;
    });
  }

  // Kod veya ürün adı yazılıp stoktan bir eşleşme seçildiğinde, hem kalemin
  // adını (kod + ürün adı) hem tutarını (stoktaki fiyat) otomatik doldurur —
  // QuoteForm.jsx/IncomingOrderForm.jsx'teki aynı otomatik doldurma deseni.
  function pickFeeStockItem(idx, stockItem) {
    // Stoktaki "price" alanı KDV HARİÇ tutuluyor (bkz. StockPage.jsx) —
    // müşteriden tahsil edilen tutar KDV dahil olduğu için burada %20
    // ekliyoruz. Bunu kalemin adına KARIŞTIRMADAN, sadece satırın altında
    // bilgi amaçlı bir not olarak gösteriyoruz (kaydedilmez).
    const baseName = stockItem.code ? `${stockItem.code} — ${stockItem.name || ""}` : stockItem.name || "";
    if (stockItem.price != null) {
      const withVat = Number(stockItem.price) * 1.2;
      setFeeItem(idx, { label: baseName, amount: String(Math.round(withVat * 100) / 100), category: "parca" });
      setFeeVatNotes((notes) => ({
        ...notes,
        [idx]: `Gösterilen Fiyata %20 KDV Dahildir. KDV Hariç Fiyatı: ${Number(stockItem.price).toLocaleString("tr-TR")} TL`,
      }));
    } else {
      setFeeItem(idx, { label: baseName, amount: "", category: "parca" });
    }
    setFeeSuggestFor(null);
  }

  // Kullanıcılar telefon numarasını genelde başındaki "0" olmadan yazıyor
  // (ör. "532 123 45 67") — kaydederken otomatik olarak baştaki sıfırı
  // ekliyoruz ki tüm numaralar tutarlı (0xxx...) biçimde saklansın.
  function normalizePhone(raw) {
    const trimmed = (raw || "").trim();
    if (!trimmed || trimmed.startsWith("0")) return trimmed;
    return `0${trimmed}`;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setWarning("");
    try {
      const payload = {
        customerName: toTitleCase(form.customerName),
        contactName: toTitleCase(form.contactName),
        customerPhone: normalizePhone(form.customerPhone),
        complaint: form.complaint,
        internalNote: form.internalNote,
        urgency: form.urgency,
        scheduledDate: form.scheduledDate,
        addressDetail: form.addressDetail,
        address: toTitleCase(composeAddress(form.addressDetail)),
        // Boş (ne etiketi ne tutarı girilmiş) satırlar atılır.
        feeItems: form.feeItems
          .filter((it) => it.label.trim() || it.amount !== "")
          .map((it) => ({
            label: it.label.trim(),
            amount: Number(it.amount) || 0,
            category: it.category || "parca",
          })),
        // "feeAmount", teknisyen ciro toplamlarının (HistoryPage.jsx) ve diğer
        // özet ekranların üzerinde çalıştığı TEK toplam alan olmaya devam
        // ediyor — kalemlerin toplamı olarak burada otomatik hesaplanır, o
        // ekranların hiçbirini değiştirmemize gerek kalmadı. Hiç kalem
        // girilmediyse null kalır.
        feeAmount: form.feeItems.some((it) => it.amount !== "")
          ? form.feeItems.reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
          : null,
        feePaid: form.feePaid,
        actingUserId,
        // Teknisyen seçimi SADECE dispatcher formda gerçekten değiştirdiyse
        // gönderilir — yoksa (ör. düzenlemede sadece ücret güncellenirken)
        // her kayıtta boş/aynı değer gönderilip mevcut atamayı yanlışlıkla
        // sıfırlamış oluruz.
        ...(!editingAppointment && form.technicianId ? { assignedTechnicianId: form.technicianId } : {}),
        ...(editingAppointment && form.technicianId !== (editingAppointment.assignedTechnicianId || "")
          ? { assignedTechnicianId: form.technicianId || null }
          : {}),
      };

      if (editingAppointment) {
        const { appointment, geocodeError, geocodeWarning } = await window.api.updateAppointment(
          editingAppointment.id,
          payload
        );
        if (geocodeError) {
          setWarning(
            `Randevu güncellendi ama adres bulunamadı (${geocodeError}). Adresi kontrol edin.`
          );
        } else if (geocodeWarning) {
          setWarning(geocodeWarning);
        }
        onSaved(appointment, Boolean(geocodeError || geocodeWarning));
      } else {
        const { appointment, geocodeError, geocodeWarning } = await window.api.addAppointment(payload);
        if (geocodeError) {
          setWarning(
            `Randevu kaydedildi ama adres bulunamadı (${geocodeError}). Adresi kontrol edip düzeltin.`
          );
        } else if (geocodeWarning) {
          setWarning(geocodeWarning);
        }
        if (!geocodeError && !geocodeWarning) setForm(emptyForm);
        onSaved(appointment, Boolean(geocodeError || geocodeWarning));
      }
    } catch (err) {
      setWarning(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      <h3>{editingAppointment ? "Randevuyu Düzenle" : "Yeni Randevu"}</h3>

      {editingAppointment && (
        <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--border)", marginBottom: "1rem" }}>
          {[
            { id: "randevu", label: "Randevu Bilgileri" },
            { id: "parca", label: "Bekleyen Parça" },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setFormTab(t.id)}
              style={{
                background: "none",
                border: "none",
                borderBottom: formTab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
                padding: "0.5rem 0.2rem",
                marginBottom: "-1px",
                fontWeight: formTab === t.id ? 700 : 400,
                color: formTab === t.id ? "var(--text)" : "var(--text-muted)",
                cursor: "pointer",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(!editingAppointment || formTab === "randevu") && (
      <>
      <div className="form-row">
        <label style={{ position: "relative" }}>
          Müşteri Adı
          <input
            ref={customerNameInputRef}
            value={form.customerName}
            onChange={(e) => setField("customerName", e.target.value)}
            onFocus={() => setNameSuggestOpen(true)}
            onBlur={() => setTimeout(() => setNameSuggestOpen(false), 150)}
            autoComplete="off"
            required
          />
          {nameMatches.length > 0 && (
            <SuggestionDropdown anchorRef={customerNameInputRef} minWidth={280}>
              {nameMatches.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onMouseDown={() => pickCustomer(a)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    background: "none",
                    border: "none",
                    padding: "0.4rem 0.6rem",
                    cursor: "pointer",
                    fontSize: "0.82rem",
                  }}
                >
                  <strong>{a.customerName}</strong>
                  {a.customerPhone && <> — {a.customerPhone}</>}
                </button>
              ))}
            </SuggestionDropdown>
          )}
        </label>
        <label>
          Telefon
          <input
            value={form.customerPhone}
            onChange={(e) => setField("customerPhone", e.target.value.replace(/^00+/, "0"))}
            placeholder="05xx xxx xx xx"
          />
        </label>
        <label>
          Muhatap Kişi (opsiyonel)
          <input
            value={form.contactName}
            onChange={(e) => setField("contactName", e.target.value)}
            placeholder="Firma adına yerinde görüşülecek kişi"
          />
        </label>
        <label>
          Gidilecek Gün
          <input
            type="date"
            value={form.scheduledDate}
            onChange={(e) => setField("scheduledDate", e.target.value)}
            required
          />
          {holidayOnDate(form.scheduledDate, holidays) && (
            <small style={{ color: "var(--danger)" }}>
              Bu gün "{holidayOnDate(form.scheduledDate, holidays).name}" tatiline denk geliyor.
            </small>
          )}
        </label>
        <label>
          Aciliyet
          <select value={form.urgency} onChange={(e) => setField("urgency", e.target.value)}>
            <option value="normal">Normal</option>
            <option value="acil">Acil</option>
          </select>
        </label>
        {technicians.length > 0 && (
          <label>
            Teknisyen (opsiyonel)
            <select value={form.technicianId} onChange={(e) => setField("technicianId", e.target.value)}>
              <option value="">Otomatik rota</option>
              {technicians
                .filter((t) => t.assignable !== false)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
            </select>
            {form.technicianId ? (
              <small style={{ opacity: 0.7 }}>
                Bu randevu doğrudan seçilen teknisyene atanır, otomatik rotalama bunu değiştirmez.
              </small>
            ) : (
              editingAppointment?.assignedTechnicianId && (
                <small style={{ opacity: 0.7 }}>
                  Bu randevunun teknisyen ataması kaldırılır, bir sonraki rota oluşturmada yeniden dağıtılabilir.
                </small>
              )
            )}
          </label>
        )}
        {editingAppointment && (
          <label>
            Durum
            <select
              value={status}
              disabled={statusSaving}
              onChange={(e) => handleStatusChange(e.target.value)}
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {customerHistory.length > 0 && (
        <div
          style={{
            background: "color-mix(in srgb, var(--accent) 8%, transparent)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
          }}
        >
          <strong>Bu müşteri daha önce {customerHistory.length} kez servis almış:</strong>
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.2rem" }}>
            {customerHistory.slice(0, 5).map((a) => (
              <li key={a.id}>
                {a.scheduledDate} — {a.complaint || "Şikayet belirtilmemiş"} (
                {STATUS_LABELS[a.status] || a.status})
              </li>
            ))}
          </ul>
          {customerHistory.length > 5 && <small>+{customerHistory.length - 5} ziyaret daha</small>}
        </div>
      )}

      <AddressFields
        value={form.addressDetail}
        onChange={(addressDetail) => setField("addressDetail", addressDetail)}
      />

      <label>
        Müşteri Şikayeti
        <textarea
          value={form.complaint}
          onChange={(e) => setField("complaint", e.target.value)}
          rows={2}
        />
      </label>

      <label>
        Not (sadece bize görünür, müşteriye gösterilmez/yazdırılmaz)
        <textarea
          value={form.internalNote}
          onChange={(e) => setField("internalNote", e.target.value)}
          rows={2}
          placeholder="Örn. randevu öncesi hatırlanması gereken bir detay..."
        />
      </label>

      <div>
        <small style={{ opacity: 0.7 }}>Ücret Kalemleri</small>
        {form.feeItems.map((item, idx) => {
          const q = item.label.trim().toLowerCase();
          const matches =
            feeSuggestFor === idx && q
              ? stockItems
                  .filter(
                    (s) =>
                      (s.code || "").toLowerCase().includes(q) ||
                      (s.name || "").toLowerCase().includes(q) ||
                      (s.barcode || "").toLowerCase().includes(q)
                  )
                  .slice(0, 8)
              : [];
          return (
            <div key={idx} className="form-row" style={{ alignItems: "flex-end" }}>
              <label style={{ flex: 1, position: "relative" }}>
                {idx === 0 ? "Kalem (ad ya da ürün kodu)" : ""}
                <input
                  ref={(el) => (feeInputRefs.current[idx] = el)}
                  value={item.label}
                  onChange={(e) => {
                    setFeeItem(idx, { label: e.target.value });
                    // Kullanıcı elle değiştirdiyse eski KDV notu artık geçersiz.
                    setFeeVatNotes((notes) => {
                      if (!(idx in notes)) return notes;
                      const next = { ...notes };
                      delete next[idx];
                      return next;
                    });
                  }}
                  onFocus={() => setFeeSuggestFor(idx)}
                  onBlur={() => setTimeout(() => setFeeSuggestFor(null), 150)}
                  placeholder={idx === 0 ? "Servis Ücreti" : "Ör. Montaj Ücreti / Parça adı ya da kodu"}
                  autoComplete="off"
                />
                {feeVatNotes[idx] && (
                  // Mutlak konumlu — akışa (satırın yüksekliğine) dahil değil, yoksa
                  // bu sütun diğerlerinden uzun kalıp "Tutar" alanını aşağı iterdi.
                  <small
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: "0.15rem",
                      opacity: 0.7,
                    }}
                  >
                    {feeVatNotes[idx]}
                  </small>
                )}
                {matches.length > 0 && (
                  <SuggestionDropdown anchorRef={{ current: feeInputRefs.current[idx] }} minWidth={260}>
                    {matches.map((s) => (
                      <button
                        type="button"
                        key={s.id}
                        onMouseDown={() => pickFeeStockItem(idx, s)}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          background: "none",
                          border: "none",
                          padding: "0.4rem 0.6rem",
                          cursor: "pointer",
                          fontSize: "0.82rem",
                        }}
                      >
                        <strong>{s.code}</strong> — {s.name}
                        {s.barcode && (
                          <QrCode
                            size={13}
                            strokeWidth={1.75}
                            title={`Barkod: ${s.barcode}`}
                            style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                          />
                        )}
                        {s.price != null && (
                          <span style={{ opacity: 0.7 }}> · {Number(s.price).toLocaleString("tr-TR")} TL</span>
                        )}
                      </button>
                    ))}
                  </SuggestionDropdown>
                )}
              </label>
              <label style={{ width: 150 }}>
                {idx === 0 ? "Kategori" : ""}
                <select
                  value={item.category || "servis"}
                  onChange={(e) => setFeeItem(idx, { category: e.target.value })}
                >
                  {FEE_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
              <label style={{ width: 140 }}>
                {idx === 0 ? "Tutar (TL)" : ""}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.amount}
                  onChange={(e) => setFeeItem(idx, { amount: e.target.value })}
                  placeholder="Örn. 500"
                />
              </label>
              <button
                type="button"
                className="icon-btn delete"
                title="Satırı sil"
                aria-label="Satırı sil"
                onClick={() => removeFeeItem(idx)}
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="secondary"
          onClick={addFeeItem}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.4rem" }}
        >
          <Plus size={15} strokeWidth={1.75} />
          Ücret Satırı Ekle
        </button>
      </div>
      <div className="form-row" style={{ alignItems: "center", marginTop: "0.6rem" }}>
        <span>
          Toplam:{" "}
          <strong>
            {form.feeItems
              .reduce((sum, it) => sum + (Number(it.amount) || 0), 0)
              .toLocaleString("tr-TR")}{" "}
            TL
          </strong>
        </span>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <ToggleSwitch checked={form.feePaid} onChange={(e) => setField("feePaid", e.target.checked)} />
          Tahsil Edildi
        </label>
      </div>
      {editingAppointment && (
        <p className="error" style={{ color: "var(--blue-teal-2)" }}>
          Not: yukarıdaki bilgileri değiştirip "Güncelle"ye basarsanız, bu randevu zaten
          rotalanmışsa tekrar "Bekliyor" durumuna alınır ve bir dahaki "Rotaları Oluştur"
          çalıştırmasında yeniden sıralanır. Sadece <strong>Durum</strong> alanını değiştirmek
          bundan etkilenmez, anında kaydedilir.
        </p>
      )}
      {warning && <div className="error">{warning}</div>}
      <button className="primary" type="submit" disabled={saving}>
        {saving ? "Kaydediliyor…" : editingAppointment ? "Güncelle" : "Randevuyu Kaydet"}
      </button>
      {editingAppointment && (
        <button
          type="button"
          className="secondary"
          style={{ marginLeft: "0.6rem" }}
          onClick={onCancelEdit}
        >
          Vazgeç
        </button>
      )}
      </>
      )}

      {editingAppointment && formTab === "parca" && (
        <PendingPartTab
          customerName={editingAppointment.customerName}
          contactName={editingAppointment.contactName}
          customerPhone={editingAppointment.customerPhone}
          addressDetail={editingAppointment.addressDetail}
          pendingParts={pendingParts}
          stockItems={stockItems}
          users={users}
          actingUserId={actingUserId}
          onSavedPendingPart={onSavedPendingPart}
          onCreateFollowUp={onCreateFollowUp}
          onCancel={onCancelEdit}
        />
      )}
    </form>
  );
}

// Randevu düzenleme modalındaki "Bekleyen Parça" sekmesinin içeriği — ayrı
// bir bileşen olarak tutuluyor ki üstteki randevu formunun state'iyle
// (form, saving, vb.) karışmasın; bu, TAMAMEN BAĞIMSIZ bir CRUD akışı
// (pendingParts tablosuna doğrudan yazıyor, randevu kaydına dokunmuyor).
function PendingPartTab({
  customerName,
  contactName,
  customerPhone,
  addressDetail,
  pendingParts,
  stockItems,
  users,
  actingUserId,
  onSavedPendingPart,
  onCreateFollowUp,
}) {
  const customerParts = useMemo(
    () =>
      pendingParts
        .filter(
          (p) =>
            normalizeForMatch(p.customerName) === normalizeForMatch(customerName) &&
            (p.customerPhone || "").replace(/\D/g, "") === (customerPhone || "").replace(/\D/g, "")
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [pendingParts, customerName, customerPhone]
  );

  const [partForm, setPartForm] = useState(null); // null = form kapalı
  const [editingPartId, setEditingPartId] = useState(null);
  const [partSuggestOpen, setPartSuggestOpen] = useState(false);
  const [partSaving, setPartSaving] = useState(false);
  const partInputRef = useRef(null);

  function startNewPart() {
    setEditingPartId(null);
    setPartForm({
      description: "",
      status: "bekleniyor",
      orderedAt: toLocalISODate(new Date()),
      reminderIntervalDays: "3",
      reminderUserIds: [],
      reminderNote: "",
    });
  }

  function startEditPart(p) {
    setEditingPartId(p.id);
    setPartForm({
      description: p.description,
      status: p.status,
      orderedAt: p.orderedAt || toLocalISODate(new Date()),
      reminderIntervalDays: p.reminderIntervalDays != null ? String(p.reminderIntervalDays) : "3",
      reminderUserIds: p.reminderUserIds || [],
      reminderNote: p.reminderNote || "",
    });
  }

  function togglePartReminderUser(userId) {
    setPartForm((f) => ({
      ...f,
      reminderUserIds: f.reminderUserIds.includes(userId)
        ? f.reminderUserIds.filter((id) => id !== userId)
        : [...f.reminderUserIds, userId],
    }));
  }

  function pickPartStockItem(s) {
    setPartForm((f) => ({ ...f, description: s.code ? `${s.code} — ${s.name || ""}` : s.name || "" }));
    setPartSuggestOpen(false);
  }

  async function savePart(e) {
    e.preventDefault();
    setPartSaving(true);
    try {
      const payload = {
        customerName,
        customerPhone,
        description: partForm.description.trim(),
        status: partForm.status,
        orderedAt: partForm.orderedAt,
        reminderIntervalDays: partForm.reminderIntervalDays !== "" ? Number(partForm.reminderIntervalDays) : null,
        reminderUserIds: partForm.reminderUserIds,
        reminderNote: partForm.reminderNote,
        actingUserId,
      };
      const saved = editingPartId
        ? await window.api.updatePendingPart(editingPartId, payload)
        : await window.api.addPendingPart(payload);
      onSavedPendingPart?.(saved);
      setPartForm(null);
      setEditingPartId(null);
    } finally {
      setPartSaving(false);
    }
  }

  async function deletePart(p) {
    if (!window.confirm(`"${p.description}" kaydını silmek istediğinize emin misiniz?`)) return;
    await window.api.deletePendingPart(p.id, actingUserId);
    onSavedPendingPart?.(null, p.id);
  }

  const partQuery = (partForm?.description || "").trim().toLowerCase();
  const partMatches =
    partSuggestOpen && partQuery
      ? stockItems
          .filter(
            (s) =>
              (s.code || "").toLowerCase().includes(partQuery) ||
              (s.name || "").toLowerCase().includes(partQuery) ||
              (s.barcode || "").toLowerCase().includes(partQuery)
          )
          .slice(0, 8)
      : [];

  return (
    <div>
      <p style={{ opacity: 0.7, fontSize: "0.85rem", marginTop: 0 }}>
        Müşterinin sorununu çözecek bir parça elde yoksa ve fabrikadan sipariş edildiyse buraya ekleyin —
        parça gelene kadar seçtiğiniz kullanıcılara belirli aralıklarla hatırlatma gönderilir.
      </p>

      {customerParts.length === 0 && !partForm && <p style={{ opacity: 0.7 }}>Bu müşteri için kayıtlı bekleyen parça yok.</p>}

      {customerParts.map((p) => (
        <div key={p.id} style={{ borderBottom: "1px solid var(--border)", padding: "0.6rem 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
            <strong style={{ flex: 1, minWidth: 0 }}>{p.description}</strong>
            <span
              style={{
                padding: "0.1rem 0.5rem",
                borderRadius: 999,
                fontSize: "0.75rem",
                fontWeight: 600,
                color: "white",
                background: p.status === "geldi" ? "var(--success, #2ecc71)" : "var(--accent)",
              }}
            >
              {p.status === "geldi" ? "Geldi" : "Bekleniyor"}
            </span>
            <button type="button" className="icon-btn edit" title="Düzenle" aria-label="Düzenle" onClick={() => startEditPart(p)}>
              <Pencil size={14} strokeWidth={1.75} />
            </button>
            <button type="button" className="icon-btn delete" title="Sil" aria-label="Sil" onClick={() => deletePart(p)}>
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
          {p.orderedAt && <small style={{ opacity: 0.7 }}>Sipariş: {p.orderedAt}</small>}
          {p.reminderIntervalDays && (
            <small style={{ opacity: 0.7, display: "block" }}>Her {p.reminderIntervalDays} günde bir hatırlatılıyor</small>
          )}
          {p.status === "geldi" && (
            <button
              type="button"
              className="primary"
              style={{ marginTop: "0.4rem" }}
              onClick={() => onCreateFollowUp?.({ customerName, contactName, customerPhone, addressDetail })}
            >
              Bu Müşteri İçin Yeni Randevu Oluştur
            </button>
          )}
        </div>
      ))}

      {!partForm ? (
        <button
          type="button"
          className="secondary"
          onClick={startNewPart}
          style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginTop: "0.75rem" }}
        >
          <Plus size={15} strokeWidth={1.75} />
          Bekleyen Parça Ekle
        </button>
      ) : (
        <div style={{ marginTop: "0.75rem", padding: "0.75rem", border: "1px solid var(--border)", borderRadius: 8 }}>
          <label style={{ position: "relative" }}>
            Parça Açıklaması (ad ya da ürün kodu)
            <input
              ref={partInputRef}
              value={partForm.description}
              onChange={(e) => setPartForm((f) => ({ ...f, description: e.target.value }))}
              onFocus={() => setPartSuggestOpen(true)}
              onBlur={() => setTimeout(() => setPartSuggestOpen(false), 150)}
              placeholder="Örn. Vitra Rezervuar Takımı"
              autoComplete="off"
            />
            {partMatches.length > 0 && (
              <SuggestionDropdown anchorRef={partInputRef}>
                {partMatches.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onMouseDown={() => pickPartStockItem(s)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      padding: "0.4rem 0.6rem",
                      cursor: "pointer",
                      fontSize: "0.82rem",
                    }}
                  >
                    <strong>{s.code}</strong> — {s.name}
                    {s.barcode && (
                      <QrCode
                        size={13}
                        strokeWidth={1.75}
                        title={`Barkod: ${s.barcode}`}
                        style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                      />
                    )}
                  </button>
                ))}
              </SuggestionDropdown>
            )}
          </label>
          <div className="form-row" style={{ marginTop: "0.5rem" }}>
            <label>
              Durum
              <select value={partForm.status} onChange={(e) => setPartForm((f) => ({ ...f, status: e.target.value }))}>
                <option value="bekleniyor">Bekleniyor</option>
                <option value="geldi">Geldi</option>
              </select>
            </label>
            <label>
              Sipariş Tarihi
              <input type="date" value={partForm.orderedAt} onChange={(e) => setPartForm((f) => ({ ...f, orderedAt: e.target.value }))} />
            </label>
            <label style={{ width: 150 }}>
              Hatırlatma Aralığı (gün)
              <input
                type="number"
                min="1"
                value={partForm.reminderIntervalDays}
                onChange={(e) => setPartForm((f) => ({ ...f, reminderIntervalDays: e.target.value }))}
                placeholder="Örn. 3"
              />
            </label>
          </div>
          <label style={{ display: "block", marginTop: "0.5rem" }}>
            Hatırlatma Notu (opsiyonel)
            <input value={partForm.reminderNote} onChange={(e) => setPartForm((f) => ({ ...f, reminderNote: e.target.value }))} />
          </label>
          <div style={{ marginTop: "0.5rem" }}>
            <small style={{ opacity: 0.7 }}>Hatırlatılacak kullanıcılar:</small>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "0.3rem" }}>
              {users.map((u) => (
                <label key={u.id} style={{ display: "flex", alignItems: "center", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 400 }}>
                  <input type="checkbox" checked={partForm.reminderUserIds.includes(u.id)} onChange={() => togglePartReminderUser(u.id)} />
                  {u.name}
                </label>
              ))}
            </div>
          </div>
          <div style={{ marginTop: "0.75rem" }}>
            <button className="primary" type="button" disabled={partSaving} onClick={savePart}>
              {partSaving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              type="button"
              className="secondary"
              style={{ marginLeft: "0.5rem" }}
              onClick={() => {
                setPartForm(null);
                setEditingPartId(null);
              }}
            >
              Vazgeç
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
