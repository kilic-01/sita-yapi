import SwiftUI
import AudioToolbox

/// Desktop'taki QuickSaleModal.jsx'in native karşılığı — aynı satır/toplam
/// mantığı (computeQuoteTotals ile aynı hesap). "Ürünler stoktan düşülsün
/// mü?" sorusu desktop'ta window.confirm ile soruluyordu, burada bir Toggle
/// olarak. DİKKAT: deductedFromStock, stockItemId'si olan (barkodla eklenen)
/// satırlar için backend'de GERÇEKTEN stok düşüyor (bkz. electron/handlers.js
/// addSale — db.js'teki aynı isimli fonksiyonun aksine, bu üstteki katman
/// önce updateStockItem çağırıyor). Elle yazılan satırların stockItemId'si
/// olmadığı için onlar için hâlâ sadece bilgi amaçlı.
struct QuickSaleView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var items: [QuoteItem] = [QuoteItem(qty: 1, unit: "Adet", vatRate: 20, unitPrice: 0, description: "", discountRate: 0)]
    @State private var query = ""
    @State private var searchResults: [StockItem] = []
    @State private var activeSearchIndex: Int?
    // Bir ürün birden fazla depoda olabildiği için backend hangi depodan
    // düşüleceğini bilmeden stok düşemiyor (sessizce atlar) — ürün seçilince
    // depo dağılımı çekilip satır başına çözümleniyor: tek depoda stok varsa
    // otomatik, birden fazlaysa kullanıcı aşağıdaki seçiciden seçiyor.
    @State private var depotOptionsByLine: [UUID: [StockItemDepot]] = [:]
    @State private var depotFetchFailedLines: Set<UUID> = []
    @State private var depots: [Depot] = []
    @State private var deductFromStock = true
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showScanner = false
    @State private var scanErrorMessage: String?
    @State private var completedMessage: String?

    private var totals: QuoteTotals { computeQuoteTotals(items) }

    // Satışlar normalde dükkanda yapılıyor — depo seçimi varsayılan olarak
    // hep "Dükkan" olmalı, orada stok yoksa kayıtlı olduğu depodan düşülüp
    // kullanıcı satış sonrası uyarılır (bkz. submit()).
    private var shopDepotId: String? { depots.first { $0.name == "Dükkan" }?.id }

    var body: some View {
        Form {
            Section("Ürünler") {
                Button {
                    showScanner = true
                } label: {
                    Label("Barkod ile Ürün Ekle", systemImage: "barcode.viewfinder")
                }
                ForEach(Array(items.enumerated()), id: \.element.id) { index, _ in
                    VStack(alignment: .leading, spacing: 6) {
                        // "Kod / Açıklama" alanı eskiden sadece düz bir metin
                        // kutusuydu — elle bir kod yazmak HİÇBİR ARAMA/EŞLEŞME
                        // tetiklemiyordu (sadece barkod TARAMA ile ürün
                        // bulunabiliyordu). Desktop'taki QuickSaleModal.jsx'teki
                        // gibi, yazarken canlı bir öneri listesi gösteriyoruz.
                        TextField(
                            "Kod / Açıklama",
                            text: Binding(
                                get: { items[index].description ?? "" },
                                set: { newValue in
                                    items[index].description = newValue
                                    items[index].stockItemId = nil
                                    activeSearchIndex = index
                                    query = newValue
                                }
                            )
                        )
                        if activeSearchIndex == index, !searchResults.isEmpty {
                            // DİKKAT: bu Button'lar, Form'un TEK bir satırını
                            // oluşturan ortak VStack içinde (TextField + bu
                            // liste + depo satırı + adet/fiyat alanları HEPSİ
                            // aynı satır) birden fazla Button olarak iç içe —
                            // SwiftUI'nin bilinen bir davranışı: bir List/Form
                            // satırında BİRDEN FAZLA Button varsa ve her birine
                            // açıkça .buttonStyle(.plain) verilmezse, dokunma
                            // olayları satırın varsayılan seçim davranışıyla
                            // karışıp YANLIŞ satırın action'ını tetikleyebiliyor
                            // — tam olarak "A47222'ye dokunuyorum ama
                            // A4722236WTC seçiliyor" hatasının sebebi buydu.
                            ForEach(searchResults) { result in
                                Button {
                                    applySuggestion(result, at: index)
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(result.codeAndName).foregroundStyle(.primary)
                                        // Katalogda birbirine çok benzeyen kodlu/
                                        // isimli onlarca varyant var (ör. "A47222"
                                        // ile "A4722236WTC") — stok miktarı
                                        // görünmeden kolayca yanlış ürün seçilip
                                        // stoksuz bir varyant "satılıyordu".
                                        // Masaüstündeki (QuickSaleModal.jsx) AYNI
                                        // "· N adet stokta" bilgisi.
                                        let qty = result.quantity ?? 0
                                        Text("\(result.price?.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR"))) ?? "") · \(Int(qty)) \(result.unit ?? "adet") stokta")
                                            .font(.caption)
                                            .foregroundStyle(qty > 0 ? Color.secondary : Color.red)
                                    }
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        if let stockItemId = items[index].stockItemId {
                            depotStatusView(stockItemId: stockItemId, lineId: items[index].id)
                        }
                        HStack {
                            TextField("Adet", value: Binding(get: { items[index].qty ?? 1 }, set: { items[index].qty = $0 }), format: .number)
                                .keyboardType(.decimalPad).frame(width: 55)
                            TextField("Birim Fiyat", value: Binding(get: { items[index].unitPrice ?? 0 }, set: { items[index].unitPrice = $0 }), format: .number)
                                .keyboardType(.decimalPad)
                            Text("KDV %")
                            TextField("20", value: Binding(get: { items[index].vatRate ?? 20 }, set: { items[index].vatRate = $0 }), format: .number)
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
                Text("Açıksa, barkodla eklenen ürünlerin stok miktarı gerçekten düşülür. Elle yazılan ürünler için bu sadece bilgi amaçlıdır — miktarı Stok sekmesinden ayrıca güncellemeniz gerekir.")
            }
            Section("Toplam") {
                LabeledContent("Ara Toplam", value: totals.araToplam.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR"))))
                LabeledContent("KDV", value: totals.kdvToplami.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR"))))
                LabeledContent("Genel Toplam") {
                    Text(totals.genelToplam.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR")))).font(.headline)
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Satış")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            depots = (try? await APIClient.shared.get("/depots")) ?? []
        }
        .task(id: query) {
            guard activeSearchIndex != nil, query.count >= 2 else { searchResults = []; return }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let all = (try? await StockCache.shared.all()) ?? []
            let lower = query.lowercased()
            let matches = all.filter {
                ($0.code?.lowercased().contains(lower) ?? false)
                    || ($0.name?.lowercased().contains(lower) ?? false)
                    || ($0.barcode?.lowercased().contains(lower) ?? false)
            }
            // Katalogda "A47222" ile "A4722234"/"A4722236WTC" gibi aynı önekli
            // onlarca neredeyse birebir ürün var (isimleri de çoğu zaman AYNI)
            // — eşleşmeler sıralanmadan ilk 15'i gösterince kullanıcı tam
            // aradığı kodu bulamıyor, listede rastgele sırada görünen BENZER
            // bir kodlu farklı ürüne tıklayıp "A47222'yi seçtim ama bambaşka
            // bir ürün geldi" sanıyordu. Tam kod eşleşmesi > kod ÖNEKİ
            // eşleşmesi > kodun içinde geçmesi > isim eşleşmesi sırasıyla
            // öne alınır.
            func rank(_ item: StockItem) -> Int {
                let code = item.code?.lowercased() ?? ""
                if code == lower { return 0 }
                if code.hasPrefix(lower) { return 1 }
                if code.contains(lower) { return 2 }
                if item.name?.lowercased().contains(lower) ?? false { return 3 }
                return 4
            }
            searchResults = matches
                .sorted { a, b in
                    let ra = rank(a), rb = rank(b)
                    if ra != rb { return ra < rb }
                    return (a.code ?? "") < (b.code ?? "")
                }
                .prefix(15)
                .map { $0 }
        }
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
        .alert(
            "Satış Tamamlandı",
            isPresented: Binding(get: { completedMessage != nil }, set: { if !$0 { completedMessage = nil } })
        ) {
            Button("Tamam") { dismiss() }
        } message: {
            Text(completedMessage ?? "")
        }
    }

    private var validItems: [QuoteItem] {
        items.filter { !($0.description ?? "").isEmpty && ($0.unitPrice ?? 0) > 0 }
    }

    /// Elle yazarken çıkan öneri listesinden bir ürün seçildiğinde — barkod
    /// taramasındaki ("addScannedItem") aynı alan doldurma mantığı.
    private func applySuggestion(_ stockItem: StockItem, at index: Int) {
        items[index].code = stockItem.code
        items[index].unit = stockItem.unit ?? "Adet"
        items[index].unitPrice = stockItem.price ?? 0
        // Katalogda neredeyse birebir aynı isimli ama farklı kodlu çok sayıda
        // ürün var — seçimden sonra satırda sadece isim görünürse kullanıcı
        // yanlış ürün seçtiğini FARK EDEMİYORDU. Kod, isimle AYNI yerde ve
        // ÖNÜNDE görünsün ki hangi ürünün seçildiği her zaman doğrulanabilsin.
        items[index].description = stockItem.codeAndName
        items[index].stockItemId = stockItem.id
        activeSearchIndex = nil
        query = ""
        searchResults = []
        Task { await resolveDepot(for: stockItem.id, lineId: items[index].id) }
    }

    /// Bir ürün birden fazla depoda olabildiği için (bkz. electron/db.js
    /// stockItemDepots) backend hangi depodan düşüleceğini bilmeden stok
    /// düşemiyor — tek depoda stok varsa otomatik atar, birden fazlaysa
    /// kullanıcı "depotStatusView"daki seçiciden seçene kadar boş kalır.
    /// "try?" ile sorgu BAŞARISIZ olursa (ör. ağ hatası) eskiden bu da boş
    /// dizi [] olarak yorumlanıyor, "hiçbir depoda stok yok" ile aynı
    /// gösteriliyordu — stoğu GERÇEKTEN olan bir ürün bile "Stokta yok"
    /// uyarısı alıyordu. Artık hata ile gerçek boş sonucu ayırıyoruz.
    private func resolveDepot(for stockItemId: String, lineId: UUID) async {
        do {
            let rows: [StockItemDepot] = try await APIClient.shared.get("/stock/\(stockItemId)/depots")
            let withStock = rows.filter { ($0.quantity ?? 0) > 0 }
            depotFetchFailedLines.remove(lineId)
            depotOptionsByLine[lineId] = withStock
            guard let idx = items.firstIndex(where: { $0.id == lineId }) else { return }
            // Satışlar normalde dükkanda yapılıyor — dükkanda stok varsa
            // SORU SORMADAN dükkan seçilir. Dükkanda yoksa, stoğu olan TEK
            // bir başka depo varsa oradan düşülür (submit() sonrasında
            // kullanıcı uyarılır); birden fazla başka depoda varsa yukarıdaki
            // seçiciden kullanıcı kendisi seçer.
            if let shopId = shopDepotId, withStock.contains(where: { $0.depotId == shopId }) {
                items[idx].depotId = shopId
            } else if withStock.count == 1 {
                items[idx].depotId = withStock[0].depotId
            }
        } catch {
            depotOptionsByLine[lineId] = nil
            depotFetchFailedLines.insert(lineId)
        }
    }

    @ViewBuilder
    private func depotStatusView(stockItemId: String, lineId: UUID) -> some View {
        if depotFetchFailedLines.contains(lineId) {
            Button {
                Task { await resolveDepot(for: stockItemId, lineId: lineId) }
            } label: {
                Text("Depo bilgisi alınamadı — tekrar dene").font(.caption)
            }
        } else if let options = depotOptionsByLine[lineId] {
            if options.isEmpty {
                Text("Stokta yok").font(.caption).foregroundStyle(.red)
            } else if options.count == 1 {
                Text(depots.first { $0.id == options[0].depotId }?.name ?? "Bilinmeyen depo")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Picker(
                    "Depo",
                    selection: Binding(
                        get: { items.first { $0.id == lineId }?.depotId },
                        set: { newValue in
                            if let idx = items.firstIndex(where: { $0.id == lineId }) { items[idx].depotId = newValue }
                        }
                    )
                ) {
                    Text("Depo seçin…").tag(String?.none)
                    ForEach(options) { row in
                        Text("\(depots.first { $0.id == row.depotId }?.name ?? "Bilinmeyen depo") (\(Int(row.quantity ?? 0)))")
                            .tag(Optional(row.depotId ?? ""))
                    }
                }
                .pickerStyle(.menu)
            }
        } else {
            Text("Depo bilgisi yükleniyor…").font(.caption).foregroundStyle(.secondary)
        }
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
                description: stockItem.codeAndName,
                discountRate: 0,
                stockItemId: stockItem.id
            )
            if let emptyIdx = items.firstIndex(where: { ($0.description ?? "").isEmpty && ($0.unitPrice ?? 0) == 0 }) {
                items[emptyIdx] = newRow
            } else {
                items.append(newRow)
            }
            await resolveDepot(for: stockItem.id, lineId: newRow.id)
        } catch {
            scanErrorMessage = error.turkishMessage
        }
    }

    private func submit() async {
        // Masaüstündeki QuickSaleModal.jsx'teki AYNI kontrol: stoktan
        // düşülecekse, birden fazla depoda duran ve henüz hangi depodan
        // düşüleceği seçilmemiş bir satır varsa gönderim engellenir —
        // yoksa backend o satırı sessizce atlar, "sattım" dense bile stok
        // hiç değişmemiş olurdu.
        if deductFromStock {
            if let failed = validItems.first(where: { $0.stockItemId != nil && depotFetchFailedLines.contains($0.id) }) {
                errorMessage = "\"\(failed.code ?? failed.description ?? "")\" için depo bilgisi alınamadı — tekrar deneyin."
                return
            }
            if let ambiguous = validItems.first(where: {
                $0.stockItemId != nil && $0.depotId == nil && (depotOptionsByLine[$0.id]?.count ?? 0) > 1
            }) {
                errorMessage = "\"\(ambiguous.code ?? ambiguous.description ?? "")\" birden fazla depoda var — hangi depodan düşüleceğini seçin."
                return
            }
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let saleItems = validItems.map {
                SaleItem(
                    stockItemId: $0.stockItemId,
                    code: $0.code ?? $0.description ?? "",
                    name: $0.description ?? "",
                    qty: $0.qty ?? 0,
                    unitPrice: $0.unitPrice ?? 0,
                    discountRate: $0.discountRate ?? 0,
                    depotId: $0.depotId
                )
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
            if deductFromStock {
                for item in validItems {
                    // Gerçekten düşülen miktar neyse yerel gösterim de onu
                    // yansıtsın — depotId çözümlenmediyse (ör. stokta hiç
                    // yoktu) backend de bir şey düşürmedi.
                    guard let stockId = item.stockItemId, item.depotId != nil else { continue }
                    let all = try? await StockCache.shared.all()
                    let current = all?.first { $0.id == stockId }?.quantity ?? 0
                    await StockCache.shared.invalidate(id: stockId, newQuantity: max(0, current - (item.qty ?? 0)))
                }
            }
            // App Store'daki satın alma onayı gibi kısa, pozitif bir "ding"
            // sesi — kullanıcı satışın gerçekten kaydedildiğini dokunsal
            // geri bildirime ek olarak kulakla da anında anlasın diye.
            AudioServicesPlaySystemSound(1407)
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            // Satışlar normalde dükkanda yapılıyor — bir satır dükkan
            // DIŞINDA bir depodan düşüldüyse (dükkanda stoğu yoktu)
            // kullanıcıyı açıkça uyarıyoruz, yanlışlıkla fark edilmeyip
            // dükkandaki rafın boşalmasına rağmen "stok var" sanılmasın.
            let shopId = shopDepotId
            let warnings = validItems
                .filter { $0.depotId != nil && $0.depotId != shopId }
                .map { item -> String in
                    let depotName = depots.first { $0.id == item.depotId }?.name ?? "bilinmeyen depo"
                    return "\"\(item.code ?? item.description ?? "")\" ürününün stoğu dükkanda yok, \(depotName) deposundaki stoktan düşüldü."
                }
            var message = saleTotals.genelToplam.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR"))) + " tutarında satış kaydedildi."
            if !warnings.isEmpty {
                message += "\n\n" + warnings.joined(separator: "\n") + " Kontrol edin."
            }
            completedMessage = message
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}
