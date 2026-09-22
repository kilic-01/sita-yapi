import { useRef, useState } from "react";
import { Upload, Download } from "lucide-react";
import { parseCSV, stringifyCSV } from "../lib/csv.js";

const HEADER_ALIASES = {
  code: ["code", "kod", "ürün kodu", "urun kodu", "ürün kod", "sku"],
  name: ["name", "ad", "isim", "ürün adı", "urun adi", "ürün açıklaması", "aciklama", "açıklama"],
  quantity: ["quantity", "miktar", "adet", "stok", "stok miktarı"],
  unit: ["unit", "birim"],
  depot: ["depot", "depo", "warehouse", "lokasyon"],
  category: ["category", "kategori", "kategoriler"],
  price: ["price", "fiyat", "birim fiyat"],
  imageUrl: ["imageurl", "image", "görsel", "gorsel", "resim", "resim url", "image url"],
  barcode: ["barcode", "barkod"],
};

export default function StockCsvSection({ stockItems, onStockSaved, depots, onDepotsSaved, currentUser }) {
  const [importSummary, setImportSummary] = useState("");
  const fileInputRef = useRef(null);

  const depotName = (id) => depots.find((d) => d.id === id)?.name || "";

  async function handleImportFile(file) {
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length === 0) return;

    let dataRows = rows;
    let colIndex = { code: 0, name: 1, quantity: 2, unit: 3 };
    const firstRow = rows[0].map((c) => c.trim().toLowerCase());
    const looksLikeHeader = Object.values(HEADER_ALIASES).some((aliases) =>
      firstRow.some((cell) => aliases.includes(cell))
    );
    if (looksLikeHeader) {
      // Başlık satırı varsa SADECE eşleşen sütunlar kullanılır — eşleşmeyen
      // bir alan pozisyonel varsayılana düşüp yanlış bir sütunu okumasın diye
      // tanımsız bırakılır.
      colIndex = {};
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        const idx = firstRow.findIndex((cell) => aliases.includes(cell));
        if (idx !== -1) colIndex[field] = idx;
      }
      dataRows = rows.slice(1);
    }

    // Depo adını depoId'ye çevirir; kayıtlı değilse yeni depo olarak ekler.
    const depotByName = new Map(depots.map((d) => [d.name.trim().toLowerCase(), d]));
    const newDepots = [];
    function resolveDepotId(rawName) {
      const name = (rawName || "").trim();
      if (!name) return null;
      const key = name.toLowerCase();
      let depot = depotByName.get(key);
      if (!depot) {
        depot = { id: crypto.randomUUID(), name };
        depotByName.set(key, depot);
        newDepots.push(depot);
      }
      return depot.id;
    }

    const byKey = new Map(
      stockItems.map((s) => [`${(s.code || "").trim().toLowerCase()}|${s.depotId || ""}`, s])
    );
    const updated = [...stockItems];
    let added = 0;
    let updatedCount = 0;
    for (const row of dataRows) {
      const code = (row[colIndex.code] || "").trim();
      if (!code) continue;
      const name = (row[colIndex.name] || "").trim();
      const quantityRaw = row[colIndex.quantity];
      const quantity = quantityRaw !== undefined && quantityRaw !== "" ? Number(quantityRaw) || 0 : 0;
      const unit = (row[colIndex.unit] || "").trim() || "adet";
      const depotId = resolveDepotId(row[colIndex.depot]);
      const category = (row[colIndex.category] || "").trim();
      const priceRaw = row[colIndex.price];
      const price = priceRaw !== undefined && priceRaw !== "" ? Number(priceRaw) || 0 : null;
      const imageUrl = (row[colIndex.imageUrl] || "").trim();
      const barcode = (row[colIndex.barcode] || "").trim();
      const key = `${code.toLowerCase()}|${depotId || ""}`;
      const existing = byKey.get(key);
      if (existing) {
        Object.assign(existing, {
          code,
          name: name || existing.name,
          quantity,
          unit,
          depotId,
          category: category || existing.category,
          price: price != null ? price : existing.price,
          imageUrl: imageUrl || existing.imageUrl,
          barcode: barcode || existing.barcode,
        });
        updatedCount++;
      } else {
        const item = { id: crypto.randomUUID(), code, name, quantity, unit, depotId, category, price, imageUrl, barcode };
        updated.push(item);
        byKey.set(key, item);
        added++;
      }
    }
    if (newDepots.length > 0) {
      const savedDepots = await window.api.setDepots([...depots, ...newDepots], currentUser?.id);
      onDepotsSaved?.(savedDepots);
    }
    const saved = await window.api.setStockItems(updated, currentUser?.id);
    onStockSaved(saved);
    setImportSummary(
      `İçe aktarma tamamlandı: ${added} yeni, ${updatedCount} güncellendi.` +
        (newDepots.length > 0 ? ` ${newDepots.length} yeni depo oluşturuldu.` : "")
    );
  }

  function handleExport() {
    const rows = [
      ["code", "name", "quantity", "unit", "depot", "category", "price", "imageUrl", "barcode"],
      ...stockItems.map((s) => [
        s.code,
        s.name,
        s.quantity,
        s.unit,
        depotName(s.depotId),
        s.category || "",
        s.price ?? "",
        s.imageUrl || "",
        s.barcode || "",
      ]),
    ];
    const blob = new Blob([stringifyCSV(rows)], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stok.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p style={{ marginTop: 0 }}>
        Stok listesini toplu şekilde bir CSV dosyasından yükleyin veya dışa aktarın. CSV
        dosyasında "code, name, quantity, unit, depot, category, price, imageUrl" (veya "kod, ad,
        miktar, birim, depo, kategori, fiyat, görsel") başlıklı sütunlar olmalı. Kod zaten
        kayıtlıysa güncellenir, yoksa yeni eklenir. Depo sütunundaki isim kayıtlı değilse otomatik
        oluşturulur.
      </p>
      <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
          <Upload size={15} strokeWidth={1.75} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />
          CSV İçe Aktar
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = "";
          }}
        />
        <button type="button" className="secondary" onClick={handleExport}>
          <Download size={15} strokeWidth={1.75} style={{ verticalAlign: "-2px", marginRight: "0.3rem" }} />
          CSV Dışa Aktar
        </button>
      </div>
      {importSummary && <div className="success">{importSummary}</div>}
    </div>
  );
}
