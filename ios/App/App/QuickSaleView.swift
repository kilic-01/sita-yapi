import SwiftUI

/// Desktop'taki QuickSaleModal.jsx'in native karşılığı — aynı satır/toplam
/// mantığı (computeQuoteTotals ile aynı hesap). "Ürünler stoktan düşülsün
/// mü?" sorusu desktop'ta window.confirm ile soruluyordu, burada bir
/// Toggle olarak — deductedFromStock sadece bilgi amaçlı bir bayrak,
/// backend gerçekten stok düşmüyor (bkz. electron/db.js addSale).
struct QuickSaleView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var items: [QuoteItem] = [QuoteItem(qty: 1, unit: "Adet", vatRate: 20, unitPrice: 0, description: "", discountRate: 0)]
    @State private var query = ""
    @State private var searchResults: [StockItem] = []
    @State private var activeSearchIndex: Int?
    @State private var deductFromStock = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showScanner = false
    @State private var scanErrorMessage: String?

    private var totals: QuoteTotals { computeQuoteTotals(items) }

    var body: some View {
        Form {
            Section("Ürünler") {
                Button {
                    showScanner = true
                } label: {
                    Label("Barkod ile Ürün Ekle", systemImage: "barcode.viewfinder")
                }
                ForEach($items) { $item in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Kod / Açıklama", text: Binding(get: { item.description ?? "" }, set: { item.description = $0 }))
                        HStack {
                            TextField("Adet", value: Binding(get: { item.qty ?? 1 }, set: { item.qty = $0 }), format: .number)
                                .keyboardType(.decimalPad).frame(width: 55)
                            TextField("Birim Fiyat", value: Binding(get: { item.unitPrice ?? 0 }, set: { item.unitPrice = $0 }), format: .number)
                                .keyboardType(.decimalPad)
                            Text("KDV %")
                            TextField("20", value: Binding(get: { item.vatRate ?? 20 }, set: { item.vatRate = $0 }), format: .number)
                                .keyboardType(.decimalPad).frame(width: 40)
                        }
                    }
                }
                .onDelete { items.remove(atOffsets: $0) }
                Button {
                    items.append(QuoteItem(qty: 1, unit: "Adet", vatRate: 20, unitPrice: 0, description: "", discountRate: 0))
                } label: {
                    Label("Ürün Ekle", systemImage: "plus")
                }
            }
            Section {
                Toggle("Ürünler stoktan düşülsün mü?", isOn: $deductFromStock)
            } footer: {
                Text("Bu sadece bir bilgi bayrağıdır — miktarı Stok sekmesinden ayrıca güncellemeniz gerekir.")
            }
            Section("Toplam") {
                LabeledContent("Ara Toplam", value: totals.araToplam.formatted(.currency(code: "TRY")))
                LabeledContent("KDV", value: totals.kdvToplami.formatted(.currency(code: "TRY")))
                LabeledContent("Genel Toplam") {
                    Text(totals.genelToplam.formatted(.currency(code: "TRY"))).font(.headline)
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Satış")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Kaydet").bold() }
                }
                .disabled(validItems.isEmpty || isSaving)
            }
        }
        .sheet(isPresented: $showScanner) {
            BarcodeScannerSheet(title: "Barkod ile Ürün Ekle") { code in
                Task { await addScannedItem(code) }
            }
        }
        .alert(
            "Ürün Bulunamadı",
            isPresented: Binding(get: { scanErrorMessage != nil }, set: { if !$0 { scanErrorMessage = nil } })
        ) {
            Button("Tamam", role: .cancel) {}
        } message: {
            Text(scanErrorMessage ?? "")
        }
    }

    private var validItems: [QuoteItem] {
        items.filter { !($0.description ?? "").isEmpty && ($0.unitPrice ?? 0) > 0 }
    }

    /// Aynı barkod arka arkaya okutulursa yeni satır açmak yerine miktarı
    /// artırır — kasada art arda aynı üründen birden fazla adet okutmayı
    /// tek satırda tutar. Formdaki tek boş satır henüz doldurulmadıysa
    /// (varsayılan ilk satır) onun yerine geçer, aksi halde yeni satır ekler.
    private func addScannedItem(_ code: String) async {
        do {
            guard let stockItem = try await APIClient.shared.stockItem(byBarcode: code) else {
                scanErrorMessage = "Bu barkoda ait ürün bulunamadı: \(code)"
                return
            }
            if let idx = items.firstIndex(where: { $0.stockItemId == stockItem.id }) {
                items[idx].qty = (items[idx].qty ?? 0) + 1
                return
            }
            let newRow = QuoteItem(
                qty: 1,
                code: stockItem.code,
                unit: stockItem.unit ?? "Adet",
                vatRate: 20,
                unitPrice: stockItem.price ?? 0,
                description: stockItem.name ?? stockItem.code ?? "(isimsiz)",
                discountRate: 0,
                stockItemId: stockItem.id
            )
            if let emptyIdx = items.firstIndex(where: { ($0.description ?? "").isEmpty && ($0.unitPrice ?? 0) == 0 }) {
                items[emptyIdx] = newRow
            } else {
                items.append(newRow)
            }
        } catch {
            scanErrorMessage = (error as? LocalizedError)?.errorDescription ?? "Arama başarısız."
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let saleItems = validItems.map {
                SaleItem(stockItemId: $0.stockItemId, code: $0.code ?? $0.description ?? "", name: $0.description ?? "", qty: $0.qty ?? 0, unitPrice: $0.unitPrice ?? 0, discountRate: $0.discountRate ?? 0)
            }
            let saleTotals = computeQuoteTotals(validItems)
            let body = NewSale(
                items: saleItems,
                generalDiscountRate: 0,
                subtotal: saleTotals.araToplam,
                vatTotal: saleTotals.kdvToplami,
                total: saleTotals.genelToplam,
                deductedFromStock: deductFromStock,
                actingUserId: appState.currentUser?.id ?? ""
            )
            struct SaleResponse: Decodable { let id: String }
            let _: SaleResponse = try await APIClient.shared.post("/sales", body: body)
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Satış kaydedilemedi."
        }
    }
}
