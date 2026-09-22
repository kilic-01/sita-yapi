import { useState } from "react";
import { Plus, Printer, FileDown, Mail, Trash2, Pencil, Search, X } from "lucide-react";
import QuoteForm from "./QuoteForm.jsx";
import QuotePrintView, { QuoteHeader, ItemTable, QuoteFooter, PRINT_CONTENT_STYLE } from "./QuotePrintView.jsx";
import { EmptyStateIllustration } from "./illustrations.jsx";
import Modal from "./Modal.jsx";
import { WhatsAppIcon } from "./icons.jsx";
import { computeTotals, formatMoney } from "../lib/orderTotals.js";

// Teklifin ekrandaki (yazdırma amaçlı değil, kullanıcının gözden geçirmesi
// için) önizlemesi — QuotePrintView'daki AYNI görsel bileşenleri (QuoteHeader/
// ItemTable/QuoteFooter) kullanır ama ".print-page" sınıfını (ve onun
// "sadece yazdırırken görünür" davranışını) HİÇ kullanmaz — bu yüzden gerçek
// yazdırma/PDF akışıyla asla çakışmaz, tek bir sürekli/kaydırılabilir sayfa
// olarak gösterir (çok sayfalı bölme mantığı burada gerekmiyor).
function QuotePreviewContent({ quote }) {
  const totals = computeTotals(quote.items || [], quote.discountRate);
  return (
    <div
      style={{
        // Gerçek PDF ile BİREBİR aynı iç dolgu/renk/zemin (PRINT_CONTENT_STYLE)
        // — sadece ekranda "kağıt yaprağı" gibi durması için gölge/ortalama
        // gibi dış görünüm eklenir, iç içerik stiline dokunmaz.
        ...PRINT_CONTENT_STYLE,
        maxWidth: "210mm",
        margin: "0 auto",
        boxShadow: "0 2px 14px rgba(0,0,0,0.18)",
        borderRadius: 4,
      }}
    >
      <QuoteHeader quote={quote} />
      <ItemTable items={quote.items || []} startIndex={0} />
      <QuoteFooter quote={quote} totals={totals} />
    </div>
  );
}

export default function QuotesPage({ quotes, onSaved, stockItems = [], currentUser }) {
  const [view, setView] = useState("list"); // "list" | "form"
  const [editingQuote, setEditingQuote] = useState(null);
  const [previewQuote, setPreviewQuote] = useState(null);
  const [selectedQuote, setSelectedQuote] = useState(null); // önizleme popup'ı
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState("newest"); // "newest" | "oldest"
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { type: "success" | "error", text }

  function startNew() {
    setEditingQuote(null);
    setView("form");
  }

  function startEdit(quote) {
    setSelectedQuote(null);
    setEditingQuote(quote);
    setView("form");
  }

  function handleSaved(quote) {
    onSaved(quote);
    setView("list");
    setEditingQuote(null);
  }

  async function handleDelete(quote) {
    if (!window.confirm(`"${quote.quoteNo}" teklifini silmek istediğinize emin misiniz?`)) return;
    await window.api.deleteQuote(quote.id, currentUser?.id);
    onSaved(null, quote.id);
    setSelectedQuote(null);
  }

  async function withPreview(quote, action) {
    setPreviewQuote(quote);
    setBusy(true);
    setNotice(null);
    // Yazdırma görünümünün DOM'a işlenmesini bekle.
    await new Promise((r) => setTimeout(r, 60));
    try {
      await action();
    } catch (err) {
      setNotice({ type: "error", text: err.message || "İşlem başarısız oldu." });
    } finally {
      setBusy(false);
    }
  }

  function handlePrint(quote) {
    withPreview(quote, async () => {
      window.api.printCurrent();
    });
  }

  function handlePdf(quote) {
    withPreview(quote, async () => {
      const fileName = `Teklif-${quote.quoteNo}-${quote.customerName}.pdf`.replace(/[/\\]/g, "-");
      const path = await window.api.generateQuotePdf(fileName);
      if (path) setNotice({ type: "success", text: `PDF oluşturuldu: ${path}` });
    });
  }

  function handleMail(quote) {
    // Müşteri kaydında e-posta olsun olmasın — kullanıcı her seferinde
    // istediği adrese gönderebilsin diye burada sorup teyit/değiştirme
    // imkanı veriyoruz. İptal edilirse hiçbir şey yapmayız.
    const email = window.prompt("Alıcı e-posta adresi:", quote.customerEmail || "");
    if (email === null) return;
    withPreview(quote, async () => {
      const fileName = `Teklif-${quote.quoteNo}-${quote.customerName}.pdf`.replace(/[/\\]/g, "-");
      const path = await window.api.generateQuotePdf(fileName);
      if (!path) return;
      await window.api.openQuoteMailClient(
        email,
        `Fiyat Teklifi — ${quote.quoteNo}`,
        `Merhaba,\n\nTeklifimiz ektedir.\n\nSita Yapı`,
        path
      );
      setNotice({ type: "success", text: "Mail programı açıldı — PDF'i Finder'dan sürükleyip ekleyin." });
    });
  }

  function handleWhatsapp(quote) {
    if (!quote.customerPhone) {
      setNotice({ type: "error", text: "Bu müşterinin telefon numarası kayıtlı değil." });
      return;
    }
    withPreview(quote, async () => {
      const fileName = `Teklif-${quote.quoteNo}-${quote.customerName}.pdf`.replace(/[/\\]/g, "-");
      const path = await window.api.generateQuotePdf(fileName);
      if (!path) return;
      await window.api.openQuoteWhatsapp(
        quote.customerPhone,
        `Merhaba, ${quote.quoteNo} numaralı teklifimiz ektedir.`,
        path
      );
      setNotice({ type: "success", text: "WhatsApp açıldı — PDF'i sürükleyip ekleyin." });
    });
  }

  if (view === "form") {
    return (
      <QuoteForm
        quote={editingQuote}
        onSaved={handleSaved}
        onCancel={() => setView("list")}
        stockItems={stockItems}
        currentUser={currentUser}
      />
    );
  }

  const term = search.trim().toLowerCase();
  const filteredQuotes = term
    ? quotes.filter((q) =>
        [q.quoteNo, q.customerName, q.contactName, q.customerPhone]
          .some((v) => (v || "").toLowerCase().includes(term))
      )
    : quotes;
  const sortedQuotes = [...filteredQuotes].sort((a, b) => {
    const cmp = (a.quoteDate || "") < (b.quoteDate || "") ? -1 : (a.quoteDate || "") > (b.quoteDate || "") ? 1 : 0;
    return sortOrder === "newest" ? -cmp : cmp;
  });

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3>Fiyat Teklifleri</h3>
        <button
          type="button"
          className="primary"
          onClick={startNew}
          style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
        >
          <Plus size={16} strokeWidth={1.75} />
          Yeni Teklif
        </button>
      </div>

      {notice && !selectedQuote && (
        <div className={notice.type} style={{ marginTop: "0.75rem" }}>
          {notice.text}
        </div>
      )}

      {quotes.length === 0 ? (
        <div style={{ textAlign: "center", padding: "1.5rem 0" }}>
          <EmptyStateIllustration />
          <p>Henüz teklif oluşturulmadı.</p>
        </div>
      ) : (
        <div style={{ marginTop: "1rem" }}>
          <div className="form-row" style={{ alignItems: "flex-end" }}>
            <label style={{ maxWidth: 340, flex: 1 }}>
              Ara (müşteri, teklif no, telefon)
              <div style={{ position: "relative" }}>
                <Search
                  size={16}
                  strokeWidth={1.75}
                  style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.5 }}
                />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Örn. Emre Kılıç ya da 2026-001"
                  style={{ paddingLeft: "2rem", width: "100%" }}
                />
              </div>
            </label>
            <label style={{ maxWidth: 200 }}>
              Sıralama
              <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
                <option value="newest">En Yeniden En Eskiye</option>
                <option value="oldest">En Eskiden En Yeniye</option>
              </select>
            </label>
          </div>
          {sortedQuotes.length === 0 ? (
            <p style={{ marginTop: "1rem" }}>Bu aramaya uyan teklif bulunamadı.</p>
          ) : (
            sortedQuotes.map((quote) => {
              const totals = computeTotals(quote.items || [], quote.discountRate);
              return (
                <div
                  key={quote.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    borderBottom: "1px solid var(--border)",
                    padding: "0.6rem 0",
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedQuote(quote)}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      textAlign: "left",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "inherit",
                    }}
                  >
                    <strong>{quote.quoteNo}</strong> — {quote.customerName}
                    <div style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                      {quote.quoteDate} · {formatMoney(totals.genelToplam)} {quote.currency}
                    </div>
                  </button>
                  <button
                    type="button"
                    className="icon-btn edit"
                    title="Düzenle"
                    aria-label="Düzenle"
                    onClick={() => startEdit(quote)}
                  >
                    <Pencil size={15} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Yazdır"
                    aria-label="Yazdır"
                    disabled={busy}
                    onClick={() => handlePrint(quote)}
                  >
                    <Printer size={15} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="PDF Oluştur"
                    aria-label="PDF Oluştur"
                    disabled={busy}
                    onClick={() => handlePdf(quote)}
                  >
                    <FileDown size={15} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="Mail Gönder"
                    aria-label="Mail Gönder"
                    disabled={busy}
                    onClick={() => handleMail(quote)}
                  >
                    <Mail size={15} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    title="WhatsApp Gönder"
                    aria-label="WhatsApp Gönder"
                    disabled={busy}
                    onClick={() => handleWhatsapp(quote)}
                  >
                    <WhatsAppIcon size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn delete"
                    title="Sil"
                    aria-label="Sil"
                    onClick={() => handleDelete(quote)}
                  >
                    <Trash2 size={15} strokeWidth={1.75} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {selectedQuote && (
        <Modal onClose={() => setSelectedQuote(null)} maxWidth={880}>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.4rem",
                padding: "0.75rem 1rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <strong style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedQuote.quoteNo} — {selectedQuote.customerName}
              </strong>
              <button
                type="button"
                className="icon-btn edit"
                title="Düzenle"
                aria-label="Düzenle"
                onClick={() => startEdit(selectedQuote)}
              >
                <Pencil size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Yazdır"
                aria-label="Yazdır"
                disabled={busy}
                onClick={() => handlePrint(selectedQuote)}
              >
                <Printer size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="PDF Oluştur"
                aria-label="PDF Oluştur"
                disabled={busy}
                onClick={() => handlePdf(selectedQuote)}
              >
                <FileDown size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Mail Gönder"
                aria-label="Mail Gönder"
                disabled={busy}
                onClick={() => handleMail(selectedQuote)}
              >
                <Mail size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="WhatsApp Gönder"
                aria-label="WhatsApp Gönder"
                disabled={busy}
                onClick={() => handleWhatsapp(selectedQuote)}
              >
                <WhatsAppIcon size={15} />
              </button>
              <button
                type="button"
                className="icon-btn delete"
                title="Sil"
                aria-label="Sil"
                onClick={() => handleDelete(selectedQuote)}
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Kapat"
                aria-label="Kapat"
                onClick={() => setSelectedQuote(null)}
              >
                <X size={15} strokeWidth={1.75} />
              </button>
            </div>

            {notice && (
              <div className={notice.type} style={{ margin: "0.75rem 1rem 0" }}>
                {notice.text}
              </div>
            )}

            <div style={{ background: "var(--bg)", padding: "1.5rem", maxHeight: "75vh", overflowY: "auto" }}>
              <QuotePreviewContent quote={selectedQuote} />
            </div>
          </div>
        </Modal>
      )}

      <QuotePrintView quote={previewQuote} />
    </div>
  );
}
