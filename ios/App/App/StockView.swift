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
    @State private var depots: [Depot] = []
    @State private var showCreate = false
    @State private var lowStockItems: [StockItem] = []
    @State private var isLoadingDefault = true

    private var isFiltering: Bool { query.count >= 2 }

    var body: some View {
        NavigationStack {
            List {
                if isFiltering {
                    if isSearching {
                        ProgressView()
                    } else if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    } else if results.isEmpty {
                        Text("Sonuç bulunamadı.").foregroundStyle(.secondary)
                    } else {
                        ForEach(results) { item in
                            stockRow(item)
                        }
                    }
                } else {
                    // Arama yapılmadan sayfa tamamen boş görünüyordu — kod/isim
                    // yazmayı gerektiren TEK giriş noktası aramaydı. Masaüstündeki
                    // StockPage.jsx gibi, hiç arama yapmadan az stoklu ürünleri
                    // varsayılan olarak gösteriyoruz ki ürünlere hiç yazı
                    // yazmadan da (ör. arama kutusuna dokunmadan) ulaşılabilsin.
                    if isLoadingDefault {
                        ProgressView()
                    } else if lowStockItems.isEmpty {
                        Text("Az stoklu ürün yok. Belirli bir ürünü bulmak için arayın.").foregroundStyle(.secondary)
                    } else {
                        Section("Az Stoklu Ürünler (\(lowStockItems.count))") {
                            ForEach(lowStockItems.prefix(100)) { item in
                                stockRow(item)
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
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: {
                        Image(systemName: "plus.circle.fill")
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
                    StockItemDetailView(item: item, depots: depots, onDeleted: {
                        removeFromLists(item.id)
                    })
                }
            }
            .sheet(isPresented: $showCreate) {
                NavigationStack {
                    StockCreateView(depots: depots, onCreated: { Task { await search(query) } })
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
            .task {
                depots = (try? await APIClient.shared.get("/depots")) ?? []
            }
            .task {
                await loadDefaultList()
            }
            .refreshable {
                // Önbellek tek seferlik dolduktan sonra hiç yenilenmiyordu —
                // başka bir cihazdan yapılan stok değişiklikleri asla
                // yansımazdı. Aşağı çekince gerçekten yeniden çekiyoruz.
                _ = try? await StockCache.shared.reload()
                if isFiltering {
                    await search(query)
                } else {
                    await loadDefaultList()
                }
            }
            .navigationDestination(for: StockItem.self) { item in
                StockItemDetailView(item: item, depots: depots, onDeleted: {
                    removeFromLists(item.id)
                })
            }
        }
    }

    @ViewBuilder
    private func stockRow(_ item: StockItem) -> some View {
        NavigationLink(value: item) {
            HStack(spacing: 10) {
                stockThumbnail(item)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.name ?? item.code ?? "(isimsiz)").font(.body)
                    Text("\(item.code ?? "") · \(formattedQty(item)) \(item.unit ?? "adet")")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func removeFromLists(_ id: String) {
        results.removeAll { $0.id == id }
        lowStockItems.removeAll { $0.id == id }
    }

    private func loadDefaultList() async {
        isLoadingDefault = true
        defer { isLoadingDefault = false }
        let all = (try? await StockCache.shared.all()) ?? []
        lowStockItems = all
            .filter { ($0.quantity ?? 0) <= ($0.lowStockThreshold ?? 2) }
            .sorted {
                let aOver = ($0.quantity ?? 0) - ($0.lowStockThreshold ?? 2)
                let bOver = ($1.quantity ?? 0) - ($1.lowStockThreshold ?? 2)
                return aOver < bOver
            }
    }

    @ViewBuilder
    private func stockThumbnail(_ item: StockItem) -> some View {
        if let urlString = item.imageUrl, let url = URL(string: urlString) {
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else {
                    Color.clear
                }
            }
            .frame(width: 32, height: 32)
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
            // İlk yükleme birkaç saniye sürebildiği için (bkz. StockCache),
            // bu çağrı tamamlandığında kullanıcı çoktan farklı bir şey
            // yazmış olabilir — eski sonucu güncel sorgunun üzerine yazmayı
            // önlüyoruz.
            guard term == query else { return }
            let lower = term.lowercased()
            results = all.filter {
                ($0.code?.lowercased().contains(lower) ?? false) || ($0.name?.lowercased().contains(lower) ?? false)
            }.prefix(20).map { $0 }
        } catch {
            guard term == query else { return }
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
    let depots: [Depot]
    let onDeleted: () -> Void

    @State private var current: StockItem
    @State private var quantity: Int
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var showEdit = false
    @State private var showDeleteConfirm = false
    @State private var showFinalDeleteConfirm = false
    @State private var showBarcodeScanner = false
    @State private var barcodeErrorMessage: String?

    init(item: StockItem, depots: [Depot], onDeleted: @escaping () -> Void = {}) {
        self.depots = depots
        self.onDeleted = onDeleted
        _current = State(initialValue: item)
        _quantity = State(initialValue: Int(item.quantity ?? 0))
    }

    private var depotName: String? {
        guard let id = current.depotId else { return nil }
        return depots.first { $0.id == id }?.name
    }

    var body: some View {
        Form {
            Section {
                if let urlString = current.imageUrl, let url = URL(string: urlString) {
                    AsyncImage(url: url) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFit().frame(maxHeight: 160)
                        } else {
                            Color.clear.frame(height: 0)
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
                Text(current.code ?? "").font(.caption).foregroundStyle(.secondary)
                Text(current.name ?? "(isimsiz)").font(.title3.bold())
            }
            Section {
                LabeledContent("Fiyat (KDV hariç)") {
                    Text(current.price.map { $0.formatted(.currency(code: "TRY")) } ?? "—")
                }
                if let price = current.price {
                    LabeledContent("Fiyat (KDV dahil, %20)") {
                        Text((price * 1.2).formatted(.currency(code: "TRY")))
                    }
                }
                LabeledContent("Mevcut miktar") {
                    Text("\(Int(current.quantity ?? 0)) \(current.unit ?? "adet")")
                }
                if let category = current.category, !category.isEmpty {
                    LabeledContent("Kategori", value: category)
                }
                if let depotName {
                    LabeledContent("Depo", value: depotName)
                }
                if let barcode = current.barcode, !barcode.isEmpty {
                    LabeledContent("Barkod", value: barcode)
                } else {
                    Button {
                        showBarcodeScanner = true
                    } label: {
                        Label("Barkod Ekle", systemImage: "barcode.viewfinder")
                    }
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
            if appState.currentUser?.role == "admin" {
                Section {
                    Button(role: .destructive) {
                        showDeleteConfirm = true
                    } label: {
                        if isDeleting { ProgressView() } else { Text("Ürünü Sil") }
                    }
                    .disabled(isDeleting)
                }
            }
        }
        .navigationTitle(current.name ?? "Ürün")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Düzenle") { showEdit = true }
            }
        }
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                StockEditView(item: current, depots: depots, onSaved: { updated in
                    current = updated
                    quantity = Int(updated.quantity ?? 0)
                })
            }
        }
        .confirmationDialog(
            "Bu ürün kalıcı olarak silinecek. Emin misiniz?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Sil", role: .destructive) { showFinalDeleteConfirm = true }
            Button("Vazgeç", role: .cancel) {}
        }
        // Yanlışlıkla ürün silmeyi önlemek için tek onay yetmiyordu — ikinci,
        // ürün adını açıkça gösteren bir son uyarı daha ekleniyor.
        .alert(
            "Son Kez Soruyoruz",
            isPresented: $showFinalDeleteConfirm
        ) {
            Button("Evet, Kalıcı Olarak Sil", role: .destructive) { Task { await delete() } }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("\"\(current.name ?? current.code ?? "Bu ürün")\" geri alınamaz şekilde silinecek.")
        }
        .sheet(isPresented: $showBarcodeScanner) {
            BarcodeScannerSheet(title: "Barkod Ekle") { code in
                Task { await assignBarcode(code) }
            }
        }
        .alert(
            "Barkod Eklenemedi",
            isPresented: Binding(get: { barcodeErrorMessage != nil }, set: { if !$0 { barcodeErrorMessage = nil } })
        ) {
            Button("Tamam", role: .cancel) {}
        } message: {
            Text(barcodeErrorMessage ?? "")
        }
    }

    /// Barkodu olmayan ürünlere kamerayla hızlıca yeni barkod atamak için —
    /// tam "Düzenle" formunu açmaya gerek kalmadan. Aynı barkodun başka bir
    /// üründe zaten kayıtlı olup olmadığını kontrol ediyoruz, yoksa
    /// by-barcode araması iki farklı ürüne çarpan belirsiz bir eşleşme
    /// döndürürdü.
    private func assignBarcode(_ code: String) async {
        do {
            if let existing = try await APIClient.shared.stockItem(byBarcode: code), existing.id != current.id {
                barcodeErrorMessage = "Bu barkod zaten başka bir ürüne (\(existing.name ?? existing.code ?? "")) kayıtlı."
                return
            }
            struct Body: Encodable { let barcode: String; let actingUserId: String }
            let updated: StockItem = try await APIClient.shared.put(
                "/stock/\(current.id)",
                body: Body(barcode: code, actingUserId: appState.currentUser?.id ?? "")
            )
            current = updated
            try? await StockCache.shared.reload()
        } catch {
            barcodeErrorMessage = (error as? LocalizedError)?.errorDescription ?? "Barkod kaydedilemedi."
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            struct Body: Encodable { let quantity: Int; let actingUserId: String }
            let updated: StockItem = try await APIClient.shared.put(
                "/stock/\(current.id)",
                body: Body(quantity: quantity, actingUserId: appState.currentUser?.id ?? "")
            )
            current = updated
            await StockCache.shared.invalidate(id: current.id, newQuantity: Double(quantity))
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Güncellenemedi."
        }
    }

    private func delete() async {
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            struct Body: Encodable { let actingUserId: String }
            _ = try await APIClient.shared.delete(
                "/stock/\(current.id)",
                body: Body(actingUserId: appState.currentUser?.id ?? "")
            )
            onDeleted()
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Silinemedi."
        }
    }
}

/// Desktop'taki StockPage.jsx düzenleme modalının native karşılığı — önceden
/// mobilde sadece miktar güncellenebiliyordu, kod/ad/birim/kategori/depo/
/// fiyat/barkod/az-stok-eşiği hiç değiştirilemiyordu.
struct StockEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let depots: [Depot]
    let onSaved: (StockItem) -> Void

    @State private var code: String
    @State private var name: String
    @State private var unit: String
    @State private var category: String
    @State private var depotId: String?
    @State private var price: String
    @State private var barcode: String
    @State private var lowStockThreshold: String
    @State private var isSaving = false
    @State private var errorMessage: String?

    private let itemId: String

    init(item: StockItem, depots: [Depot], onSaved: @escaping (StockItem) -> Void) {
        self.itemId = item.id
        self.depots = depots
        self.onSaved = onSaved
        _code = State(initialValue: item.code ?? "")
        _name = State(initialValue: item.name ?? "")
        _unit = State(initialValue: item.unit ?? "adet")
        _category = State(initialValue: item.category ?? "")
        _depotId = State(initialValue: item.depotId)
        _price = State(initialValue: item.price.map { String($0) } ?? "")
        _barcode = State(initialValue: item.barcode ?? "")
        _lowStockThreshold = State(initialValue: item.lowStockThreshold.map { String($0) } ?? "")
    }

    var body: some View {
        Form {
            Section("Ürün") {
                TextField("Kod", text: $code)
                TextField("Ad", text: $name)
                TextField("Birim", text: $unit)
            }
            Section("Sınıflandırma") {
                TextField("Kategori", text: $category)
                Picker("Depo", selection: $depotId) {
                    Text("Belirtilmemiş").tag(String?.none)
                    ForEach(depots) { depot in
                        Text(depot.name ?? "(isimsiz)").tag(Optional(depot.id))
                    }
                }
            }
            Section("Fiyat / Barkod") {
                TextField("Fiyat (KDV hariç)", text: $price)
                    .keyboardType(.decimalPad)
                TextField("Barkod", text: $barcode)
                    .keyboardType(.numberPad)
                TextField("Az Stok Eşiği", text: $lowStockThreshold)
                    .keyboardType(.numberPad)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Ürünü Düzenle")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Kaydet").bold() }
                }
                .disabled(isSaving || code.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            struct Body: Encodable {
                let code: String
                let name: String
                let unit: String
                let category: String
                let depotId: String?
                let price: Double?
                let barcode: String
                let lowStockThreshold: Double?
                let actingUserId: String
            }
            let updated: StockItem = try await APIClient.shared.put(
                "/stock/\(itemId)",
                body: Body(
                    code: code.trimmingCharacters(in: .whitespaces),
                    name: name.trimmingCharacters(in: .whitespaces),
                    unit: unit.trimmingCharacters(in: .whitespaces),
                    category: category.trimmingCharacters(in: .whitespaces),
                    depotId: depotId,
                    price: Double(price.replacingOccurrences(of: ",", with: ".")),
                    barcode: barcode.trimmingCharacters(in: .whitespaces),
                    lowStockThreshold: Double(lowStockThreshold),
                    actingUserId: appState.currentUser?.id ?? ""
                )
            )
            try? await StockCache.shared.reload()
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kaydedilemedi."
        }
    }
}

/// Desktop'taki "Yeni Ürün Ekle" formunun native karşılığı — önceden mobilde
/// tamamen yeni bir stok kalemi eklemenin hiçbir yolu yoktu.
struct StockCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let depots: [Depot]
    let onCreated: () -> Void

    @State private var code = ""
    @State private var name = ""
    @State private var quantity = ""
    @State private var unit = "adet"
    @State private var category = ""
    @State private var depotId: String?
    @State private var price = ""
    @State private var barcode = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Ürün") {
                TextField("Kod", text: $code)
                TextField("Ad", text: $name)
                TextField("Miktar", text: $quantity)
                    .keyboardType(.numberPad)
                TextField("Birim", text: $unit)
            }
            Section("Sınıflandırma") {
                TextField("Kategori", text: $category)
                Picker("Depo", selection: $depotId) {
                    Text("Belirtilmemiş").tag(String?.none)
                    ForEach(depots) { depot in
                        Text(depot.name ?? "(isimsiz)").tag(Optional(depot.id))
                    }
                }
            }
            Section("Fiyat / Barkod") {
                TextField("Fiyat (KDV hariç)", text: $price)
                    .keyboardType(.decimalPad)
                TextField("Barkod", text: $barcode)
                    .keyboardType(.numberPad)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Yeni Ürün")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Ekle").bold() }
                }
                .disabled(isSaving || code.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = NewStockItem(
                code: code.trimmingCharacters(in: .whitespaces),
                name: name.trimmingCharacters(in: .whitespaces),
                quantity: Double(quantity) ?? 0,
                unit: unit.trimmingCharacters(in: .whitespaces).isEmpty ? "adet" : unit,
                depotId: depotId,
                category: category.trimmingCharacters(in: .whitespaces),
                price: Double(price.replacingOccurrences(of: ",", with: ".")),
                imageUrl: "",
                barcode: barcode.trimmingCharacters(in: .whitespaces),
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: StockItem = try await APIClient.shared.post("/stock", body: body)
            try? await StockCache.shared.reload()
            onCreated()
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Eklenemedi."
        }
    }
}
