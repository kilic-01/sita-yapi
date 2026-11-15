import SwiftUI
import WebKit

/// "Birebir uygulamanın gösterdiği gibi" — elle SwiftUI ile yeniden çizmek
/// yerine, masaüstündeki gerçek yazdırma bileşeninin (src/components/
/// QuotePrintView.jsx) AYNI HTML/CSS'ini üretip gerçek bir WebKit
/// motorunda render ediyoruz. Renkler/ölçüler o dosyadan birebir kopyalandı.
struct QuoteWebPrintView: View {
    let quote: Quote

    var body: some View {
        WebPrintView(
            title: quote.quoteNo ?? "Teklif",
            html: QuotePrintHTML.render(quote),
            shareFileName: "Teklif-\(quote.quoteNo ?? quote.id)"
        )
    }
}

private func htmlEscape(_ s: String?) -> String {
    guard let s else { return "" }
    return s
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
}

private func money(_ n: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .decimal
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    formatter.groupingSeparator = "."
    formatter.decimalSeparator = ","
    formatter.locale = Locale(identifier: "tr_TR")
    return formatter.string(from: NSNumber(value: n)) ?? String(format: "%.2f", n)
}

private func formatDate(_ iso: String?) -> String {
    guard let iso, iso.count == 10 else { return "" }
    let parts = iso.split(separator: "-")
    guard parts.count == 3 else { return iso }
    return "\(parts[2])/\(parts[1])/\(parts[0])"
}

private func currencySymbol(_ code: String?) -> String {
    switch code {
    case "USD": return "$"
    case "EUR": return "€"
    default: return "₺"
    }
}

/// Bu enum'un TEK amacı: server/public-barkod'daki gibi ayrı bir "motor"
/// dosyası — src/components/QuotePrintView.jsx'teki HEADER_DARKEST/
/// HEADER_DARK/LABEL_BG/BORDER vb. sabitler ve InfoBox/ItemTable/
/// QuoteHeader/QuoteFooter yapısının HTML/CSS karşılığı.
enum QuotePrintHTML {
    /// assets/logo.svg'nin base64'ü — gerçek yazdırma çıktısındaki logoyla
    /// aynı dosya, WebView'a gömülü tek bir HTML string'i olarak vermek için.
    private static let brandLogoBase64 = "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxMDAwIDQzOCI+CiAgPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDMwLjMuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDIuMS4zIEJ1aWxkIDE4MikgIC0tPgogIDxnPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTM2NS4xNCwxNjguMzJjMTQuNTYsMCwzMS42MiwzLjE5LDMxLjYyLDE1Ljk1LDAsMi42NC0uODMsNi4xLTIuNSw5Ljk4LDAtMTQuNDItMTQuOTgtMTguMTYtMzAuMS0xOC4xNnMtMjYuNjMsNC4wMi0yNi42MywxOC41OGMwLDI4LjE1LDYyLjI3LDQuODUsNjIuMjcsNDQuOCwwLDE5LjQyLTE0LjU2LDI4LjU3LTM1LjIzLDI4LjU3LTE0LjU2LDAtMzMuMjgtNC4zLTMzLjI4LTE2LjIzLDAtMi43Ny42OS02LjI0LDIuMjItMTAuMTIsMCwxNC4wMSwxNS45NSwxOC41OCwzMS45LDE4LjU4LDE3LjQ3LDAsMjYuMDctNy45LDI2LjA3LTIwLjM5LDAtMzEuMi02Mi4yNy04Ljc0LTYyLjI3LTQ0LjUyLDAtMjAuOCwxNy4wNi0yNy4wNSwzNS45Mi0yNy4wNVoiLz4KICAgIDxwYXRoIGZpbGw9IiMwZTJhM2IiIGQ9Ik00MTguOTQsMTQ3LjI0aDcuMjFjMS4yNSwwLDEuNTMsMS4xMSwxLjUzLDEuOTR2Ny42M2gtNy4yMWMtLjgzLDAtMS41My0uOTctMS41My0xLjh2LTcuNzdaTTQxOS4yMiwxNjguNzRzOC4wNCwwLDguMDQsNi4xdjkyLjkycy04LjA0LDAtOC4wNC02LjF2LTkyLjkyWiIvPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTQ3OS42OSwxNzcuNjF2OTAuMTVzLTguMDQsMC04LjA0LTYuMXYtODQuMDVoLTI0LjI3Yy02LjkzLDAtOC4wNC02LjY1LTguMDQtOS40MywwLDAsMS4zOSwxLjk0LDEwLjI2LDEuOTRoNTIuN2M4Ljg3LDAsMTAuMTItMS45NCwxMC4xMi0xLjk0LDAsMi43OC0uOTcsOS40My03LjkxLDkuNDNoLTI0LjgzWiIvPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTU2Ni42NCwyMzQuMmgtNDMuODJsLTIuNzcsOS43MWMtMy4wNSwxMC41NC01LjU1LDIzLjU4LTE1LjY3LDIzLjU4LS40MiwwLS45NywwLTEuMzktLjE0LDMuNDctNS45NiwxMy4wNC0zOC4yOCwyMC4yNS02MS44Niw4LjQ2LTI3LjYsMjAuMjUtMzUuOTIsMjEuNDktMzYuODksMS4yNS45NywxMy4wNCw5LjI5LDIxLjUsMzYuODksNy4yMSwyMy41OCwxNi43OCw1NS44OSwyMC4yNSw2MS44Ni0uNDEuMTQtLjk3LjE0LTEuMzguMTQtMTAuMTMsMC0xMi42Mi0xMy4wNC0xNS42Ny0yMy41OGwtMi43OC05LjcxWk01NjQuNDIsMjI2LjU3bC01LjI3LTE3LjQ4Yy02LjExLTIwLjM4LTE0LjQzLTI5LjY4LTE0LjQzLTI5LjY4LDAsMC04LjMyLDkuMjktMTQuNDIsMjkuNjhsLTUuMjcsMTcuNDhoMzkuMzlaIi8+CiAgICA8cGF0aCBmaWxsPSIjMGUyYTNiIiBkPSJNNjYxLjkxLDIyNC4zNXY0My40MXMtOC4xOCwwLTguMTgtNi4yNHYtMzcuMTdjLTE1LjUzLTEzLjMyLTI3LjYtNDcuNzEtMzIuMzEtNTQuOTIsMCwwLDAtLjE0LDEuOC0uMTQsMy42MSwwLDYuOTMsMS4yNSwxMC41NCw3LjQ5LDQuMDIsNi43OSwxMi4yLDI5LjU0LDIzLjk5LDQwLjc3LDExLjc5LTExLjIzLDE5Ljk3LTMzLjk4LDIzLjk5LTQwLjc3LDMuNjEtNi4yNCw2LjkzLTcuNDksMTAuNTQtNy40OSwxLjgsMCwxLjguMTQsMS44LjE0LTQuNzEsNy4yMS0xNi43OCw0MS42LTMyLjMxLDU0LjkyaC4xNFoiLz4KICAgIDxwYXRoIGZpbGw9IiMwZTJhM2IiIGQ9Ik03NDguMywyMzQuMmgtNDMuODJsLTIuNzcsOS43MWMtMy4wNSwxMC41NC01LjU1LDIzLjU4LTE1LjY3LDIzLjU4LS40MiwwLS45NywwLTEuMzktLjE0LDMuNDctNS45NiwxMy4wNC0zOC4yOCwyMC4yNS02MS44Niw4LjQ2LTI3LjYsMjAuMjUtMzUuOTIsMjEuNS0zNi44OSwxLjI1Ljk3LDEzLjA0LDkuMjksMjEuNSwzNi44OSw3LjIxLDIzLjU4LDE2Ljc4LDU1Ljg5LDIwLjI1LDYxLjg2LS40MS4xNC0uOTcuMTQtMS4zOS4xNC0xMC4xMiwwLTEyLjYyLTEzLjA0LTE1LjY3LTIzLjU4bC0yLjc4LTkuNzFaTTc0Ni4wOSwyMjYuNTdsLTUuMjctMTcuNDhjLTYuMS0yMC4zOC0xNC40Mi0yOS42OC0xNC40Mi0yOS42OCwwLDAtOC4zMiw5LjI5LTE0LjQyLDI5LjY4bC01LjI3LDE3LjQ4aDM5LjM5WiIvPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTc3OS45MiwxNzAuMTJoMjIuNzRjMTkuNDIsMCwzNi40OCw1LjgzLDM2LjQ4LDI5Ljk2djIuNDljMCwyMy40NC0xNy4wNiwzMC4xLTM2LjQ4LDMwLjFoLTE0Ljd2MzUuMDlzLTguMDQsMC04LjA0LTYuMXYtOTEuNTRaTTc4Ny45NiwxNzcuNjF2NDcuNTdoMTQuN2MxNi42NCwwLDI4LjQzLTQuMDMsMjguNDMtMjMuODYsMC0xOC4zMS0xMS43OS0yMy43MS0yOC40My0yMy43MWgtMTQuN1oiLz4KICAgIDxwYXRoIGZpbGw9IiMwZTJhM2IiIGQ9Ik04NTguNDEsMTY4Ljc0czguMDUsMCw4LjA1LDYuMXY5Mi45MnMtOC4wNSwwLTguMDUtNi4xdi05Mi45MloiLz4KICA8L2c+CiAgPGc+CiAgICA8cGF0aCBmaWxsPSIjM2NhY2E2IiBkPSJNMjM4LjU1LDMwNC4yYzI5LDAsNTIuNS0yMy41MSw1Mi41LTUyLjVoLTEwNWMyOC45OSwwLDUyLjUsMjMuNTEsNTIuNSw1Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzMyN2Y5MyIgZD0iTTIzOC41NSwxOTIuODdoLTEwNWMwLDI4Ljk5LDIzLjUsNTIuNSw1Mi41LDUyLjUsMC0yOC45OSwyMy41MS01Mi41LDUyLjUtNTIuNVoiLz4KICAgIDxwYXRoIGZpbGw9IiNhM2Q0YWIiIGQ9Ik0yMzguNTUsMTkyLjg3YzAsMjguOTktMjMuNSw1Mi41LTUyLjUsNTIuNWgxMDVjMC0yOC45OS0yMy41LTUyLjUtNTIuNS01Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzYxYTI5NCIgZD0iTTIzOC41NSwxOTIuODdjLTI4Ljk5LDAtNTIuNSwyMy41MS01Mi41LDUyLjUsMjguOTksMCw1Mi41LTIzLjUsNTIuNS01Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzNlYWNhNyIgZD0iTTE4Ni4wNSwxMzMuOGMtMjguOTksMC01Mi41LDIzLjUtNTIuNSw1Mi41aDEwNWMtMjguOTksMC01Mi41LTIzLjUtNTIuNS01Mi41WiIvPgogICAgPHBhdGggZmlsbD0iI2EyZDRhYiIgZD0iTTIzOC41NSwxODYuM2MyOSwwLDUyLjUtMjMuNSw1Mi41LTUyLjVoLTEwNWMyOC45OSwwLDUyLjUsMjMuNSw1Mi41LDUyLjVaIi8+CiAgICA8cGF0aCBmaWxsPSIjNWVjM2IyIiBkPSJNMjM4LjU1LDE4Ni4zYzAtMjktMjMuNS01Mi41LTUyLjUtNTIuNSwwLDI4Ljk5LDIzLjUxLDUyLjUsNTIuNSw1Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzMyN2Y5MyIgZD0iTTE4Ni4wNSwyNTEuN2MtMjguOTksMC01Mi41LDIzLjUxLTUyLjUsNTIuNWgxMDVjLTI4Ljk5LDAtNTIuNS0yMy41MS01Mi41LTUyLjVaIi8+CiAgICA8cGF0aCBmaWxsPSIjM2I4ZDkyIiBkPSJNMTg2LjA1LDI1MS43YzAsMjguOTksMjMuNTEsNTIuNSw1Mi41LDUyLjUsMC0yOC45OS0yMy41LTUyLjUtNTIuNS01Mi41WiIvPgogIDwvZz4KPC9zdmc+Cg=="

    static func render(_ quote: Quote) -> String {
        let totals = computeQuoteTotals(quote.items ?? [])
        let logoBase64 = brandLogoBase64

        func infoBox(title: String, rows: [(String, String)]) -> String {
            let rowsHTML = rows.enumerated().map { idx, row -> String in
                let borderBottom = idx == rows.count - 1 ? "none" : "1px solid #2d2d2d"
                return """
                <div style="display:flex;border-bottom:\(borderBottom);">
                  <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:#e9e9e9;border-right:1px solid #2d2d2d;white-space:nowrap;">\(htmlEscape(row.0))</div>
                  <div style="flex:1;padding:0.22rem 0.55rem;background:#ffffff;">\(row.1)</div>
                </div>
                """
            }.joined()
            return """
            <div style="border:1px solid #2d2d2d;overflow:hidden;font-size:0.7rem;flex:1;">
              <div style="background:#595959;color:white;padding:0.28rem 0.55rem;font-weight:700;font-size:0.64rem;letter-spacing:0.02em;white-space:nowrap;border-bottom:1px solid #2d2d2d;">\(htmlEscape(title))</div>
              \(rowsHTML)
            </div>
            """
        }

        let itemRows = (quote.items ?? []).enumerated().map { i, item -> String in
            let gross = (item.qty ?? 0) * (item.unitPrice ?? 0)
            let lineTotal = gross * (1 - (item.discountRate ?? 0) / 100)
            let qtyStr = (item.qty ?? 0) == (item.qty ?? 0).rounded() ? String(Int(item.qty ?? 0)) : String(item.qty ?? 0)
            let cell = "padding:0.26rem 0.35rem;border:1px solid #2d2d2d;background:#fafafa;"
            let noCell = "padding:0.26rem 0.35rem;border:1px solid #2d2d2d;background:#e9e9e9;"
            let lastCell = "padding:0.26rem 0.35rem;border:1px solid #2d2d2d;background:#f2f2f2;"
            return """
            <tr>
              <td style="\(noCell)">\(i + 1)</td>
              <td style="\(cell)">\(htmlEscape(item.code))</td>
              <td style="\(cell)">\(htmlEscape(item.description))</td>
              <td style="\(cell)text-align:center;">\(qtyStr)</td>
              <td style="\(cell)text-align:center;">\(htmlEscape(item.unit))</td>
              <td style="\(cell)text-align:right;">\(money(item.unitPrice ?? 0))</td>
              <td style="\(cell)text-align:center;">%\(Int(item.discountRate ?? 0))</td>
              <td style="\(cell)text-align:center;">%\(Int(item.vatRate ?? 0))</td>
              <td style="\(lastCell)text-align:right;">\(money(lineTotal))</td>
            </tr>
            """
        }.joined()

        let headCell = "padding:0.26rem 0.35rem;border:1px solid #2d2d2d;background:#3f3f3f;white-space:nowrap;font-size:0.66rem;"

        let customerBox = infoBox(title: "MÜŞTERİ BİLGİLERİ", rows: [
            ("Firma / Kişi", htmlEscape(quote.customerName)),
            ("Yetkili", htmlEscape(quote.contactName)),
            ("Telefon", htmlEscape(quote.customerPhone)),
            ("E-posta", htmlEscape(quote.customerEmail)),
            ("Adres", htmlEscape(quote.customerAddress)),
        ])
        let quoteInfoBox = infoBox(title: "TEKLİF BİLGİLERİ", rows: [
            ("Teklif No", htmlEscape(quote.quoteNo)),
            ("Tarih", formatDate(quote.quoteDate)),
            ("Geçerlilik", "\(quote.validityDays ?? 0) gün"),
            ("Hazırlayan", htmlEscape(quote.preparedBy)),
            ("Para Birimi", "\(quote.currency ?? "TRY") (\(currencySymbol(quote.currency)))"),
        ])
        let termsBox = infoBox(title: "TEKLİF ŞARTLARI", rows: [
            ("Ödeme", htmlEscape(quote.paymentTerms)),
            ("Garanti", htmlEscape(quote.warranty)),
            ("Açıklama", "<span style=\"font-style:italic;\">\(htmlEscape(quote.notes))</span>"),
            ("IBAN", htmlEscape(quote.iban)),
        ])

        let totalsBox = """
        <div style="flex:1;border:1px solid #2d2d2d;overflow:hidden;font-size:0.7rem;">
          <div style="display:flex;border-bottom:1px solid #2d2d2d;">
            <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:#e9e9e9;border-right:1px solid #2d2d2d;white-space:nowrap;">Ara Toplam</div>
            <div style="flex:1;padding:0.22rem 0.55rem;background:#ffffff;text-align:right;">\(money(totals.araToplam))</div>
          </div>
          <div style="display:flex;border-bottom:1px solid #2d2d2d;">
            <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:#e9e9e9;border-right:1px solid #2d2d2d;white-space:nowrap;">İndirim Oranı</div>
            <div style="flex:1;padding:0.22rem 0.55rem;background:#ffffff;text-align:right;">%\(Int(quote.discountRate ?? 0))</div>
          </div>
          <div style="display:flex;border-bottom:1px solid #2d2d2d;">
            <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:#e9e9e9;border-right:1px solid #2d2d2d;white-space:nowrap;">İndirim Tutarı</div>
            <div style="flex:1;padding:0.22rem 0.55rem;background:#ffffff;text-align:right;">\(money(totals.indirimTutari))</div>
          </div>
          <div style="display:flex;border-bottom:1px solid #2d2d2d;">
            <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:#e9e9e9;border-right:1px solid #2d2d2d;white-space:nowrap;">KDV Toplamı</div>
            <div style="flex:1;padding:0.22rem 0.55rem;background:#ffffff;text-align:right;">\(money(totals.kdvToplami))</div>
          </div>
          <div style="display:flex;color:white;font-weight:700;font-size:0.76rem;">
            <div style="width:40%;background:#3f3f3f;padding:0.28rem 0.55rem;white-space:nowrap;border-right:1px solid #2d2d2d;">GENEL TOPLAM</div>
            <div style="background:#595959;flex:1;padding:0.28rem 0.55rem;text-align:right;">\(money(totals.genelToplam)) \(quote.currency ?? "TRY")</div>
          </div>
        </div>
        """

        return """
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>
            * {
              box-sizing: border-box;
              /* WebKit varsayılan olarak yazdırırken arkaplan renklerini
                 (mürekkep tasarrufu için) basmıyor — başlık çubukları/kutu
                 arkaplanları ekranda renkli, çıktıda beyaz görünüyordu. */
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body { margin: 0; background: #e5e5ea; -webkit-text-size-adjust: 100%; }
            .page {
              width: 210mm; min-height: 297mm; margin: 12px auto; background: #ffffff;
              padding: 15mm; color: #1a1a1a;
              font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
              box-shadow: 0 2px 14px rgba(0,0,0,0.18);
            }
            table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
            th { color: white; }
            /* Ekranda hoş görünmesi için .page'e eklenen 12px dış boşluk + gölge,
               yazdırırken tam A4 yüksekliğinin (297mm) üzerine binip taşan kısmı
               neredeyse boş bir 2. sayfa olarak bastırıyordu — yazdırırken bunları
               sıfırlıyoruz (ekran görünümü değişmiyor, sadece print çıktısı). */
            @media print {
              body { margin: 0; background: #ffffff; }
              .page { margin: 0; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #595959;padding-bottom:0.3rem;margin-bottom:0.6rem;">
              <img src="data:image/svg+xml;base64,\(logoBase64)" alt="Sita Yapı" style="width:245px;height:auto;display:block;margin-left:-4px;" />
              <h2 style="font-weight:400;color:#595959;font-size:1.3rem;margin:0;">Fiyat Teklifi</h2>
            </div>
            <div style="display:flex;gap:1rem;margin-bottom:0.7rem;">
              \(customerBox)
              \(quoteInfoBox)
            </div>
            <div style="border:1px solid #2d2d2d;overflow:hidden;margin-bottom:0.75rem;">
              <table>
                <colgroup>
                  <col style="width:4%" /><col style="width:12%" /><col style="width:27%" />
                  <col style="width:7%" /><col style="width:7%" /><col style="width:12%" />
                  <col style="width:10%" /><col style="width:8%" /><col style="width:13%" />
                </colgroup>
                <thead>
                  <tr style="background:#3f3f3f;color:white;">
                    <th style="\(headCell)text-align:left;">No</th>
                    <th style="\(headCell)text-align:left;">Ürün/Kod</th>
                    <th style="\(headCell)text-align:left;">Açıklama</th>
                    <th style="\(headCell)text-align:center;">Miktar</th>
                    <th style="\(headCell)text-align:center;">Birim</th>
                    <th style="\(headCell)text-align:right;">Birim Fiyat</th>
                    <th style="\(headCell)text-align:center;">İskonto (%)</th>
                    <th style="\(headCell)text-align:center;">KDV (%)</th>
                    <th style="\(headCell)text-align:right;">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  \(itemRows)
                </tbody>
              </table>
            </div>
            <!-- align-items:flex-start: kutular yan kutunun boyuna uzamasın (masaüstü/Android'deki height:fit-content karşılığı); -->
            <!-- yoksa GENEL TOPLAM'ın altında çerçeveli boş bir alan kalıyordu. -->
            <div style="display:flex;gap:1rem;align-items:flex-start;">
              \(termsBox)
              \(totalsBox)
            </div>
            <div style="text-align:center;font-size:0.64rem;opacity:0.65;margin-top:1rem;line-height:1.5;">
              <div>Zeytinoğlu Cad. Beyaz köşk Apt. No:67 80630 Akatlar - Beşiktaş / İstanbul</div>
              <div>0 (212) 351 76 33 - 0 (212) 351 76 88</div>
              <div>info@sitayapi.com - www.sitayapi.com</div>
            </div>
          </div>
        </body>
        </html>
        """
    }
}
