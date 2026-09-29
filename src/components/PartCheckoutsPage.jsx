import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, ChevronRight, ChevronDown, Pencil, QrCode } from "lucide-react";
import { todayISO } from "../lib/format.js";
import Modal from "./Modal.jsx";
import PartCheckoutsPrintView from "./PartCheckoutsPrintView.jsx";
import SuggestionDropdown from "./SuggestionDropdown.jsx";
import { EmptyStateIllustration } from "./illustrations.jsx";

const STOCK_RESULT_LIMIT = 8;
const VAT_RATE = 1.2;
// Binlerce stok kaleminde her tuş vuruşunda tam liste taranıyordu (kod/isim/
// barkod x ~10.400 ürün) — arama kutusu bu yüzden kasıyordu. StockPage.jsx'te
// kullanılan aynı debounce deseni burada da uygulanıyor: kutu anında yazıyı
// gösterir, asıl arama yazma bittikten kısa süre sonra çalışır.
const SEARCH_DEBOUNCE_MS = 200;

function emptyDraft() {
  return { qtyUsed: "", qtyReturned: "", qtyStoredInVehicle: "", appointmentId: "" };
}

// Fiyatlar her yerde KDV DAHİL gösterilir — sadece bilgi amaçlı, stok
// kaleminin kendi (KDV hariç) `price` alanına hiçbir şekilde yazılmaz.
function formatPriceWithVat(price) {
  return `₺${(Number(price) * VAT_RATE).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}`;
}

let rowKeySeq = 0;
function emptyProductRow() {
  rowKeySeq += 1;
  return { key: `row-${rowKeySeq}`, search: "", selectedStock: null, qty: "1" };
}

export default function PartCheckoutsPage({
  stockItems = [],
  technicians = [],
  appointments = [],
  partCheckouts = [],
  currentUser,
  onChanged,
}) {
  const [date, setDate] = useState(todayISO());
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  // Tek bir teknisyen yerine bir DİZİ — aynı zimmet aynı anda birden fazla
  // kişiye (ör. usta + o gün ona eşlik eden çırak) verilebilsin diye. Her
  // seçili kişi, formdaki her ürün satırı için AYRI bir zimmet kaydı alır
  // (stoktan da ona göre düşülür) — bir ürünün tek zimmetinin paylaştırılması
  // değil, herkesin kendi zimmeti.
  const [technicianIds, setTechnicianIds] = useState([""]);
  const [productRows, setProductRows] = useState([emptyProductRow()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reconcileDrafts, setReconcileDrafts] = useState({});
  const [expandedTechIds, setExpandedTechIds] = useState(new Set());
  const [editingReconcileId, setEditingReconcileId] = useState(null);
  const [editingItemId, setEditingItemId] = useState(null);
  // Bir ustanın grup başlığındaki "+" butonuna basılınca hangi ustanın
  // yanında çırak seçme açılır menüsü gösterildiğini tutar (bkz.
  // startCheckoutForApprentice) — çıraklar her gün farklı bir ustayla
  // gittiği için dispatcher o günkü ustanın yanından hızlıca ilgili çırağı
  // seçip ona da zimmet açabilsin diye.
  const [apprenticePickerForTech, setApprenticePickerForTech] = useState(null);
  const [itemEditDraft, setItemEditDraft] = useState({ search: "", selectedStock: null, qty: "1" });
  const [itemEditDebouncedSearch, setItemEditDebouncedSearch] = useState("");
  const itemEditInputRef = useRef(null);
  const productRowInputRefs = useRef({});
  // Her satırın arama kutusu için ayrı bir debounce zamanlayıcısı — satır
  // sayısı dinamik olduğu için bunu bir alt bileşene taşımak yerine
  // parent'ta anahtar (row.key) bazlı bir map olarak tutuyoruz.
  const [productRowDebouncedSearch, setProductRowDebouncedSearch] = useState({});
  const productRowSearchTimers = useRef({});

  useEffect(() => {
    const timer = setTimeout(() => setItemEditDebouncedSearch(itemEditDraft.search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [itemEditDraft.search]);

  function scheduleProductRowSearch(key, value) {
    clearTimeout(productRowSearchTimers.current[key]);
    productRowSearchTimers.current[key] = setTimeout(() => {
      setProductRowDebouncedSearch((prev) => ({ ...prev, [key]: value }));
    }, SEARCH_DEBOUNCE_MS);
  }

  function toggleTechExpanded(techId) {
    setExpandedTechIds((prev) => {
      const next = new Set(prev);
      if (next.has(techId)) next.delete(techId);
      else next.add(techId);
      return next;
    });
  }

  // "İş Atanabilir" işareti kaldırılmış (assignable:false) teknisyenler bu
  // şirkette çıraklar — kendi rotaları olmuyor (buildRoutes'ta zaten
  // dışlanıyorlar), her gün farklı bir ustayla randevulara gidiyorlar. Ama
  // parça alabiliyorlar, bu yüzden zimmet ekranında da seçilebilir olmaları
  // gerekiyor — sadece rota/otomatik iş ataması dışında tutuluyorlar.
  const masterTechnicians = technicians.filter((t) => t.assignable !== false);
  const apprentices = technicians.filter((t) => t.assignable === false);

  function stockMatchesFor(term) {
    const t = term.trim().toLowerCase();
    if (!t) return [];
    return stockItems
      .filter(
        (s) =>
          (s.code || "").toLowerCase().includes(t) ||
          (s.name || "").toLowerCase().includes(t) ||
          (s.barcode || "").toLowerCase().includes(t)
      )
      .slice(0, STOCK_RESULT_LIMIT);
  }

  // Barkod okuyucu, taratılan kodu klavye girişi gibi hızlıca yazar — bir
  // insanın barkod uzunluğunda bir metni bu kadar hızlı, Enter'a basmadan
  // yazması gerçekçi değil, bu yüzden "tam eşleşme" tek başına barkod
  // taraması saymaya yetiyor (bkz. handleProductRowSearchChange). Kod
  // araması ayrı tutuluyor (Enter'la elle tam kod yazma senaryosu için).
  function findExactBarcodeMatch(term) {
    const t = term.trim().toLowerCase();
    if (!t) return null;
    return stockItems.find((s) => s.barcode && s.barcode.toLowerCase() === t) || null;
  }

  function findExactCodeMatch(term) {
    const t = term.trim().toLowerCase();
    if (!t) return null;
    return stockItems.find((s) => (s.code || "").toLowerCase() === t) || null;
  }

  function updateProductRow(key, patch) {
    setProductRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function addProductRow() {
    const row = emptyProductRow();
    setProductRows((prev) => [...prev, row]);
    return row;
  }

  // Kısa bir "bip" — barkod tarandığında/eşleştiğinde sessizce ekranda bir
  // şey değişmesi yeterli geri bildirim değil (dispatcher ekrana değil
  // ürüne/teknisyene bakıyor olabilir); gerçek barkod okuyucuların kendi
  // bip sesine benzer, kısa ve net bir onay sesi. Dosya yönetmemek için
  // Web Audio API ile anlık üretiliyor.
  function playBarcodeBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Çift bip — gerçek barkod okuyucuların çoğunun kullandığı desen.
      const beep = (startOffset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 1318.5; // E6
        const start = ctx.currentTime + startOffset;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.16, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.06);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + 0.08);
      };
      beep(0);
      beep(0.09);
      setTimeout(() => ctx.close(), 400);
    } catch {
      // Ses üretimi (nadiren) desteklenmiyor/izin yoksa zimmetleme akışını
      // bozmasın diye sessizce yutuluyor — ses bir onay sinyali, kritik değil.
    }
  }

  // Bir satıra ürün seçildiğinde (barkod eşleşmesi, listeden tıklama ya da
  // Enter'la tam kod eşleşmesi) hemen altına yeni bir boş satır açar ve
  // odağı oraya taşır — dispatcher eli klavyeden/fareden hiç çekmeden art
  // arda birçok ürünü taratıp/seçip zimmetleyebilsin diye (gerçek kullanım
  // senaryosu: bir teknisyene aldığı tüm parçaları tek tek taratmak).
  function selectStockForRow(row, stock) {
    clearTimeout(productRowSearchTimers.current[row.key]);
    updateProductRow(row.key, { selectedStock: stock, search: "" });
    const newRow = addProductRow();
    setTimeout(() => productRowInputRefs.current[newRow.key]?.focus(), 0);
  }

  // Arama kutusuna her yazıldığında (elle ya da barkod okuyucudan) çağrılır —
  // yazılan metin tam bir barkoda eşleşiyorsa Enter beklemeden anında seçip
  // ilerler ve bip sesi çalar.
  function handleProductRowSearchChange(row, value) {
    updateProductRow(row.key, { selectedStock: null, search: value });
    scheduleProductRowSearch(row.key, value);
    const barcodeMatch = findExactBarcodeMatch(value);
    if (barcodeMatch) {
      playBarcodeBeep();
      selectStockForRow(row, barcodeMatch);
    }
  }

  function handleProductRowKeyDown(e, row) {
    if (e.key !== "Enter") return;
    e.preventDefault(); // formun kendisini (Zimmetle) tetiklemesin
    if (row.selectedStock) return;
    const match = findExactCodeMatch(row.search);
    if (!match) return;
    selectStockForRow(row, match);
  }

  function removeProductRow(key) {
    setProductRows((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
    clearTimeout(productRowSearchTimers.current[key]);
    delete productRowSearchTimers.current[key];
    setProductRowDebouncedSearch((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const dayCheckouts = useMemo(() => partCheckouts.filter((c) => c.date === date), [partCheckouts, date]);

  // Teknisyene göre grupla — dispatcher sabah "kim ne aldı"yı, akşam "kimde
  // ne var, mutabakatı bekleyen ne"yi teknisyen bazlı görmek istiyor. Aynı
  // "Zimmetle" işleminde birden fazla kişi seçildiyse (aynı araçla birlikte
  // işlere giden bir ekip) o kişilerin zimmetleri ortak bir "groupId" paylaşır
  // — bu durumda ayrı ayrı değil, TEK bir başlık altında (isimler yan yana)
  // gösterilir. groupId'si olmayan (eski veya tek kişilik) zimmetler eskisi
  // gibi kendi technicianId'sine göre gruplanır.
  const byTechnician = useMemo(() => {
    const groups = new Map();
    for (const c of dayCheckouts) {
      const key = c.groupId || c.technicianId;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return groups;
  }, [dayCheckouts]);

  // İsme göre alfabetik sıralı liste — her grup bir başlık, tıklanınca
  // o günkü zimmetleri açılır/kapanır (accordion) gösterilir. Bir grupta
  // birden fazla kişi olabileceği için (bkz. yukarı) her girdiye ait
  // benzersiz teknisyenlerin listesi de burada çıkarılıyor.
  const sortedTechnicianEntries = useMemo(() => {
    return [...byTechnician.entries()]
      .map(([key, rows]) => {
        const groupTechnicianIds = [...new Set(rows.map((c) => c.technicianId))];
        const groupTechnicians = groupTechnicianIds
          .map((id) => technicians.find((t) => t.id === id))
          .filter(Boolean);
        return [key, rows, groupTechnicians];
      })
      .sort(([, , aTechs], [, , bTechs]) => {
        const aName = aTechs[0]?.name || "";
        const bName = bTechs[0]?.name || "";
        return aName.localeCompare(bName, "tr");
      });
  }, [byTechnician, technicians]);

  // Yazdırma çıktısı için aynı (alfabetik sıralı) gruplamayı stok kalemi ve
  // (varsa) hangi müşteriye kullanıldığı bilgisiyle zenginleştirir — ekranda
  // görülen sırayla aynı çıksın diye.
  const printGroups = useMemo(
    () =>
      sortedTechnicianEntries.map(([groupKey, rows, groupTechnicians]) => ({
        groupKey,
        technicians: groupTechnicians,
        rows: rows.map((checkout) => ({
          checkout,
          stock: stockItems.find((s) => s.id === checkout.stockItemId),
          appointment: checkout.appointmentId ? appointments.find((a) => a.id === checkout.appointmentId) : null,
        })),
      })),
    [sortedTechnicianEntries, stockItems, appointments]
  );

  function draftFor(checkoutId) {
    return reconcileDrafts[checkoutId] || emptyDraft();
  }

  function updateDraft(checkoutId, patch) {
    setReconcileDrafts((prev) => ({ ...prev, [checkoutId]: { ...draftFor(checkoutId), ...patch } }));
  }

  function stockOf(stockItemId) {
    return stockItems.find((x) => x.id === stockItemId);
  }

  function resetCheckoutForm() {
    setTechnicianIds([""]);
    setProductRows([emptyProductRow()]);
    setError("");
    Object.values(productRowSearchTimers.current).forEach(clearTimeout);
    productRowSearchTimers.current = {};
    setProductRowDebouncedSearch({});
  }

  // Bir ustanın grup başlığındaki "+" butonundan bir çırak seçildiğinde —
  // "Yeni Zimmet" formunu o çırak seçili olarak açar, dispatcher o günkü
  // usta-çırak eşleşmesini hatırlamak zorunda kalmadan hızlıca zimmetleyebilsin.
  function startCheckoutForApprentice(apprenticeId) {
    setApprenticePickerForTech(null);
    resetCheckoutForm();
    setTechnicianIds([apprenticeId]);
    setShowCheckoutModal(true);
  }

  function updateTechnicianAt(idx, value) {
    setTechnicianIds((prev) => prev.map((id, i) => (i === idx ? value : id)));
  }

  function addTechnicianSlot() {
    setTechnicianIds((prev) => [...prev, ""]);
  }

  function removeTechnicianAt(idx) {
    setTechnicianIds((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleCheckout(e) {
    e.preventDefault();
    setError("");
    const validTechnicianIds = [...new Set(technicianIds.filter(Boolean))];
    if (validTechnicianIds.length === 0) {
      setError("En az bir teknisyen seçin.");
      return;
    }
    const validRows = productRows.filter((r) => r.selectedStock && Number(r.qty) > 0);
    if (validRows.length === 0) {
      setError("En az bir ürün seçip miktar girin.");
      return;
    }

    // Aynı ürün her seçili kişiye AYRI AYRI zimmetleniyor — stoktan da o
    // kadar kez düşüyor, bu yüzden yetersizlik uyarısı kişi sayısıyla
    // çarpılmış toplam ihtiyacı göstermeli.
    for (const r of validRows) {
      const totalNeeded = Number(r.qty) * validTechnicianIds.length;
      if (totalNeeded > Number(r.selectedStock.quantity)) {
        const proceed = window.confirm(
          `${r.selectedStock.code}: ${validTechnicianIds.length} kişiye ${r.qty} adet zimmetlemek toplam ${totalNeeded} adet gerektiriyor, stokta sadece ${r.selectedStock.quantity} ${r.selectedStock.unit || "adet"} görünüyor. Yine de zimmetlensin mi?`
        );
        if (!proceed) return;
      }
    }

    setSaving(true);
    // Birden fazla kişi seçildiyse (aynı araçla birlikte gidenler) hepsinin
    // zimmeti ortak bir "groupId" paylaşır ki listede ayrı ayrı değil, tek
    // bir başlık altında (isimler yan yana) gösterilebilsinler. Tek kişilik
    // zimmetlerde grup kavramı anlamsız, groupId gönderilmiyor.
    const groupId = validTechnicianIds.length > 1 ? crypto.randomUUID() : null;
    try {
      // Ard arda (transaction yok) — bir satır başarısız olursa öncekiler
      // zaten kaydedilmiş olur, onChanged() yine de en güncel durumu getirir.
      for (const techId of validTechnicianIds) {
        for (const r of validRows) {
          await window.api.addPartCheckout({
            technicianId: techId,
            stockItemId: r.selectedStock.id,
            date,
            qtyTaken: Number(r.qty),
            actingUserId: currentUser?.id,
            groupId,
          });
        }
      }
      resetCheckoutForm();
      setShowCheckoutModal(false);
      onChanged?.();
    } catch (err) {
      setError(err.message);
      onChanged?.();
    } finally {
      setSaving(false);
    }
  }

  async function handleReconcile(checkout) {
    const draft = draftFor(checkout.id);
    const qtyUsed = Number(draft.qtyUsed) || 0;
    const qtyReturned = Number(draft.qtyReturned) || 0;
    const qtyStoredInVehicle = Number(draft.qtyStoredInVehicle) || 0;
    if (qtyUsed + qtyReturned + qtyStoredInVehicle !== checkout.qtyTaken) {
      window.alert(
        `Kullanılan + iade edilen + arabada depolanan, alınan miktara (${checkout.qtyTaken}) eşit olmalı.`
      );
      return;
    }
    try {
      await window.api.reconcilePartCheckout(checkout.id, {
        qtyUsed,
        qtyReturned,
        qtyStoredInVehicle,
        appointmentId: draft.appointmentId || null,
        actingUserId: currentUser?.id,
      });
      setReconcileDrafts((prev) => {
        const next = { ...prev };
        delete next[checkout.id];
        return next;
      });
      setEditingReconcileId(null);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    }
  }

  // Zaten mutabakatı yapılmış bir kaydı düzeltmek için — mevcut kullanılan/
  // iade/randevu değerlerini forma önceden doldurup aynı formu tekrar açar.
  function startEditReconcile(checkout) {
    setReconcileDrafts((prev) => ({
      ...prev,
      [checkout.id]: {
        qtyUsed: checkout.qtyUsed != null ? String(checkout.qtyUsed) : "",
        qtyReturned: checkout.qtyReturned != null ? String(checkout.qtyReturned) : "",
        qtyStoredInVehicle: checkout.qtyStoredInVehicle != null ? String(checkout.qtyStoredInVehicle) : "",
        appointmentId: checkout.appointmentId || "",
      },
    }));
    setEditingReconcileId(checkout.id);
  }

  function startEditItem(checkout) {
    setEditingItemId(checkout.id);
    setItemEditDraft({ search: "", selectedStock: stockOf(checkout.stockItemId) || null, qty: String(checkout.qtyTaken) });
  }

  function cancelEditItem() {
    setEditingItemId(null);
  }

  async function saveEditItem(checkoutId) {
    if (!itemEditDraft.selectedStock) {
      window.alert("Ürün seçin.");
      return;
    }
    const qtyNum = Number(itemEditDraft.qty);
    if (!qtyNum || qtyNum <= 0) {
      window.alert("Miktar 0'dan büyük olmalı.");
      return;
    }
    try {
      // Alınan ürün/miktar değiştiği için önceki mutabakat (varsa) artık
      // geçersiz — kayıt "outstanding"e döner, dispatcher yeniden mutabakat
      // yapar.
      await window.api.updatePartCheckout(checkoutId, {
        stockItemId: itemEditDraft.selectedStock.id,
        qtyTaken: qtyNum,
        status: "outstanding",
        qtyUsed: null,
        qtyReturned: null,
        qtyStoredInVehicle: null,
        appointmentId: null,
        actingUserId: currentUser?.id,
      });
      setEditingItemId(null);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    }
  }

  async function handleDeleteCheckout(checkout) {
    const stock = stockOf(checkout.stockItemId);
    const label = stock ? `${stock.code} — ${stock.name}` : "bu ürün";
    if (!window.confirm(`${label} (${checkout.qtyTaken} adet) zimmet kaydı silinsin mi?`)) return;
    try {
      await window.api.deletePartCheckout(checkout.id, currentUser?.id);
      onChanged?.();
    } catch (err) {
      window.alert(err.message);
    }
  }

  function handlePrint() {
    // Liste birden fazla sayfaya taşabiliyor — alt ortada "X / Y" sayfa
    // numarası göstersin diye (bkz. electron/main.js'teki print:current).
    window.api.printCurrent({ showPageNumber: true });
  }

  return (
    <div>
      <div
        className="card"
        style={{
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <label style={{ maxWidth: 200, marginBottom: 0 }}>
          Tarih
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="secondary" onClick={handlePrint}>
            Yazdır
          </button>
          <button type="button" className="primary" onClick={() => setShowCheckoutModal(true)}>
            + Zimmet Ekle
          </button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{date} Zimmetleri</h3>
        {byTechnician.size === 0 && (
          <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
            <EmptyStateIllustration />
            <p>Bu tarih için zimmet yok.</p>
          </div>
        )}
        {sortedTechnicianEntries.map(([groupKey, rows, groupTechnicians]) => {
          const isExpanded = expandedTechIds.has(groupKey);
          // Grup birden fazla kişiden oluşuyorsa "çırağa zimmetle" butonu
          // grubun ilk kişisiyle eşleştirir — yeni, ayrı bir zimmet açar,
          // mevcut grubu değiştirmez.
          const primaryTechId = groupTechnicians[0]?.id;
          return (
            <div key={groupKey} style={{ marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                <button
                  type="button"
                  onClick={() => toggleTechExpanded(groupKey)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    flex: 1,
                    minWidth: 0,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    padding: "0.4rem 0",
                    textAlign: "left",
                    color: "inherit",
                    font: "inherit",
                  }}
                >
                  {isExpanded ? (
                    <ChevronDown size={16} strokeWidth={1.75} />
                  ) : (
                    <ChevronRight size={16} strokeWidth={1.75} />
                  )}
                  {/* Aynı araçla birlikte giden birden fazla kişi seçildiyse
                      (bkz. Yeni Zimmet formundaki "Başka Kişi Ekle") isimler
                      burada yan yana, virgülle ayrılmış tek bir başlıkta. */}
                  <h4 style={{ margin: 0 }}>
                    {groupTechnicians.length > 0
                      ? groupTechnicians.map((t) => t.name).join(", ")
                      : "Bilinmeyen teknisyen"}
                  </h4>
                  <small style={{ opacity: 0.6 }}>({rows.length} kalem)</small>
                </button>
                {apprentices.length > 0 && (
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Bugün bu ustayla giden bir çırağa zimmetle"
                      aria-label="Çırağa zimmetle"
                      onClick={() =>
                        setApprenticePickerForTech((prev) => (prev === primaryTechId ? null : primaryTechId))
                      }
                    >
                      <Plus size={14} strokeWidth={1.75} />
                    </button>
                    {apprenticePickerForTech === primaryTechId && (
                      <div
                        style={{
                          position: "absolute",
                          top: "calc(100% + 4px)",
                          right: 0,
                          background: "var(--card-bg)",
                          border: "1px solid var(--border)",
                          borderRadius: 10,
                          boxShadow: "var(--shadow)",
                          minWidth: 180,
                          zIndex: 20,
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ padding: "0.4rem 0.6rem", opacity: 0.6, fontSize: "0.75rem" }}>
                          Bugün {groupTechnicians[0]?.name || "bu usta"} ile giden çırak
                        </div>
                        {apprentices.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="dropdown-item"
                            onClick={() => startCheckoutForApprentice(a.id)}
                          >
                            {a.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              {isExpanded &&
                rows.map((c) => {
                  const stock = stockOf(c.stockItemId);
                  const isEditingThisItem = editingItemId === c.id;
                  const editMatches = itemEditDraft.selectedStock ? [] : stockMatchesFor(itemEditDebouncedSearch);
                  const showReconcileForm = c.status !== "reconciled" || editingReconcileId === c.id;
                  // Grup birden fazla kişiden oluşabildiği için (bkz. yukarı)
                  // randevu listesi HER SATIRIN kendi teknisyenine göre —
                  // grubun ilk kişisine göre değil.
                  const techAppointments = appointments.filter(
                    (a) => a.assignedTechnicianId === c.technicianId && a.scheduledDate === date
                  );
                  return (
                    <div
                      key={c.id}
                      style={{
                        padding: "0.5rem 0",
                        borderBottom: "1px solid var(--border)",
                        opacity: c.status === "reconciled" && !showReconcileForm ? 0.6 : 1,
                      }}
                    >
                      {isEditingThisItem ? (
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                          <label style={{ position: "relative", flex: 1, minWidth: 200, marginBottom: 0 }}>
                            Ürün
                            <input
                              ref={itemEditInputRef}
                              value={
                                itemEditDraft.selectedStock
                                  ? `${itemEditDraft.selectedStock.code} — ${itemEditDraft.selectedStock.name}`
                                  : itemEditDraft.search
                              }
                              onChange={(e) =>
                                setItemEditDraft((d) => ({ ...d, selectedStock: null, search: e.target.value }))
                              }
                              placeholder="Kod veya isimle ara"
                              autoFocus
                            />
                            {editMatches.length > 0 && (
                              <SuggestionDropdown anchorRef={itemEditInputRef}>
                                {editMatches.map((s) => (
                                  <div
                                    key={s.id}
                                    onClick={() => setItemEditDraft((d) => ({ ...d, selectedStock: s, search: "" }))}
                                    style={{
                                      padding: "0.4rem 0.6rem",
                                      cursor: "pointer",
                                      borderBottom: "1px solid var(--border)",
                                    }}
                                  >
                                    <strong>{s.code}</strong> {s.name}
                                    {s.barcode && (
                                      <QrCode
                                        size={13}
                                        strokeWidth={1.75}
                                        title={`Barkod: ${s.barcode}`}
                                        style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                                      />
                                    )}
                                  </div>
                                ))}
                              </SuggestionDropdown>
                            )}
                          </label>
                          <label style={{ maxWidth: 90, marginBottom: 0 }}>
                            Miktar
                            <input
                              type="number"
                              min="1"
                              value={itemEditDraft.qty}
                              onChange={(e) => setItemEditDraft((d) => ({ ...d, qty: e.target.value }))}
                            />
                          </label>
                          <button
                            type="button"
                            className="primary"
                            style={{ marginTop: "1.6rem" }}
                            onClick={() => saveEditItem(c.id)}
                          >
                            Kaydet
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            style={{ marginTop: "1.6rem" }}
                            onClick={cancelEditItem}
                          >
                            Vazgeç
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                          <div>
                            <strong>{stock ? `${stock.code} — ${stock.name}` : "Bilinmeyen ürün"}</strong> —{" "}
                            {c.qtyTaken} {stock?.unit || "adet"}
                            {stock?.price != null && (
                              <small style={{ opacity: 0.6, marginLeft: "0.4rem" }}>
                                {c.qtyTaken > 1 ? (
                                  <>
                                    (KDV dahil {formatPriceWithVat(stock.price)}/{stock.unit || "adet"} · toplam KDV
                                    dahil {formatPriceWithVat(Number(stock.price) * c.qtyTaken)})
                                  </>
                                ) : (
                                  <>(KDV dahil {formatPriceWithVat(stock.price)})</>
                                )}
                              </small>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "0.2rem", flexShrink: 0 }}>
                            <button
                              type="button"
                              className="icon-btn"
                              title="Ürünü/miktarı düzelt"
                              aria-label="Ürünü/miktarı düzelt"
                              onClick={() => startEditItem(c)}
                            >
                              <Pencil size={14} strokeWidth={1.75} />
                            </button>
                            <button
                              type="button"
                              className="icon-btn delete"
                              title="Zimmeti sil"
                              aria-label="Zimmeti sil"
                              onClick={() => handleDeleteCheckout(c)}
                            >
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          </div>
                        </div>
                      )}

                      {!isEditingThisItem &&
                        (showReconcileForm ? (
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              alignItems: "flex-end",
                              marginTop: "0.3rem",
                              flexWrap: "wrap",
                            }}
                          >
                            <label style={{ maxWidth: 90, marginBottom: 0 }}>
                              Kullanılan
                              <input
                                type="number"
                                min="0"
                                max={c.qtyTaken}
                                value={draftFor(c.id).qtyUsed}
                                onChange={(e) => updateDraft(c.id, { qtyUsed: e.target.value })}
                              />
                            </label>
                            <label style={{ maxWidth: 90, marginBottom: 0 }}>
                              İade
                              <input
                                type="number"
                                min="0"
                                max={c.qtyTaken}
                                value={draftFor(c.id).qtyReturned}
                                onChange={(e) => updateDraft(c.id, { qtyReturned: e.target.value })}
                              />
                            </label>
                            <label
                              style={{ maxWidth: 110, marginBottom: 0 }}
                              title="Kullanılmadı ama depoya iade edilmedi, teknisyen kendi aracında saklıyor"
                            >
                              Arabada
                              <input
                                type="number"
                                min="0"
                                max={c.qtyTaken}
                                value={draftFor(c.id).qtyStoredInVehicle}
                                onChange={(e) => updateDraft(c.id, { qtyStoredInVehicle: e.target.value })}
                              />
                            </label>
                            <label style={{ minWidth: 180, marginBottom: 0 }}>
                              Randevu (opsiyonel)
                              <select
                                value={draftFor(c.id).appointmentId}
                                onChange={(e) => updateDraft(c.id, { appointmentId: e.target.value })}
                              >
                                <option value="">{techAppointments.length ? "—" : "Bu tarihte randevusu yok"}</option>
                                {techAppointments.map((a) => (
                                  <option key={a.id} value={a.id}>
                                    {a.customerName}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button type="button" className="secondary" onClick={() => handleReconcile(c)}>
                              Mutabakat Yap
                            </button>
                            {c.status === "reconciled" && (
                              <button type="button" className="secondary" onClick={() => setEditingReconcileId(null)}>
                                Vazgeç
                              </button>
                            )}
                          </div>
                        ) : (
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              marginTop: "0.2rem",
                            }}
                          >
                            <small style={{ opacity: 0.8 }}>
                              Kullanılan: {c.qtyUsed} · İade: {c.qtyReturned}
                              {c.qtyStoredInVehicle > 0 && <> · Arabada: {c.qtyStoredInVehicle}</>}
                            </small>
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startEditReconcile(c)}
                              style={{ padding: "0.15rem 0.6rem", fontSize: "0.8rem" }}
                            >
                              Mutabakatı Düzelt
                            </button>
                          </div>
                        ))}
                    </div>
                  );
                })}
            </div>
          );
        })}
      </div>

      {showCheckoutModal && (
        <Modal
          onClose={() => {
            setShowCheckoutModal(false);
            resetCheckoutForm();
          }}
          maxWidth={560}
        >
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Yeni Zimmet</h3>
            <form onSubmit={handleCheckout}>
              {technicianIds.map((id, idx) => (
                <div key={idx} style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", marginTop: idx === 0 ? 0 : "0.5rem" }}>
                  <label style={{ flex: 1, marginBottom: 0 }}>
                    {idx === 0 ? "Teknisyen" : ""}
                    <select value={id} onChange={(e) => updateTechnicianAt(idx, e.target.value)}>
                      <option value="">Seçin</option>
                      {/* Usta/çırak ayrımı sadece otomatik rotalama için anlamlı
                          (bkz. masterTechnicians/apprentices tanımı) — burada
                          parça alan herkes eşit, gruplama/etiketleme olmadan
                          tek listede gösteriliyor. */}
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id} disabled={id !== t.id && technicianIds.includes(t.id)}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="icon-btn delete"
                    title="Bu kişiyi kaldır"
                    aria-label="Bu kişiyi kaldır"
                    onClick={() => removeTechnicianAt(idx)}
                    disabled={technicianIds.length === 1}
                  >
                    <Trash2 size={14} strokeWidth={1.75} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="secondary"
                onClick={addTechnicianSlot}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.5rem" }}
              >
                <Plus size={15} strokeWidth={1.75} />
                Başka Kişi Ekle
              </button>

              {productRows.map((row, idx) => {
                const matches = row.selectedStock ? [] : stockMatchesFor(productRowDebouncedSearch[row.key] || "");
                return (
                  <div
                    key={row.key}
                    style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", marginTop: "0.75rem" }}
                  >
                    <label style={{ position: "relative", flex: 1, marginBottom: 0 }}>
                      {idx === 0 ? "Ürün" : ""}
                      <input
                        ref={(el) => (productRowInputRefs.current[row.key] = el)}
                        value={row.selectedStock ? `${row.selectedStock.code} — ${row.selectedStock.name}` : row.search}
                        onChange={(e) => handleProductRowSearchChange(row, e.target.value)}
                        onKeyDown={(e) => handleProductRowKeyDown(e, row)}
                        placeholder="Kod, barkod veya isimle ara — barkod taratılabilir"
                        autoFocus={idx === 0}
                      />
                      {matches.length > 0 && (
                        <SuggestionDropdown anchorRef={{ current: productRowInputRefs.current[row.key] }}>
                          {matches.map((s) => (
                            <div
                              key={s.id}
                              onClick={() => selectStockForRow(row, s)}
                              style={{
                                padding: "0.4rem 0.6rem",
                                cursor: "pointer",
                                borderBottom: "1px solid var(--border)",
                              }}
                            >
                              <strong>{s.code}</strong> {s.name}
                              {s.barcode && (
                                <QrCode
                                  size={13}
                                  strokeWidth={1.75}
                                  title={`Barkod: ${s.barcode}`}
                                  style={{ marginLeft: "0.25rem", verticalAlign: "middle", color: "var(--text)" }}
                                />
                              )}{" "}
                              <small style={{ opacity: 0.7 }}>
                                ({s.quantity} {s.unit || "adet"}
                                {s.price != null && <> · KDV dahil {formatPriceWithVat(s.price)}</>})
                              </small>
                            </div>
                          ))}
                        </SuggestionDropdown>
                      )}
                      {row.selectedStock?.price != null && (
                        <small style={{ opacity: 0.7, display: "block", marginTop: "0.2rem" }}>
                          Birim fiyat, KDV dahil (bilgi amaçlı, kaydedilmez): {formatPriceWithVat(row.selectedStock.price)}
                        </small>
                      )}
                    </label>
                    <label style={{ maxWidth: 90, marginBottom: 0 }}>
                      {idx === 0 ? "Miktar" : ""}
                      <input
                        type="number"
                        min="1"
                        value={row.qty}
                        onChange={(e) => updateProductRow(row.key, { qty: e.target.value })}
                      />
                    </label>
                    <button
                      type="button"
                      className="icon-btn delete"
                      title="Bu satırı kaldır"
                      aria-label="Bu satırı kaldır"
                      onClick={() => removeProductRow(row.key)}
                      disabled={productRows.length === 1}
                      style={{ marginTop: idx === 0 ? "1.6rem" : 0 }}
                    >
                      <Trash2 size={14} strokeWidth={1.75} />
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                className="secondary"
                onClick={addProductRow}
                style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginTop: "0.75rem" }}
              >
                <Plus size={15} strokeWidth={1.75} />
                Ürün Ekle
              </button>

              {error && <p style={{ color: "var(--danger)" }}>{error}</p>}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
                <button type="submit" className="primary" disabled={saving}>
                  Zimmetle
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setShowCheckoutModal(false);
                    resetCheckoutForm();
                  }}
                >
                  Vazgeç
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}

      <PartCheckoutsPrintView date={date} groups={printGroups} />
    </div>
  );
}
