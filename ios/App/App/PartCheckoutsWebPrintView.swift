import SwiftUI

/// Masaüstündeki src/components/PartCheckoutsPrintView.jsx ile aynı HTML
/// çıktısı — teknisyene göre gruplanmış, her kalemde mutabakat dökümü
/// ("Kullanıldı/İade/Arabada" ya da "Mutabakat bekleniyor").
struct PartCheckoutsWebPrintView: View {
    let date: String
    let checkouts: [PartCheckout]
    let techNames: [String: String]
    let stockById: [String: StockItem]

    var body: some View {
        WebPrintView(
            title: "Parça Zimmeti",
            html: PartCheckoutsPrintHTML.render(
                date: date,
                checkouts: checkouts,
                techNames: techNames,
                stockById: stockById
            ),
            shareFileName: "Zimmet-\(date)"
        )
    }
}

enum PartCheckoutsPrintHTML {
    private static func fmtQty(_ n: Double) -> String {
        n == n.rounded() ? String(Int(n)) : String(n)
    }

    /// src/components/PartCheckoutsPrintView.jsx'teki reconcileSummary ile
    /// birebir aynı kural — ilgili randevu bilgisi native tarafta henüz
    /// zimmet listesine çekilmediği için "Kullanıldı: (müşteri)" varyantı
    /// yerine her zaman miktar gösteriliyor (desktop'ın appointment=null
    /// dalıyla aynı davranış).
    private static func reconcileSummary(_ c: PartCheckout) -> String? {
        guard c.status == "reconciled" else { return "Mutabakat bekleniyor" }
        var parts: [String] = []
        if (c.qtyUsed ?? 0) > 0 { parts.append("Kullanıldı: \(fmtQty(c.qtyUsed ?? 0))") }
        if (c.qtyReturned ?? 0) > 0 { parts.append("İade: \(fmtQty(c.qtyReturned ?? 0))") }
        if (c.qtyStoredInVehicle ?? 0) > 0 { parts.append("Arabada: \(fmtQty(c.qtyStoredInVehicle ?? 0))") }
        return parts.isEmpty ? nil : parts.joined(separator: "  ·  ")
    }

    static func render(
        date: String,
        checkouts: [PartCheckout],
        techNames: [String: String],
        stockById: [String: StockItem]
    ) -> String {
        let h = PrintHTMLHelpers.self

        let grouped = Dictionary(grouping: checkouts) { $0.technicianId ?? "" }
        let groupKeys = grouped.keys.sorted {
            (techNames[$0] ?? "Bilinmeyen teknisyen") < (techNames[$1] ?? "Bilinmeyen teknisyen")
        }

        let groupsHTML: String
        if checkouts.isEmpty {
            groupsHTML = "<p>Bu tarih için zimmet yok.</p>"
        } else {
            groupsHTML = groupKeys.map { techId -> String in
                let rows = grouped[techId] ?? []
                let techName = techNames[techId] ?? "Bilinmeyen teknisyen"

                let itemsHTML = rows.map { c -> String in
                    let stock = c.stockItemId.flatMap { stockById[$0] }
                    let itemName = stock.map { "\(h.htmlEscape($0.code)) — \(h.htmlEscape($0.name))" } ?? "Bilinmeyen ürün"
                    let summary = reconcileSummary(c)
                    let isPending = c.status != "reconciled"
                    let summaryHTML = summary.map { s in
                        """
                        <div style="margin-top:0.1rem;font-size:0.75rem;color:\(isPending ? "#888" : "#555");\(isPending ? "font-style:italic;" : "")">\(h.htmlEscape(s))</div>
                        """
                    } ?? ""
                    return """
                    <div style="padding:0.25rem 0;border-bottom:0.5px solid #ddd;">
                      <div style="display:flex;align-items:baseline;gap:0.6rem;">
                        <span style="flex-shrink:0;font-size:0.82rem;font-weight:700;white-space:nowrap;min-width:3.5rem;">\(fmtQty(c.qtyTaken ?? 0)) \(h.htmlEscape(stock?.unit ?? "adet"))</span>
                        <span style="font-size:0.85rem;">\(itemName)</span>
                      </div>
                      \(summaryHTML)
                    </div>
                    """
                }.joined()

                return """
                <div style="margin-bottom:1rem;">
                  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:0.5rem;font-weight:700;font-size:0.95rem;border-bottom:1px solid #1a1a1a;padding-bottom:0.15rem;margin-bottom:0.3rem;">
                    <span>\(h.htmlEscape(techName))</span>
                    <span style="font-weight:400;font-size:0.75rem;color:#666;">\(rows.count) kalem</span>
                  </div>
                  \(itemsHTML)
                </div>
                """
            }.joined()
        }

        let body = """
        \(h.pageHeaderHTML(title: "Parça Zimmeti", subtitle: h.formatDateTR(date)))
        \(groupsHTML)
        \(h.footerHTML)
        """
        return h.pageShell(bodyHTML: body)
    }
}
