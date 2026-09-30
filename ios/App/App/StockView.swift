import SwiftUI

struct StockView: View {
    @Environment(AppState.self) private var appState
    @State private var query = ""
    @State private var results: [StockItem] = []
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var showScanner = false
    @State private var scannedItem: StockItem?
    @State private var scanErrorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if query.count < 2 {
                    Text("Ürün aramak için kod veya isim yazın.").foregroundStyle(.secondary)
                } else if isSearching {
                    ProgressView()
                } else if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else if results.isEmpty {
                    Text("Sonuç bulunamadı.").foregroundStyle(.secondary)
                } else {
                    ForEach(results) { item in
                        NavigationLink(value: item) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.name ?? item.code ?? "(isimsiz)").font(.body)
                                Text("\(item.code ?? "") · \(formattedQty(item)) \(item.unit ?? "adet")")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
            .navigationTitle("Stok")
            .searchable(text: $query, prompt: "Kod veya isimle ara")
            .autocorrectionDisabled()
            .textInputAutocapitalization(.never)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showScanner = true } label: {
                        Image(systemName: "barcode.viewfinder")
                    }
                }
            }
            .sheet(isPresented: $showScanner) {
                BarcodeScannerSheet(title: "Barkod Tara") { code in
                    Task { await lookupBarcode(code) }
                }
            }
            .sheet(item: $scannedItem) { item in
                NavigationStack {
                    StockItemDetailView(item: item)
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
            // .onChange yerine .task(id:) kullanıyoruz — yeni bir sorgu
            // geldiğinde önceki bekleyen görevi SwiftUI otomatik iptal eder,
            // elle Task referansı tutup iptal etmeye kıyasla daha güvenilir
            // (arama hiç tetiklenmiyor gibi görünen sorunun kaynağı muhtemelen
            // buradaki elle iptal mantığındaki bir yarış durumuydu).
            .task(id: query) {
                guard query.count >= 2 else { results = []; return }
                try? await Task.sleep(for: .milliseconds(250))
                guard !Task.isCancelled else { return }
                await search(query)
            }
            .refreshable {
                // Önbellek tek seferlik dolduktan sonra hiç yenilenmiyordu —
                // başka bir cihazdan yapılan stok değişiklikleri asla
                // yansımazdı. Aşağı çekince gerçekten yeniden çekiyoruz.
                _ = try? await StockCache.shared.reload()
                if query.count >= 2 { await search(query) }
            }
            .navigationDestination(for: StockItem.self) { item in
                StockItemDetailView(item: item)
            }
        }
    }

    private func formattedQty(_ item: StockItem) -> String {
        let q = item.quantity ?? 0
        return q == q.rounded() ? String(Int(q)) : String(q)
    }

    private func search(_ term: String) async {
        isSearching = true
        errorMessage = nil
        defer { isSearching = false }
        do {
            let all = try await StockCache.shared.all()
            let lower = term.lowercased()
            results = all.filter {
                ($0.code?.lowercased().contains(lower) ?? false) || ($0.name?.lowercased().contains(lower) ?? false)
            }.prefix(20).map { $0 }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Arama başarısız."
        }
    }

    private func lookupBarcode(_ code: String) async {
        do {
            if let item = try await APIClient.shared.stockItem(byBarcode: code) {
                scannedItem = item
            } else {
                scanErrorMessage = "Bu barkoda ait ürün bulunamadı: \(code)"
            }
        } catch {
            scanErrorMessage = (error as? LocalizedError)?.errorDescription ?? "Arama başarısız."
        }
    }
}

extension StockItem: Hashable {
    static func == (lhs: StockItem, rhs: StockItem) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct StockItemDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let item: StockItem
    @State private var quantity: Int
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(item: StockItem) {
        self.item = item
        _quantity = State(initialValue: Int(item.quantity ?? 0))
    }

    var body: some View {
        Form {
            Section {
                Text(item.code ?? "").font(.caption).foregroundStyle(.secondary)
                Text(item.name ?? "(isimsiz)").font(.title3.bold())
            }
            Section {
                LabeledContent("Fiyat (KDV hariç)") {
                    Text(item.price.map { $0.formatted(.currency(code: "TRY")) } ?? "—")
                }
                LabeledContent("Mevcut miktar") {
                    Text("\(Int(item.quantity ?? 0)) \(item.unit ?? "adet")")
                }
            }
            Section {
                Stepper(value: $quantity, in: 0...100000) {
                    Text("\(quantity)").font(.title2.bold().monospacedDigit())
                }
                Button {
                    Task { await save() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Miktarı Güncelle") }
                }
                .disabled(isSaving)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle(item.name ?? "Ürün")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            struct Body: Encodable { let quantity: Int; let actingUserId: String }
            let _: StockItem = try await APIClient.shared.put(
                "/stock/\(item.id)",
                body: Body(quantity: quantity, actingUserId: appState.currentUser?.id ?? "")
            )
            await StockCache.shared.invalidate(id: item.id, newQuantity: Double(quantity))
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Güncellenemedi."
        }
    }
}
