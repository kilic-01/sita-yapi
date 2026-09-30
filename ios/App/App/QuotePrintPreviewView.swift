import SwiftUI

/// Desktop'taki gerçek yazdırma/PDF çıktısının (src/components/QuotePrintView.jsx)
/// native önizlemesi — aynı renkler (orijinal .numbers şablonundan piksel
/// piksel örneklenmiş), aynı kutu/tablo yapısı, aynı sabit şirket bilgisi.
/// Sayfa bir A4 kağıdı gibi sabit genişlikte; telefon ekranına sığmadığı
/// için yatay kaydırılabilir — gerçek çıktı da zaten bundan daha geniş.
private extension Color {
    init(hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}

private let headerDarkest = Color(hex: 0x3f3f3f)
private let headerDark = Color(hex: 0x595959)
private let labelBg = Color(hex: 0xe9e9e9)
private let itemBodyBg = Color(hex: 0xfafafa)
private let itemLastColBg = Color(hex: 0xf2f2f2)
private let borderColor = Color(hex: 0x2d2d2d)
private let pageWidth: CGFloat = 760

struct QuotePrintPreviewView: View {
    let quote: Quote
    private var totals: QuoteTotals { computeQuoteTotals(quote.items ?? []) }

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            VStack(alignment: .leading, spacing: 10) {
                header
                itemTable
                footer
            }
            .padding(20)
            .frame(width: pageWidth, alignment: .leading)
            .background(Color.white)
            .foregroundStyle(Color(hex: 0x1a1a1a))
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle(quote.quoteNo ?? "Teklif")
        .navigationBarTitleDisplayMode(.inline)
    }

    // MARK: Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image("BrandLogo").resizable().scaledToFit().frame(width: 180)
                Spacer()
                Text("Fiyat Teklifi").font(.system(size: 20, weight: .regular)).foregroundStyle(headerDark)
            }
            .padding(.bottom, 6)
            .overlay(Rectangle().fill(headerDark).frame(height: 2), alignment: .bottom)

            HStack(alignment: .top, spacing: 14) {
                infoBox(title: "MÜŞTERİ BİLGİLERİ", rows: [
                    ("Firma / Kişi", quote.customerName ?? ""),
                    ("Yetkili", quote.contactName ?? ""),
                    ("Telefon", quote.customerPhone ?? ""),
                    ("E-posta", quote.customerEmail ?? ""),
                    ("Adres", quote.customerAddress ?? ""),
                ])
                infoBox(title: "TEKLİF BİLGİLERİ", rows: [
                    ("Teklif No", quote.quoteNo ?? ""),
                    ("Tarih", formatDate(quote.quoteDate)),
                    ("Geçerlilik", "\(quote.validityDays ?? 0) gün"),
                    ("Hazırlayan", quote.preparedBy ?? ""),
                    ("Para Birimi", "\(quote.currency ?? "TRY") (\(currencySymbol(quote.currency)))"),
                ])
            }
        }
    }

    private func infoBox(title: String, rows: [(String, String)]) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).font(.system(size: 10, weight: .bold)).foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 5)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(headerDark)
            ForEach(Array(rows.enumerated()), id: \.offset) { idx, row in
                HStack(spacing: 0) {
                    Text(row.0).font(.system(size: 10, weight: .semibold))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .frame(width: 90, alignment: .leading)
                        .background(labelBg)
                    Text(row.1).font(.system(size: 10))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.white)
                }
                .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
            }
        }
        .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
        .frame(maxWidth: .infinity)
    }

    // MARK: Item table

    private var itemTable: some View {
        let items = quote.items ?? []
        let widths: [CGFloat] = [24, 70, 170, 40, 40, 70, 60, 45, 80]
        return VStack(spacing: 0) {
            HStack(spacing: 0) {
                tableHeadCell("No", widths[0], .leading)
                tableHeadCell("Ürün/Kod", widths[1], .leading)
                tableHeadCell("Açıklama", widths[2], .leading)
                tableHeadCell("Miktar", widths[3], .center)
                tableHeadCell("Birim", widths[4], .center)
                tableHeadCell("Birim Fiyat", widths[5], .trailing)
                tableHeadCell("İskonto %", widths[6], .center)
                tableHeadCell("KDV %", widths[7], .center)
                tableHeadCell("Tutar", widths[8], .trailing)
            }
            ForEach(Array(items.enumerated()), id: \.offset) { idx, item in
                let gross = (item.qty ?? 0) * (item.unitPrice ?? 0)
                let lineTotal = gross * (1 - (item.discountRate ?? 0) / 100)
                HStack(spacing: 0) {
                    tableCell("\(idx + 1)", widths[0], .leading, itemBodyBg)
                    tableCell(item.code ?? "", widths[1], .leading, itemBodyBg)
                    tableCell(item.description ?? "", widths[2], .leading, itemBodyBg)
                    tableCell(formattedQty(item.qty ?? 0), widths[3], .center, itemBodyBg)
                    tableCell(item.unit ?? "", widths[4], .center, itemBodyBg)
                    tableCell(money(item.unitPrice ?? 0), widths[5], .trailing, itemBodyBg)
                    tableCell("%\(Int(item.discountRate ?? 0))", widths[6], .center, itemBodyBg)
                    tableCell("%\(Int(item.vatRate ?? 0))", widths[7], .center, itemBodyBg)
                    tableCell(money(lineTotal), widths[8], .trailing, itemLastColBg)
                }
            }
        }
        .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
    }

    private func tableHeadCell(_ text: String, _ width: CGFloat, _ alignment: Alignment) -> some View {
        Text(text).font(.system(size: 9, weight: .bold)).foregroundStyle(.white)
            .padding(4).frame(width: width, alignment: alignment)
            .background(headerDarkest)
            .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
    }

    private func tableCell(_ text: String, _ width: CGFloat, _ alignment: Alignment, _ bg: Color) -> some View {
        Text(text).font(.system(size: 9))
            .padding(4).frame(width: width, alignment: alignment)
            .background(bg)
            .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
    }

    // MARK: Footer

    private var footer: some View {
        VStack(spacing: 10) {
            HStack(alignment: .top, spacing: 14) {
                infoBox(title: "TEKLİF ŞARTLARI", rows: [
                    ("Ödeme", quote.paymentTerms ?? ""),
                    ("Garanti", quote.warranty ?? ""),
                    ("Açıklama", quote.notes ?? ""),
                    ("IBAN", quote.iban ?? ""),
                ])
                totalsBox
            }
            VStack(spacing: 2) {
                Text("Zeytinoğlu Cad. Beyaz köşk Apt. No:67 80630 Akatlar - Beşiktaş / İstanbul")
                Text("0 (212) 351 76 33 - 0 (212) 351 76 88")
                Text("info@sitayapi.com - www.sitayapi.com")
            }
            .font(.system(size: 9))
            .foregroundStyle(.secondary)
            .padding(.top, 8)
        }
    }

    private var totalsBox: some View {
        VStack(spacing: 0) {
            totalsRow("Ara Toplam", money(totals.araToplam))
            totalsRow("İndirim Oranı", "%\(Int(quote.discountRate ?? 0))")
            totalsRow("İndirim Tutarı", money(totals.indirimTutari))
            totalsRow("KDV Toplamı", money(totals.kdvToplami))
            HStack(spacing: 0) {
                Text("GENEL TOPLAM").font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .frame(width: 90, alignment: .leading)
                    .background(headerDarkest)
                Text("\(money(totals.genelToplam)) \(quote.currency ?? "TRY")")
                    .font(.system(size: 11, weight: .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 8).padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .background(headerDark)
            }
        }
        .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
        .frame(maxWidth: .infinity)
    }

    private func totalsRow(_ label: String, _ value: String) -> some View {
        HStack(spacing: 0) {
            Text(label).font(.system(size: 10, weight: .semibold))
                .padding(.horizontal, 8).padding(.vertical, 4)
                .frame(width: 90, alignment: .leading)
                .background(labelBg)
            Text(value).font(.system(size: 10))
                .padding(.horizontal, 8).padding(.vertical, 4)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .background(Color.white)
        }
        .overlay(Rectangle().stroke(borderColor, lineWidth: 0.5))
    }

    // MARK: Helpers

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

    private func formattedQty(_ q: Double) -> String {
        q == q.rounded() ? String(Int(q)) : String(q)
    }

    private func money(_ n: Double) -> String {
        n.formatted(.number.precision(.fractionLength(2)).grouping(.automatic))
    }
}
