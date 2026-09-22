import { useMemo, useState } from "react";
import { PencilIcon, TrashIcon } from "./icons.jsx";
import { Search, Plus, QrCode } from "lucide-react";
import { EmptyStateIllustration } from "./illustrations.jsx";
import Modal from "./Modal.jsx";
import { isLowStock } from "../lib/format.js";

const NO_CATEGORY = "(kategorisiz)";

const SEARCH_RESULT_LIMIT = 100;

// Bir "datalist" ile serbest metin alanı, seçimden sonra bazen değiştirmeye
// izin vermiyormuş gibi davranabiliyordu — bunun yerine her zaman güvenilir
// şekilde değiştirilebilen normal bir açılır menü + "yeni kategori" modu.
function CategoryPicker({ value, onChange, categories, style }) {
  const [customMode, setCustomMode] = useState(Boolean(value) && !categories.includes(value));

  if (customMode || categories.length === 0) {
    return (
      <div style={{ display: "flex", gap: "0.3rem" }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Kategori adı"
          style={style}
        />
        {categories.length > 0 && (
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setCustomMode(false);
              onChange("");
            }}
          >
            Listeden Seç
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__new__") {
          setCustomMode(true);
          onChange("");
        } else {
          onChange(e.target.value);
        }
      }}
      style={style}
    >
      <option value="">Seçin...</option>
      {categories.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
      <option value="__new__">+ Yeni kategori...</option>
    </select>
  );
}

export default function StockPage({ stockItems, onSaved, depots = [], initialSearch = "", currentUser }) {
  const [search, setSearch] = useState(initialSearch);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const [newItem, setNewItem] = useState({
    code: "",
    name: "",
    quantity: "",
    unit: "adet",
    depotId: "",
    category: "",
    price: "",
    imageUrl: "",
    barcode: "",
  });
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [zoomImage, setZoomImage] = useState(null); // { url, label }

  // Binlerce satırlı stok listesinde bu türetilmiş diziler useMemo OLMADAN
  // her render'da (ör. arama kutusuna her harf girildiğinde) baştan
  // hesaplanıyordu — kategoriler/düşük stok listesi arama terimiyle hiç
  // ilgili olmadığı halde her tuş vuruşunda yeniden taranıyordu, arama
  // kasılmasının asıl sebebi buydu.
  const categories = useMemo(
    () =>
      [...new Set(stockItems.map((s) => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")),
    [stockItems]
  );

  const depotName = (id) => depots.find((d) => d.id === id)?.name || "";

  // Binlerce satırlı bu tabloda her tekil değişiklikte TÜM listeyi ağa
  // göndermemek için satır bazlı uçlar (addStockItem/updateStockItem/
  // deleteStockItem) kullanılır — sadece CSV içe aktarma toplu setStockItems
  // kullanır (bkz. StockCsvSection.jsx).
  async function updateItem(id, patch) {
    const saved = await window.api.updateStockItem(id, patch, currentUser?.id);
    onSaved(stockItems.map((s) => (s.id === id ? saved : s)));
    return saved;
  }

  async function deleteItem(item) {
    if (!window.confirm(`"${item.name || item.code}" stok kaydını silmek istediğinize emin misiniz?`)) {
      return;
    }
    await window.api.deleteStockItem(item.id, currentUser?.id);
    onSaved(stockItems.filter((s) => s.id !== item.id));
  }

  function handleQuantityDraft(item, value) {
    setQuantityDrafts((d) => ({ ...d, [item.id]: value }));
  }

  function commitQuantity(item) {
    const draft = quantityDrafts[item.id];
    if (draft === undefined) return;
    setQuantityDrafts((d) => {
      const next = { ...d };
      delete next[item.id];
      return next;
    });
    const value = Math.max(0, Number(draft) || 0);
    if (value !== Number(item.quantity)) updateItem(item.id, { quantity: value });
  }

  function startEdit(item) {
    setEditingId(item.id);
    setEditDraft({ ...item });
  }

  async function saveEdit() {
    const patch = {
      ...editDraft,
      lowStockThreshold: editDraft.lowStockThreshold === "" ? null : Number(editDraft.lowStockThreshold),
    };
    await updateItem(editingId, patch);
    setEditingId(null);
    setEditDraft(null);
  }

  async function handleAddItem(e) {
    e.preventDefault();
    if (!newItem.code.trim()) return;
    const saved = await window.api.addStockItem(
      {
        code: newItem.code.trim(),
        name: newItem.name.trim(),
        quantity: Number(newItem.quantity) || 0,
        unit: newItem.unit.trim() || "adet",
        depotId: newItem.depotId || null,
        category: newItem.category.trim(),
        price: newItem.price !== "" ? Number(newItem.price) : null,
        imageUrl: newItem.imageUrl.trim(),
        barcode: newItem.barcode.trim(),
      },
      currentUser?.id
    );
    onSaved([...stockItems, saved]);
    setNewItem({
      code: "",
      name: "",
      quantity: "",
      unit: "adet",
      depotId: newItem.depotId,
      category: newItem.category,
      price: "",
      imageUrl: "",
      barcode: "",
    });
  }

  const term = search.trim().toLowerCase();
  const isFiltering = Boolean(term || categoryFilter);
  const lowStock = useMemo(() => stockItems.filter(isLowStock), [stockItems]);
  const filteredResults = useMemo(() => {
    if (!isFiltering) return [];
    return stockItems.filter((s) => {
      if (categoryFilter) {
        const itemCategory = s.category || NO_CATEGORY;
        if (itemCategory !== categoryFilter) return false;
      }
      if (term) {
        return (
          (s.code || "").toLowerCase().includes(term) ||
          (s.name || "").toLowerCase().includes(term) ||
          (s.barcode || "").toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [stockItems, isFiltering, categoryFilter, term]);
  const displayList = isFiltering ? filteredResults.slice(0, SEARCH_RESULT_LIMIT) : lowStock;

  function renderRow(item) {
    return (
      <div
        key={item.id}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          borderBottom: "1px solid var(--border)",
          padding: "0.5rem 0",
        }}
      >
        {item.imageUrl && (
          <button
            type="button"
            onClick={() => setZoomImage({ url: item.imageUrl, label: item.name || item.code })}
            title="Görseli büyüt"
            style={{
              padding: 0,
              border: "none",
              background: "none",
              cursor: "zoom-in",
              flexShrink: 0,
              lineHeight: 0,
            }}
          >
            <img
              src={item.imageUrl}
              alt=""
              style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
              onError={(e) => {
                e.currentTarget.closest("button").style.display = "none";
              }}
            />
          </button>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{item.code}</strong>
          {item.name && <small style={{ opacity: 0.7 }}> — {item.name}</small>}
          {item.barcode && (
            <QrCode
              size={14}
              strokeWidth={1.75}
              title={`Barkod: ${item.barcode}`}
              style={{ marginLeft: "0.4rem", verticalAlign: "middle", color: "var(--text)" }}
            />
          )}
          {item.price != null && (
            <small style={{ opacity: 0.7 }}>
              {" "}
              · KDV hariç ₺{Number(item.price).toLocaleString("tr-TR")} · KDV dahil (%20){" "}
              <strong style={{ opacity: 1, color: "var(--text)" }}>
                ₺{(Number(item.price) * 1.2).toLocaleString("tr-TR", { maximumFractionDigits: 2 })}
              </strong>
            </small>
          )}
          {item.depotId && (
            <>
              {" "}
              <small
                style={{
                  color: "var(--accent)",
                  border: "1px solid var(--accent)",
                  borderRadius: 999,
                  padding: "0.05rem 0.5rem",
                }}
              >
                {depotName(item.depotId) || "Bilinmeyen depo"}
              </small>
            </>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <input
            type="number"
            min="0"
            value={quantityDrafts[item.id] ?? item.quantity}
            onChange={(e) => handleQuantityDraft(item, e.target.value)}
            onBlur={() => commitQuantity(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            style={{ width: 70, textAlign: "center" }}
          />
          <small>{item.unit || "adet"}</small>
        </div>
        <button
          type="button"
          className="icon-btn edit"
          title="Düzenle"
          aria-label="Düzenle"
          onClick={() => startEdit(item)}
        >
          <PencilIcon />
        </button>
        {currentUser?.role === "admin" && (
          <button
            type="button"
            className="icon-btn delete"
            title="Sil"
            aria-label="Sil"
            onClick={() => deleteItem(item)}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card">
      <h3>Stok / Yedek Parça</h3>
      <p>
        {stockItems.length} kayıtlı ürün. Sipariş sekmesinde bir ürün kodu arattığınızda, burada
        kayıtlıysa mevcut miktar ve hangi depoda olduğu da gösterilir.
      </p>
      {depots.length === 0 && (
        <div className="error" style={{ marginBottom: "1rem" }}>
          Henüz depo tanımlanmamış — Ayarlar &gt; Depolar'dan ekleyin, sonra ürünlere depo
          atayabilirsiniz.
        </div>
      )}

      <button
        type="button"
        className="secondary"
        onClick={() => setShowAddForm((s) => !s)}
        style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}
      >
        <Plus
          size={16}
          strokeWidth={1.75}
          style={{ transform: showAddForm ? "rotate(45deg)" : "none", transition: "transform 0.2s ease" }}
        />
        Yeni Ürün Ekle
      </button>

      <div
        style={{
          display: "grid",
          gridTemplateRows: showAddForm ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease",
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <form
            onSubmit={handleAddItem}
            className="form-row"
            style={{ alignItems: "flex-end", marginBottom: "1.5rem" }}
          >
            <label>
              Yeni Ürün Kodu
              <input
                value={newItem.code}
                onChange={(e) => setNewItem((n) => ({ ...n, code: e.target.value }))}
              />
            </label>
            <label style={{ flex: 1 }}>
              Ürün Adı
              <input
                value={newItem.name}
                onChange={(e) => setNewItem((n) => ({ ...n, name: e.target.value }))}
              />
            </label>
            <label>
              Miktar
              <input
                type="number"
                min="0"
                value={newItem.quantity}
                onChange={(e) => setNewItem((n) => ({ ...n, quantity: e.target.value }))}
                style={{ width: 70 }}
              />
            </label>
            <label>
              Birim
              <input
                value={newItem.unit}
                onChange={(e) => setNewItem((n) => ({ ...n, unit: e.target.value }))}
                style={{ width: 80 }}
              />
            </label>
            <label>
              Depo
              <select
                value={newItem.depotId}
                onChange={(e) => setNewItem((n) => ({ ...n, depotId: e.target.value }))}
              >
                <option value="">Belirtilmemiş</option>
                {depots.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Kategori
              <CategoryPicker
                value={newItem.category}
                onChange={(v) => setNewItem((n) => ({ ...n, category: v }))}
                categories={categories}
                style={{ width: 140 }}
              />
            </label>
            <label>
              Fiyat (₺)
              <input
                type="number"
                min="0"
                value={newItem.price}
                onChange={(e) => setNewItem((n) => ({ ...n, price: e.target.value }))}
                style={{ width: 100 }}
              />
            </label>
            <label style={{ flex: 1 }}>
              Görsel URL
              <input
                value={newItem.imageUrl}
                onChange={(e) => setNewItem((n) => ({ ...n, imageUrl: e.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Barkod
              <input
                value={newItem.barcode}
                onChange={(e) => setNewItem((n) => ({ ...n, barcode: e.target.value }))}
                placeholder="Barkod okuyucuyla taratın ya da elle girin"
                style={{ width: 160 }}
              />
            </label>
            <button className="primary" type="submit">
              Ekle
            </button>
          </form>
        </div>
      </div>

      <div className="form-row" style={{ alignItems: "flex-end" }}>
        <label style={{ flex: 1 }}>
          Ara (kod, isim veya barkod)
          <div style={{ position: "relative" }}>
            <Search
              size={16}
              strokeWidth={1.75}
              style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Örn. 4453 ya da barkod numarası"
              style={{ paddingLeft: "2rem", width: "100%" }}
            />
          </div>
        </label>
        <label>
          Kategori
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">Tüm kategoriler</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {stockItems.some((s) => !s.category) && (
              <option value={NO_CATEGORY}>{NO_CATEGORY}</option>
            )}
          </select>
        </label>
      </div>

      {stockItems.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <EmptyStateIllustration />
          <p>Henüz stok kaydı eklenmedi.</p>
        </div>
      ) : (
        <>
          {!isFiltering && (
            <p>
              <small>
                Az stoklu ({lowStock.length}) ürünler aşağıda listelendi. Belirli bir ürünü bulmak
                için arayın veya bir kategori seçin.
              </small>
            </p>
          )}
          {displayList.length === 0 ? (
            <p>{isFiltering ? "Bu aramaya/kategoriye uyan ürün bulunamadı." : "Az stoklu ürün yok."}</p>
          ) : (
            <div>{displayList.map(renderRow)}</div>
          )}
          {isFiltering && filteredResults.length > SEARCH_RESULT_LIMIT && (
            <small style={{ opacity: 0.7 }}>
              +{filteredResults.length - SEARCH_RESULT_LIMIT} sonuç daha var — aramayı daraltın.
            </small>
          )}
        </>
      )}

      {editDraft && (
        <Modal
          onClose={() => {
            setEditingId(null);
            setEditDraft(null);
          }}
        >
          <form
            className="card"
            onSubmit={(e) => {
              e.preventDefault();
              saveEdit();
            }}
          >
            <h3>Ürünü Düzenle</h3>
            <div className="form-row">
              <label>
                Kod
                <input
                  value={editDraft.code}
                  onChange={(e) => setEditDraft((d) => ({ ...d, code: e.target.value }))}
                />
              </label>
              <label style={{ flex: 1 }}>
                Ad
                <input
                  value={editDraft.name}
                  onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Miktar
                <input
                  type="number"
                  min="0"
                  value={editDraft.quantity}
                  onChange={(e) => setEditDraft((d) => ({ ...d, quantity: e.target.value }))}
                  style={{ width: 90 }}
                />
              </label>
              <label>
                Birim
                <input
                  value={editDraft.unit}
                  onChange={(e) => setEditDraft((d) => ({ ...d, unit: e.target.value }))}
                  style={{ width: 90 }}
                />
              </label>
              <label>
                Depo
                <select
                  value={editDraft.depotId || ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, depotId: e.target.value || null }))}
                >
                  <option value="">Belirtilmemiş</option>
                  {depots.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Kategori
                <CategoryPicker
                  value={editDraft.category || ""}
                  onChange={(v) => setEditDraft((d) => ({ ...d, category: v }))}
                  categories={categories}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Fiyat (₺)
                <input
                  type="number"
                  min="0"
                  value={editDraft.price ?? ""}
                  onChange={(e) =>
                    setEditDraft((d) => ({ ...d, price: e.target.value !== "" ? Number(e.target.value) : null }))
                  }
                  style={{ width: 110 }}
                />
              </label>
              <label style={{ flex: 1 }}>
                Görsel URL
                <input
                  value={editDraft.imageUrl || ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, imageUrl: e.target.value }))}
                  placeholder="https://..."
                />
              </label>
            </div>
            <div className="form-row">
              <label style={{ flex: 1 }}>
                Barkod
                <input
                  value={editDraft.barcode || ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, barcode: e.target.value }))}
                  placeholder="Barkod okuyucuyla taratın ya da elle girin"
                />
              </label>
              <label style={{ flex: 1 }}>
                Az Stok Eşiği
                <input
                  type="number"
                  min={0}
                  value={editDraft.lowStockThreshold ?? ""}
                  onChange={(e) => setEditDraft((d) => ({ ...d, lowStockThreshold: e.target.value }))}
                  placeholder="Varsayılan: 2"
                />
              </label>
            </div>
            <button className="primary" type="submit">
              Kaydet
            </button>
            <button
              type="button"
              className="secondary"
              style={{ marginLeft: "0.6rem" }}
              onClick={() => {
                setEditingId(null);
                setEditDraft(null);
              }}
            >
              Vazgeç
            </button>
          </form>
        </Modal>
      )}

      {zoomImage && (
        <Modal onClose={() => setZoomImage(null)}>
          <div className="card" style={{ textAlign: "center" }}>
            <img
              src={zoomImage.url}
              alt={zoomImage.label}
              style={{ maxWidth: "100%", maxHeight: "70vh", objectFit: "contain" }}
            />
            <p style={{ margin: "0.75rem 0 0" }}>{zoomImage.label}</p>
            <button type="button" className="secondary" style={{ marginTop: "0.75rem" }} onClick={() => setZoomImage(null)}>
              Kapat
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
