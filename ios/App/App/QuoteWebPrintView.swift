import SwiftUI
import WebKit

/// "Birebir uygulamanın gösterdiği gibi" — elle SwiftUI ile yeniden çizmek
/// yerine, masaüstündeki gerçek yazdırma bileşeninin (src/components/
/// QuotePrintView.jsx) AYNI HTML/CSS'ini üretip gerçek bir WebKit
/// motorunda render ediyoruz. Renkler/ölçüler o dosyadan birebir kopyalandı.
struct QuoteWebPrintView: View {
    let quote: Quote

    var body: some View {
        QuoteWebView(html: QuotePrintHTML.render(quote))
            .background(Color(.systemGroupedBackground))
            .navigationTitle(quote.quoteNo ?? "Teklif")
            .navigationBarTitleDisplayMode(.inline)
    }
}

private struct QuoteWebView: UIViewRepresentable {
    let html: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let webView = WKWebView(frame: .zero, configuration: config)
        webView.scrollView.minimumZoomScale = 0.3
        webView.scrollView.maximumZoomScale = 3
        webView.isOpaque = false
        webView.backgroundColor = .systemGroupedBackground
        webView.scrollView.backgroundColor = .systemGroupedBackground
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        webView.loadHTMLString(html, baseURL: nil)
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
    return "\(parts[2]).\(parts[1]).\(parts[0])"
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
    private static let brandLogoBase64 = "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxMDAwIDQzOCI+CiAgPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDMwLjMuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDIuMS4zIEJ1aWxkIDE4MikgIC0tPgogIDxkZWZzPgogICAgPHN0eWxlPgogICAgICAuc3QwIHsKICAgICAgICBmaWxsOiAjM2VhY2E3OwogICAgICB9CgogICAgICAuc3QxIHsKICAgICAgICBmaWxsOiAjYTJkNGFiOwogICAgICB9CgogICAgICAuc3QyIHsKICAgICAgICBmaWxsOiAjYTNkNGFiOwogICAgICB9CgogICAgICAuc3QzIHsKICAgICAgICBmaWxsOiAjMGUyYTNiOwogICAgICB9CgogICAgICAuc3Q0IHsKICAgICAgICBmaWxsOiAjM2I4ZDkyOwogICAgICB9CgogICAgICAuc3Q1IHsKICAgICAgICBmaWxsOiAjMzI3ZjkzOwogICAgICB9CgogICAgICAuc3Q2IHsKICAgICAgICBmaWxsOiAjM2NhY2E2OwogICAgICB9CgogICAgICAuc3Q3IHsKICAgICAgICBmaWxsOiAjNjFhMjk0OwogICAgICB9CgogICAgICAuc3Q4IHsKICAgICAgICBmaWxsOiAjNWVjM2IyOwogICAgICB9CiAgICA8L3N0eWxlPgogIDwvZGVmcz4KICA8Zz4KICAgIDxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik0zNjUuMTQsMTY4LjMyYzE0LjU2LDAsMzEuNjIsMy4xOSwzMS42MiwxNS45NSwwLDIuNjQtLjgzLDYuMS0yLjUsOS45OCwwLTE0LjQyLTE0Ljk4LTE4LjE2LTMwLjEtMTguMTZzLTI2LjYzLDQuMDItMjYuNjMsMTguNThjMCwyOC4xNSw2Mi4yNyw0Ljg1LDYyLjI3LDQ0LjgsMCwxOS40Mi0xNC41NiwyOC41Ny0zNS4yMywyOC41Ny0xNC41NiwwLTMzLjI4LTQuMy0zMy4yOC0xNi4yMywwLTIuNzcuNjktNi4yNCwyLjIyLTEwLjEyLDAsMTQuMDEsMTUuOTUsMTguNTgsMzEuOSwxOC41OCwxNy40NywwLDI2LjA3LTcuOSwyNi4wNy0yMC4zOSwwLTMxLjItNjIuMjctOC43NC02Mi4yNy00NC41MiwwLTIwLjgsMTcuMDYtMjcuMDUsMzUuOTItMjcuMDVaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QzIiBkPSJNNDE4Ljk0LDE0Ny4yNGg3LjIxYzEuMjUsMCwxLjUzLDEuMTEsMS41MywxLjk0djcuNjNoLTcuMjFjLS44MywwLTEuNTMtLjk3LTEuNTMtMS44di03Ljc3Wk00MTkuMjIsMTY4Ljc0czguMDQsMCw4LjA0LDYuMXY5Mi45MnMtOC4wNCwwLTguMDQtNi4xdi05Mi45MloiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik00NzkuNjksMTc3LjYxdjkwLjE1cy04LjA0LDAtOC4wNC02LjF2LTg0LjA1aC0yNC4yN2MtNi45MywwLTguMDQtNi42NS04LjA0LTkuNDMsMCwwLDEuMzksMS45NCwxMC4yNiwxLjk0aDUyLjdjOC44NywwLDEwLjEyLTEuOTQsMTAuMTItMS45NCwwLDIuNzgtLjk3LDkuNDMtNy45MSw5LjQzaC0yNC44M1oiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik01NjYuNjQsMjM0LjJoLTQzLjgybC0yLjc3LDkuNzFjLTMuMDUsMTAuNTQtNS41NSwyMy41OC0xNS42NywyMy41OC0uNDIsMC0uOTcsMC0xLjM5LS4xNCwzLjQ3LTUuOTYsMTMuMDQtMzguMjgsMjAuMjUtNjEuODYsOC40Ni0yNy42LDIwLjI1LTM1LjkyLDIxLjQ5LTM2Ljg5LDEuMjUuOTcsMTMuMDQsOS4yOSwyMS41LDM2Ljg5LDcuMjEsMjMuNTgsMTYuNzgsNTUuODksMjAuMjUsNjEuODYtLjQxLjE0LS45Ny4xNC0xLjM4LjE0LTEwLjEzLDAtMTIuNjItMTMuMDQtMTUuNjctMjMuNThsLTIuNzgtOS43MVpNNTY0LjQyLDIyNi41N2wtNS4yNy0xNy40OGMtNi4xMS0yMC4zOC0xNC40My0yOS42OC0xNC40My0yOS42OCwwLDAtOC4zMiw5LjI5LTE0LjQyLDI5LjY4bC01LjI3LDE3LjQ4aDM5LjM5WiIvPgogICAgPHBhdGggY2xhc3M9InN0MyIgZD0iTTY2MS45MSwyMjQuMzV2NDMuNDFzLTguMTgsMC04LjE4LTYuMjR2LTM3LjE3Yy0xNS41My0xMy4zMi0yNy42LTQ3LjcxLTMyLjMxLTU0LjkyLDAsMCwwLS4xNCwxLjgtLjE0LDMuNjEsMCw2LjkzLDEuMjUsMTAuNTQsNy40OSw0LjAyLDYuNzksMTIuMiwyOS41NCwyMy45OSw0MC43NywxMS43OS0xMS4yMywxOS45Ny0zMy45OCwyMy45OS00MC43NywzLjYxLTYuMjQsNi45My03LjQ5LDEwLjU0LTcuNDksMS44LDAsMS44LjE0LDEuOC4xNC00LjcxLDcuMjEtMTYuNzgsNDEuNi0zMi4zMSw1NC45MmguMTRaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QzIiBkPSJNNzQ4LjMsMjM0LjJoLTQzLjgybC0yLjc3LDkuNzFjLTMuMDUsMTAuNTQtNS41NSwyMy41OC0xNS42NywyMy41OC0uNDIsMC0uOTcsMC0xLjM5LS4xNCwzLjQ3LTUuOTYsMTMuMDQtMzguMjgsMjAuMjUtNjEuODYsOC40Ni0yNy42LDIwLjI1LTM1LjkyLDIxLjUtMzYuODksMS4yNS45NywxMy4wNCw5LjI5LDIxLjUsMzYuODksNy4yMSwyMy41OCwxNi43OCw1NS44OSwyMC4yNSw2MS44Ni0uNDEuMTQtLjk3LjE0LTEuMzkuMTQtMTAuMTIsMC0xMi42Mi0xMy4wNC0xNS42Ny0yMy41OGwtMi43OC05LjcxWk03NDYuMDksMjI2LjU3bC01LjI3LTE3LjQ4Yy02LjEtMjAuMzgtMTQuNDItMjkuNjgtMTQuNDItMjkuNjgsMCwwLTguMzIsOS4yOS0xNC40MiwyOS42OGwtNS4yNywxNy40OGgzOS4zOVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDMiIGQ9Ik03NzkuOTIsMTcwLjEyaDIyLjc0YzE5LjQyLDAsMzYuNDgsNS44MywzNi40OCwyOS45NnYyLjQ5YzAsMjMuNDQtMTcuMDYsMzAuMS0zNi40OCwzMC4xaC0xNC43djM1LjA5cy04LjA0LDAtOC4wNC02LjF2LTkxLjU0Wk03ODcuOTYsMTc3LjYxdjQ3LjU3aDE0LjdjMTYuNjQsMCwyOC40My00LjAzLDI4LjQzLTIzLjg2LDAtMTguMzEtMTEuNzktMjMuNzEtMjguNDMtMjMuNzFoLTE0LjdaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QzIiBkPSJNODU4LjQxLDE2OC43NHM4LjA1LDAsOC4wNSw2LjF2OTIuOTJzLTguMDUsMC04LjA1LTYuMXYtOTIuOTJaIi8+CiAgPC9nPgogIDxnPgogICAgPHBhdGggY2xhc3M9InN0NiIgZD0iTTIzOC41NSwzMDQuMmMyOSwwLDUyLjUtMjMuNTEsNTIuNS01Mi41aC0xMDVjMjguOTksMCw1Mi41LDIzLjUxLDUyLjUsNTIuNVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDUiIGQ9Ik0yMzguNTUsMTkyLjg3aC0xMDVjMCwyOC45OSwyMy41LDUyLjUsNTIuNSw1Mi41LDAtMjguOTksMjMuNTEtNTIuNSw1Mi41LTUyLjVaIi8+CiAgICA8cGF0aCBjbGFzcz0ic3QyIiBkPSJNMjM4LjU1LDE5Mi44N2MwLDI4Ljk5LTIzLjUsNTIuNS01Mi41LDUyLjVoMTA1YzAtMjguOTktMjMuNS01Mi41LTUyLjUtNTIuNVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDciIGQ9Ik0yMzguNTUsMTkyLjg3Yy0yOC45OSwwLTUyLjUsMjMuNTEtNTIuNSw1Mi41LDI4Ljk5LDAsNTIuNS0yMy41LDUyLjUtNTIuNVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDAiIGQ9Ik0xODYuMDUsMTMzLjhjLTI4Ljk5LDAtNTIuNSwyMy41LTUyLjUsNTIuNWgxMDVjLTI4Ljk5LDAtNTIuNS0yMy41LTUyLjUtNTIuNVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDEiIGQ9Ik0yMzguNTUsMTg2LjNjMjksMCw1Mi41LTIzLjUsNTIuNS01Mi41aC0xMDVjMjguOTksMCw1Mi41LDIzLjUsNTIuNSw1Mi41WiIvPgogICAgPHBhdGggY2xhc3M9InN0OCIgZD0iTTIzOC41NSwxODYuM2MwLTI5LTIzLjUtNTIuNS01Mi41LTUyLjUsMCwyOC45OSwyMy41MSw1Mi41LDUyLjUsNTIuNVoiLz4KICAgIDxwYXRoIGNsYXNzPSJzdDUiIGQ9Ik0xODYuMDUsMjUxLjdjLTI4Ljk5LDAtNTIuNSwyMy41MS01Mi41LDUyLjVoMTA1Yy0yOC45OSwwLTUyLjUtMjMuNTEtNTIuNS01Mi41WiIvPgogICAgPHBhdGggY2xhc3M9InN0NCIgZD0iTTE4Ni4wNSwyNTEuN2MwLDI4Ljk5LDIzLjUxLDUyLjUsNTIuNSw1Mi41LDAtMjguOTktMjMuNS01Mi41LTUyLjUtNTIuNVoiLz4KICA8L2c+Cjwvc3ZnPgo="

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
            * { box-sizing: border-box; }
            body { margin: 0; background: #e5e5ea; -webkit-text-size-adjust: 100%; }
            .page {
              width: 210mm; min-height: 297mm; margin: 12px auto; background: #ffffff;
              padding: 15mm; color: #1a1a1a;
              font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
              box-shadow: 0 2px 14px rgba(0,0,0,0.18);
            }
            table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
            th { color: white; }
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
            <div style="display:flex;gap:1rem;">
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
