import SwiftUI
import WebKit
import UIKit

/// 5 "yazdırılabilir sayfa"nın (Teklif, Zimmet, Rota, ...) ortak kabuğu —
/// her biri sadece kendi HTML'ini üretir (masaüstündeki aynı sayfanın
/// src/components/*PrintView.jsx'i ile birebir), gösterim/yazdırma/paylaşma
/// mantığı burada tek yerde. Yazdır: UIPrintInteractionController +
/// WKWebView'ın kendi viewPrintFormatter'ı. Paylaş: WKWebView'dan doğrudan
/// PDF (webView.pdf()) üretip sistem paylaşım sayfasını (WhatsApp/Mesajlar/
/// Mail/AirDrop otomatik çıkar) açıyor.
struct WebPrintView: View {
    let title: String
    let html: String
    let shareFileName: String

    @State private var webView: WKWebView?
    @State private var isSharing = false
    @State private var shareError: String?

    var body: some View {
        WebPrintContainer(html: html, webView: $webView)
            .background(Color(.systemGroupedBackground))
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { printCurrent() } label: {
                        Image(systemName: "printer")
                    }
                    .disabled(webView == nil)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { Task { await shareCurrent() } } label: {
                        if isSharing { ProgressView() } else { Image(systemName: "square.and.arrow.up") }
                    }
                    .disabled(webView == nil || isSharing)
                }
            }
            .alert(
                "Paylaşılamadı",
                isPresented: Binding(get: { shareError != nil }, set: { if !$0 { shareError = nil } })
            ) {
                Button("Tamam", role: .cancel) {}
            } message: {
                Text(shareError ?? "")
            }
    }

    private func printCurrent() {
        guard let webView else { return }
        let printInfo = UIPrintInfo(dictionary: nil)
        printInfo.outputType = .general
        printInfo.jobName = title
        let controller = UIPrintInteractionController.shared
        controller.printInfo = printInfo
        controller.printFormatter = webView.viewPrintFormatter()
        controller.present(animated: true)
    }

    private func shareCurrent() async {
        guard let webView else { return }
        isSharing = true
        defer { isSharing = false }
        do {
            let pdfData = try await webView.pdf()
            let safeName = shareFileName.replacingOccurrences(of: "/", with: "-")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent("\(safeName).pdf")
            try pdfData.write(to: url)
            presentShareSheet(for: url)
        } catch {
            shareError = "PDF oluşturulamadı, lütfen tekrar deneyin."
        }
    }

    private func presentShareSheet(for url: URL) {
        guard
            let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
            let root = scene.windows.first(where: { $0.isKeyWindow })?.rootViewController
        else { return }
        var top = root
        while let presented = top.presentedViewController { top = presented }
        let activityVC = UIActivityViewController(activityItems: [url], applicationActivities: nil)
        if let popover = activityVC.popoverPresentationController {
            popover.sourceView = top.view
            popover.sourceRect = CGRect(x: top.view.bounds.midX, y: top.view.bounds.midY, width: 0, height: 0)
            popover.permittedArrowDirections = []
        }
        top.present(activityVC, animated: true)
    }
}

private struct WebPrintContainer: UIViewRepresentable {
    let html: String
    @Binding var webView: WKWebView?

    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var loadedHTML: String? }

    func makeUIView(context: Context) -> WKWebView {
        let wv = WKWebView(frame: .zero)
        wv.scrollView.minimumZoomScale = 0.3
        wv.scrollView.maximumZoomScale = 3
        wv.isOpaque = false
        wv.backgroundColor = .systemGroupedBackground
        wv.scrollView.backgroundColor = .systemGroupedBackground
        context.coordinator.loadedHTML = html
        wv.loadHTMLString(html, baseURL: nil)
        // View güncelleme döngüsü SIRASINDA state değiştirmek tanımsız
        // davranışa yol açabiliyor — bir sonraki run loop turuna erteliyoruz.
        DispatchQueue.main.async { self.webView = wv }
        return wv
    }

    // `updateUIView` SwiftUI her re-render'da (ör. isSharing değişince)
    // çağrılıyor — html DEĞİŞMEDİYSE yeniden yüklemiyoruz, aksi halde her
    // paylaş/yazdır denemesi sayfayı sıfırlayıp PDF üretimini yarıda keserdi.
    func updateUIView(_ uiView: WKWebView, context: Context) {
        guard context.coordinator.loadedHTML != html else { return }
        context.coordinator.loadedHTML = html
        uiView.loadHTMLString(html, baseURL: nil)
    }
}

/// Yeni print HTML üreticilerinin (Zimmet, Rota, ...) paylaştığı biçimlendirme
/// yardımcıları — QuotePrintHTML'deki aynı isimli fonksiyonların kopyası
/// (bilerek: mevcut, çalışan Teklif kodunu değiştirmemek için ayrı tutuldu).
enum PrintHTMLHelpers {
    static let brandLogoBase64 = "PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4KPHN2ZyBpZD0iTGF5ZXJfMSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAxMDAwIDQzOCI+CiAgPCEtLSBHZW5lcmF0b3I6IEFkb2JlIElsbHVzdHJhdG9yIDMwLjMuMCwgU1ZHIEV4cG9ydCBQbHVnLUluIC4gU1ZHIFZlcnNpb246IDIuMS4zIEJ1aWxkIDE4MikgIC0tPgogIDxnPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTM2NS4xNCwxNjguMzJjMTQuNTYsMCwzMS42MiwzLjE5LDMxLjYyLDE1Ljk1LDAsMi42NC0uODMsNi4xLTIuNSw5Ljk4LDAtMTQuNDItMTQuOTgtMTguMTYtMzAuMS0xOC4xNnMtMjYuNjMsNC4wMi0yNi42MywxOC41OGMwLDI4LjE1LDYyLjI3LDQuODUsNjIuMjcsNDQuOCwwLDE5LjQyLTE0LjU2LDI4LjU3LTM1LjIzLDI4LjU3LTE0LjU2LDAtMzMuMjgtNC4zLTMzLjI4LTE2LjIzLDAtMi43Ny42OS02LjI0LDIuMjItMTAuMTIsMCwxNC4wMSwxNS45NSwxOC41OCwzMS45LDE4LjU4LDE3LjQ3LDAsMjYuMDctNy45LDI2LjA3LTIwLjM5LDAtMzEuMi02Mi4yNy04Ljc0LTYyLjI3LTQ0LjUyLDAtMjAuOCwxNy4wNi0yNy4wNSwzNS45Mi0yNy4wNVoiLz4KICAgIDxwYXRoIGZpbGw9IiMwZTJhM2IiIGQ9Ik00MTguOTQsMTQ3LjI0aDcuMjFjMS4yNSwwLDEuNTMsMS4xMSwxLjUzLDEuOTR2Ny42M2gtNy4yMWMtLjgzLDAtMS41My0uOTctMS41My0xLjh2LTcuNzdaTTQxOS4yMiwxNjguNzRzOC4wNCwwLDguMDQsNi4xdjkyLjkycy04LjA0LDAtOC4wNC02LjF2LTkyLjkyWiIvPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTQ3OS42OSwxNzcuNjF2OTAuMTVzLTguMDQsMC04LjA0LTYuMXYtODQuMDVoLTI0LjI3Yy02LjkzLDAtOC4wNC02LjY1LTguMDQtOS40MywwLDAsMS4zOSwxLjk0LDEwLjI2LDEuOTRoNTIuN2M4Ljg3LDAsMTAuMTItMS45NCwxMC4xMi0xLjk0LDAsMi43OC0uOTcsOS40My03LjkxLDkuNDNoLTI0LjgzWiIvPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTU2Ni42NCwyMzQuMmgtNDMuODJsLTIuNzcsOS43MWMtMy4wNSwxMC41NC01LjU1LDIzLjU4LTE1LjY3LDIzLjU4LS40MiwwLS45NywwLTEuMzktLjE0LDMuNDctNS45NiwxMy4wNC0zOC4yOCwyMC4yNS02MS44Niw4LjQ2LTI3LjYsMjAuMjUtMzUuOTIsMjEuNDktMzYuODksMS4yNS45NywxMy4wNCw5LjI5LDIxLjUsMzYuODksNy4yMSwyMy41OCwxNi43OCw1NS44OSwyMC4yNSw2MS44Ni0uNDEuMTQtLjk3LjE0LTEuMzguMTQtMTAuMTMsMC0xMi42Mi0xMy4wNC0xNS42Ny0yMy41OGwtMi43OC05LjcxWk01NjQuNDIsMjI2LjU3bC01LjI3LTE3LjQ4Yy02LjExLTIwLjM4LTE0LjQzLTI5LjY4LTE0LjQzLTI5LjY4LDAsMC04LjMyLDkuMjktMTQuNDIsMjkuNjhsLTUuMjcsMTcuNDhoMzkuMzlaIi8+CiAgICA8cGF0aCBmaWxsPSIjMGUyYTNiIiBkPSJNNjYxLjkxLDIyNC4zNXY0My40MXMtOC4xOCwwLTguMTgtNi4yNHYtMzcuMTdjLTE1LjUzLTEzLjMyLTI3LjYtNDcuNzEtMzIuMzEtNTQuOTIsMCwwLDAtLjE0LDEuOC0uMTQsMy42MSwwLDYuOTMsMS4yNSwxMC41NCw3LjQ5LDQuMDIsNi43OSwxMi4yLDI5LjU0LDIzLjk5LDQwLjc3LDExLjc5LTExLjIzLDE5Ljk3LTMzLjk4LDIzLjk5LTQwLjc3LDMuNjEtNi4yNCw2LjkzLTcuNDksMTAuNTQtNy40OSwxLjgsMCwxLjguMTQsMS44LjE0LTQuNzEsNy4yMS0xNi43OCw0MS42LTMyLjMxLDU0LjkyaC4xNFoiLz4KICAgIDxwYXRoIGZpbGw9IiMwZTJhM2IiIGQ9Ik03NDguMywyMzQuMmgtNDMuODJsLTIuNzcsOS43MWMtMy4wNSwxMC41NC01LjU1LDIzLjU4LTE1LjY3LDIzLjU4LS40MiwwLS45NywwLTEuMzktLjE0LDMuNDctNS45NiwxMy4wNC0zOC4yOCwyMC4yNS02MS44Niw4LjQ2LTI3LjYsMjAuMjUtMzUuOTIsMjEuNS0zNi44OSwxLjI1Ljk3LDEzLjA0LDkuMjksMjEuNSwzNi44OSw3LjIxLDIzLjU4LDE2Ljc4LDU1Ljg5LDIwLjI1LDYxLjg2LS40MS4xNC0uOTcuMTQtMS4zOS4xNC0xMC4xMiwwLTEyLjYyLTEzLjA0LTE1LjY3LTIzLjU4bC0yLjc4LTkuNzFaTTc0Ni4wOSwyMjYuNTdsLTUuMjctMTcuNDhjLTYuMS0yMC4zOC0xNC40Mi0yOS42OC0xNC40Mi0yOS42OCwwLDAtOC4zMiw5LjI5LTE0LjQyLDI5LjY4bC01LjI3LDE3LjQ4aDM5LjM5WiIvPgogICAgPHBhdGggZmlsbD0iIzBlMmEzYiIgZD0iTTc3OS45MiwxNzAuMTJoMjIuNzRjMTkuNDIsMCwzNi40OCw1LjgzLDM2LjQ4LDI5Ljk2djIuNDljMCwyMy40NC0xNy4wNiwzMC4xLTM2LjQ4LDMwLjFoLTE0Ljd2MzUuMDlzLTguMDQsMC04LjA0LTYuMXYtOTEuNTRaTTc4Ny45NiwxNzcuNjF2NDcuNTdoMTQuN2MxNi42NCwwLDI4LjQzLTQuMDMsMjguNDMtMjMuODYsMC0xOC4zMS0xMS43OS0yMy43MS0yOC40My0yMy43MWgtMTQuN1oiLz4KICAgIDxwYXRoIGZpbGw9IiMwZTJhM2IiIGQ9Ik04NTguNDEsMTY4Ljc0czguMDUsMCw4LjA1LDYuMXY5Mi45MnMtOC4wNSwwLTguMDUtNi4xdi05Mi45MloiLz4KICA8L2c+CiAgPGc+CiAgICA8cGF0aCBmaWxsPSIjM2NhY2E2IiBkPSJNMjM4LjU1LDMwNC4yYzI5LDAsNTIuNS0yMy41MSw1Mi41LTUyLjVoLTEwNWMyOC45OSwwLDUyLjUsMjMuNTEsNTIuNSw1Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzMyN2Y5MyIgZD0iTTIzOC41NSwxOTIuODdoLTEwNWMwLDI4Ljk5LDIzLjUsNTIuNSw1Mi41LDUyLjUsMC0yOC45OSwyMy41MS01Mi41LDUyLjUtNTIuNVoiLz4KICAgIDxwYXRoIGZpbGw9IiNhM2Q0YWIiIGQ9Ik0yMzguNTUsMTkyLjg3YzAsMjguOTktMjMuNSw1Mi41LTUyLjUsNTIuNWgxMDVjMC0yOC45OS0yMy41LTUyLjUtNTIuNS01Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzYxYTI5NCIgZD0iTTIzOC41NSwxOTIuODdjLTI4Ljk5LDAtNTIuNSwyMy41MS01Mi41LDUyLjUsMjguOTksMCw1Mi41LTIzLjUsNTIuNS01Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzNlYWNhNyIgZD0iTTE4Ni4wNSwxMzMuOGMtMjguOTksMC01Mi41LDIzLjUtNTIuNSw1Mi41aDEwNWMtMjguOTksMC01Mi41LTIzLjUtNTIuNS01Mi41WiIvPgogICAgPHBhdGggZmlsbD0iI2EyZDRhYiIgZD0iTTIzOC41NSwxODYuM2MyOSwwLDUyLjUtMjMuNSw1Mi41LTUyLjVoLTEwNWMyOC45OSwwLDUyLjUsMjMuNSw1Mi41LDUyLjVaIi8+CiAgICA8cGF0aCBmaWxsPSIjNWVjM2IyIiBkPSJNMjM4LjU1LDE4Ni4zYzAtMjktMjMuNS01Mi41LTUyLjUtNTIuNSwwLDI4Ljk5LDIzLjUxLDUyLjUsNTIuNSw1Mi41WiIvPgogICAgPHBhdGggZmlsbD0iIzMyN2Y5MyIgZD0iTTE4Ni4wNSwyNTEuN2MtMjguOTksMC01Mi41LDIzLjUxLTUyLjUsNTIuNWgxMDVjLTI4Ljk5LDAtNTIuNS0yMy41MS01Mi41LTUyLjVaIi8+CiAgICA8cGF0aCBmaWxsPSIjM2I4ZDkyIiBkPSJNMTg2LjA1LDI1MS43YzAsMjguOTksMjMuNTEsNTIuNSw1Mi41LDUyLjUsMC0yOC45OS0yMy41LTUyLjUtNTIuNS01Mi41WiIvPgogIDwvZz4KPC9zdmc+Cg=="

    static func htmlEscape(_ s: String?) -> String {
        guard let s else { return "" }
        return s
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }

    static func formatDateTR(_ iso: String?) -> String {
        guard let iso, iso.count == 10 else { return iso ?? "" }
        let parts = iso.split(separator: "-")
        guard parts.count == 3 else { return iso }
        return "\(parts[2])/\(parts[1])/\(parts[0])"
    }

    static let footerHTML = """
    <div style="text-align:center;font-size:0.64rem;opacity:0.65;margin-top:1rem;line-height:1.5;">
      <div>Zeytinoğlu Cad. Beyaz köşk Apt. No:67 80630 Akatlar - Beşiktaş / İstanbul</div>
      <div>0 (212) 351 76 33 - 0 (212) 351 76 88</div>
      <div>info@sitayapi.com - www.sitayapi.com</div>
    </div>
    """

    static func pageHeaderHTML(title: String, subtitle: String) -> String {
        """
        <div class="print-header" style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #595959;padding-bottom:0.3rem;margin-bottom:0.6rem;">
          <img src="data:image/svg+xml;base64,\(brandLogoBase64)" alt="Sita Yapı" style="width:220px;height:auto;display:block;margin-left:-4px;" />
          <div style="text-align:right;">
            <h2 style="font-weight:400;color:#595959;font-size:1.2rem;margin:0;">\(htmlEscape(title))</h2>
            <div style="font-size:0.78rem;color:#595959;">\(htmlEscape(subtitle))</div>
          </div>
        </div>
        """
    }

    /// Ortak sayfa kabuğu — A4, beyaz "kağıt" kartı, masaüstündeki
    /// `.print-page` ile aynı boyut/boşluklar.
    static func pageShell(bodyHTML: String, landscape: Bool = false) -> String {
        let size = landscape ? "width: 297mm; min-height: 210mm;" : "width: 210mm; min-height: 297mm;"
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
                 (mürekkez tasarrufu için) basmıyor — başlık çubukları/kutu
                 arkaplanları ekranda renkli, çıktıda beyaz görünüyordu. */
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            body { margin: 0; background: #e5e5ea; -webkit-text-size-adjust: 100%; }
            .page {
              \(size) margin: 12px auto; background: #ffffff;
              padding: 15mm; color: #1a1a1a;
              font-family: -apple-system, BlinkMacSystemFont, "Inter", sans-serif;
              box-shadow: 0 2px 14px rgba(0,0,0,0.18);
            }
            table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
            /* Ekranda hoş görünmesi için .page'e eklenen 12px dış boşluk + gölge,
               yazdırırken tam A4 yüksekliğinin (297mm/210mm) üzerine binip taşan
               kısmı neredeyse boş bir 2. sayfa olarak bastırıyordu — yazdırırken
               bunları sıfırlıyoruz (ekran görünümü değişmiyor, sadece print çıktısı). */
            @media print {
              body { margin: 0; background: #ffffff; }
              .page { margin: 0; box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            \(bodyHTML)
          </div>
        </body>
        </html>
        """
    }
}
