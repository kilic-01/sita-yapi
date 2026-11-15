import SwiftUI

struct StockView: View {
    @Environment(AppState.self) private var appState
    @State private var query = ""
    @State private var results: [StockItem] = []
    @State private var isSearching = false
    @State private var errorMessage: String?
    @State private var showScanner = false
    @Environment(TabRouter.self) private var router: TabRouter?
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
                    if !appState.recentStock.isEmpty {
                        Section("Son Bakılanlar") {
                            ForEach(appState.recentStock) { item in
                                stockRow(item)
                            }
                        }
                    }
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
            .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Kod veya isimle ara")
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
            // Ana sayfadaki "Barkod" hızlı işlemi: okuyucu doğrudan açılır.
            .onChange(of: router?.pendingStockScan ?? false, initial: true) { _, pending in
                if pending { router?.pendingStockScan = false; showScanner = true }
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
                    // Ürün kodu ad ile AYNI puntoda ve ÖNÜNDE (dispatcher'lar için kod
                    // en az ad kadar önemli) — artık kendi satırında kalın; uzun ad
                    // altında en fazla 2 satır.
                    if let code = item.code, !code.isEmpty {
                        Text(code).fontWeight(.semibold).lineLimit(1)
                        Text(item.name ?? "").font(.subheadline).foregroundStyle(.secondary).lineLimit(2)
                    } else {
                        Text(item.name ?? "(isimsiz)").lineLimit(2)
                    }
                }
                Spacer(minLength: 6)
                quantityBadge(item)
            }
        }
    }

    /// Miktar rozeti: 0 kırmızı, eşik altı turuncu, diğerleri nötr.
    private func quantityBadge(_ item: StockItem) -> some View {
        let qty = item.quantity ?? 0
        let color: Color = qty <= 0 ? .red : (qty <= Double(item.lowStockThreshold ?? 2) ? .orange : .secondary)
        return Text("\(formattedQty(item)) \(item.unit ?? "adet")")
            .font(.caption.weight(.semibold))
            .foregroundStyle(color)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(qty > Double(item.lowStockThreshold ?? 2) ? 0.12 : 0.14), in: Capsule())
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
            errorMessage = error.turkishMessage
        }
    }

    private func lookupBarcode(_ code: String) async {
        do {
            if let item = try await APIClient.shared.stockItem(byBarcode: code) {
                Haptics.success()
                scannedItem = item
            } else {
                Haptics.warning()
                scanErrorMessage = "Bu barkoda ait ürün bulunamadı: \(code)"
            }
        } catch {
            scanErrorMessage = error.turkishMessage
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
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var showEdit = false
    @State private var showDeleteConfirm = false
    @State private var showFinalDeleteConfirm = false
    @State private var showBarcodeScanner = false
    @State private var barcodeErrorMessage: String?
    // Bir ürün birden fazla depoda farklı miktarlarda durabiliyor — eskiden
    // burada sadece tekil (ve artık güncellenmeyen) "current.depotId" alanı
    // okunuyordu, gerçek dağılım hiç gösterilmiyordu.
    @State private var depotRows: [StockItemDepot] = []
    @State private var showTransfer = false
    // Ürün sayfasında "Son İşlem" artık AÇIK gösterilmiyor — kullanıcı bunu
    // gürültülü buldu, yerine bir "info" butonu + detaylı geçmiş sayfası var.
    @State private var showHistory = false
    // "TV'de Göster": ürün ofis TV'sinde açılır (masaüstündeki "Yayınla" ile aynı).
    @State private var isBroadcasting = false
    @State private var tvMessage: String?

    init(item: StockItem, depots: [Depot], onDeleted: @escaping () -> Void = {}) {
        self.depots = depots
        self.onDeleted = onDeleted
        _current = State(initialValue: item)
    }

    private func broadcastToTv() async {
        struct Body: Encodable { let item: StockItem; let actingUserId: String; let deviceName: String }
        struct Payload: Decodable { let sentAt: String?; let warning: String? }
        isBroadcasting = true
        tvMessage = nil
        defer { isBroadcasting = false }
        do {
            // TV'deki "yayınlayan" etiketi: cihaz + kullanıcı adı (ör. "iPhone · Emre").
            let device = [UIDevice.current.name, appState.currentUser?.name].compactMap { $0 }.joined(separator: " · ")
            let payload: Payload = try await APIClient.shared.post(
                "/tv/broadcast",
                body: Body(item: current, actingUserId: appState.currentUser?.id ?? "", deviceName: device)
            )
            // Bazı TV'ler gösteremediyse (internet yok vb.) sunucunun uyarısı kalır.
            tvMessage = payload.warning
            if payload.warning == nil { Haptics.success() } else { Haptics.warning() }
            if let sentAt = payload.sentAt {
                appState.tvOnAir = TvOnAir(sentAt: sentAt, title: current.code ?? current.name ?? "Ürün", subtitle: current.code == nil ? nil : current.name)
            }
        } catch {
            tvMessage = error.turkishMessage
        }
    }

    private func depotNameFor(_ id: String?) -> String? {
        depots.first { $0.id == id }?.name
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
                // Kod artık adın ÜSTÜNDE küçük bir altyazı değil, aynı
                // puntoda ve adın ÖNÜNDE — dispatcher'lar için kod en az ad
                // kadar önemli.
                Text(current.codeAndName).font(.title3.bold())
            }
            // TV'ye gönderilemezse küçük uyarı (başarıda alttaki yayın şeridi çıkar).
            if let tvMessage {
                Section {
                    Label(tvMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(.orange)
                }
            }
            Section {
                LabeledContent("Fiyat (KDV hariç)") {
                    Text(current.price.map { $0.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR"))) } ?? "—")
                }
                if let price = current.price {
                    LabeledContent("Fiyat (KDV dahil, %20)") {
                        Text((price * 1.2).formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR"))))
                    }
                }
                if let category = current.category, !category.isEmpty {
                    LabeledContent("Kategori", value: category)
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
                LabeledContent("Mevcut miktar (toplam)") {
                    Text("\(Int(current.quantity ?? 0)) \(current.unit ?? "adet")").bold()
                }
                if depotRows.filter({ ($0.quantity ?? 0) > 0 }).isEmpty {
                    Text("Hiçbir depoda stokta değil.").foregroundStyle(.secondary)
                } else {
                    ForEach(depotRows.filter({ ($0.quantity ?? 0) > 0 }), id: \.id) { row in
                        LabeledContent(depotNameFor(row.depotId) ?? "Bilinmeyen depo") {
                            Text("\(Int(row.quantity ?? 0)) \(current.unit ?? "adet")")
                        }
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    }
                }
                if depots.count >= 2 {
                    Button {
                        showTransfer = true
                    } label: {
                        Label("Depo Transferi", systemImage: "arrow.left.arrow.right")
                    }
                }
            } header: {
                Text("Depo Dağılımı")
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
            // "TV'de Göster": yalnız ikon (masaüstündeki AirPlay düğmesi gibi).
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await broadcastToTv() }
                } label: {
                    if isBroadcasting { ProgressView() } else { Image(systemName: "airplayvideo") }
                }
                .disabled(isBroadcasting)
                .accessibilityLabel("TV'de Göster")
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showHistory = true } label: {
                    Image(systemName: "info.circle")
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Düzenle") { showEdit = true }
            }
        }
        .sheet(isPresented: $showHistory) {
            NavigationStack {
                StockHistoryView(item: current)
            }
        }
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                StockEditView(item: current, depots: depots, onSaved: { updated in
                    current = updated
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
        .sheet(isPresented: $showTransfer) {
            NavigationStack {
                StockTransferView(item: current, depots: depots, onDone: { updated in
                    current = updated
                    Task { await loadDepotRows() }
                })
            }
        }
        .task { await loadDepotRows() }
        .task { appState.addRecentStock(current) }
    }

    private func loadDepotRows() async {
        depotRows = (try? await APIClient.shared.get("/stock/\(current.id)/depots")) ?? []
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
            _ = try? await StockCache.shared.reload()
        } catch {
            barcodeErrorMessage = error.turkishMessage
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
            errorMessage = error.turkishMessage
        }
    }
}

/// Desktop'taki StockPage.jsx düzenleme modalının native karşılığı — önceden
/// mobilde sadece miktar güncellenebiliyordu, kod/ad/birim/kategori/depo/
/// fiyat/barkod/az-stok-eşiği hiç değiştirilemiyordu.
struct StockEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    // "let" DEĞİL: barkod taramasından hızlıca açılan ekranlarda üst
    // görünümün "/depots" çağrısı henüz bitmeden bu form sunuluyorsa boş
    // bir liste burada SONSUZA DEK kalıyordu (SwiftUI sheet içeriği bir kez
    // kurulup üst view'daki sonraki güncellemeleri izlemiyor) — bu yüzden
    // boşsa kendi çağrısını kendi yapıyor (aşağıdaki .task).
    @State private var depots: [Depot]
    let onSaved: (StockItem) -> Void

    @State private var code: String
    @State private var name: String
    @State private var unit: String
    @State private var category: String
    @State private var price: String
    @State private var barcode: String
    @State private var lowStockThreshold: String
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showBarcodeScanner = false

    // Bir ürün birden fazla depoda farklı miktarlarda durabiliyor — eskiden
    // burada tek bir "depotId"/"quantity" Picker+Stepper vardı, aynı ürünün
    // ikinci bir depoda da stoklu olduğu asla gösterilemez/düzenlenemezdi.
    @State private var depotRows: [DepotRow] = []
    @State private var originalRows: [DepotRow] = []
    @State private var isLoadingDepotRows = true

    private let itemId: String

    init(item: StockItem, depots: [Depot], onSaved: @escaping (StockItem) -> Void) {
        self.itemId = item.id
        _depots = State(initialValue: depots)
        self.onSaved = onSaved
        _code = State(initialValue: item.code ?? "")
        _name = State(initialValue: item.name ?? "")
        _unit = State(initialValue: item.unit ?? "adet")
        _category = State(initialValue: item.category ?? "")
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
            }
            Section {
                if isLoadingDepotRows {
                    ProgressView()
                } else {
                    DepotRowsEditorView(rows: $depotRows, depots: depots)
                }
            } header: {
                Text("Depo Dağılımı")
            } footer: {
                Text("Bu ürün birden fazla depoda farklı miktarlarda durabilir — her depo için ayrı bir miktar girin.")
            }
            Section("Fiyat / Barkod") {
                TextField("Fiyat (KDV hariç)", text: $price)
                    .keyboardType(.decimalPad)
                HStack {
                    TextField("Barkod", text: $barcode)
                        .keyboardType(.numberPad)
                    Button {
                        showBarcodeScanner = true
                    } label: {
                        Image(systemName: "barcode.viewfinder")
                    }
                }
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
        .sheet(isPresented: $showBarcodeScanner) {
            BarcodeScannerSheet(title: "Barkod Tara") { code in
                barcode = code
            }
        }
        .task {
            if depots.isEmpty {
                depots = (try? await APIClient.shared.get("/depots")) ?? []
            }
        }
        .task {
            let rows: [StockItemDepot] = (try? await APIClient.shared.get("/stock/\(itemId)/depots")) ?? []
            let mapped = rows.map { row -> DepotRow in
                let qty = Int(row.quantity ?? 0)
                return DepotRow(depotId: row.depotId, quantity: qty > 0 ? String(qty) : "")
            }
            depotRows = mapped
            originalRows = mapped
            isLoadingDepotRows = false
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
                let price: Double?
                let barcode: String
                let lowStockThreshold: Double?
                let actingUserId: String
            }
            let actingUserId = appState.currentUser?.id ?? ""
            var updated: StockItem = try await APIClient.shared.put(
                "/stock/\(itemId)",
                body: Body(
                    code: code.trimmingCharacters(in: .whitespaces),
                    name: name.trimmingCharacters(in: .whitespaces),
                    unit: unit.trimmingCharacters(in: .whitespaces),
                    category: category.trimmingCharacters(in: .whitespaces),
                    price: Double(price.replacingOccurrences(of: ",", with: ".")),
                    barcode: barcode.trimmingCharacters(in: .whitespaces),
                    lowStockThreshold: Double(lowStockThreshold.replacingOccurrences(of: ",", with: ".")),
                    actingUserId: actingUserId
                )
            )

            struct QuantityBody: Encodable { let quantity: Int; let actingUserId: String }
            struct DeleteBody: Encodable { let actingUserId: String }

            let removed = originalRows.filter { o in
                guard let depotId = o.depotId else { return false }
                return !depotRows.contains { $0.depotId == depotId }
            }
            for row in removed {
                guard let depotId = row.depotId else { continue }
                _ = try? await APIClient.shared.delete("/stock/\(itemId)/depots/\(depotId)", body: DeleteBody(actingUserId: actingUserId))
            }
            for row in depotRows {
                guard let depotId = row.depotId else { continue }
                let qty = Int(row.quantity) ?? 0
                let original = originalRows.first { $0.depotId == depotId }
                if original == nil || (Int(original!.quantity) ?? 0) != qty {
                    let _: [StockItemDepot] = try await APIClient.shared.put(
                        "/stock/\(itemId)/depots/\(depotId)",
                        body: QuantityBody(quantity: qty, actingUserId: actingUserId)
                    )
                }
            }
            let newTotal = depotRows.reduce(0) { $0 + (Int($1.quantity) ?? 0) }
            updated.quantity = Double(newTotal)
            _ = try? await StockCache.shared.reload()
            onSaved(updated)
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

/// Desktop'taki "Yeni Ürün Ekle" formunun native karşılığı — önceden mobilde
/// tamamen yeni bir stok kalemi eklemenin hiçbir yolu yoktu.
struct StockCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    // StockEditView'deki aynı not: üst view'ın "/depots" çağrısı bitmeden bu
    // ekran açılırsa boş liste kalıcı kalmasın diye kendi .task'ı da var.
    // "private" DEĞİL: struct'taki TÜM stored property'ler private olursa
    // Swift'in sentezlediği memberwise init de private oluyor ve StockView'daki
    // çağrı (aynı dosyada ama farklı bir struct) derlenemiyordu.
    @State var depots: [Depot]
    let onCreated: () -> Void

    @State private var code = ""
    @State private var name = ""
    @State private var unit = "adet"
    @State private var category = ""
    // Yeni ürün de ilk eklenişte birden fazla depoya dağıtılabilsin diye
    // (ör. hem dükkan hem şantiye) tekil bir "depotId"/"quantity" yerine
    // StockEditView'daki ile aynı satır listesi editörü kullanılıyor.
    @State private var depotRows: [DepotRow] = []
    @State private var price = ""
    @State private var barcode = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showBarcodeScanner = false

    var body: some View {
        Form {
            Section("Ürün") {
                TextField("Kod", text: $code)
                TextField("Ad", text: $name)
                TextField("Birim", text: $unit)
            }
            Section("Sınıflandırma") {
                TextField("Kategori", text: $category)
            }
            Section {
                DepotRowsEditorView(rows: $depotRows, depots: depots)
            } header: {
                Text("Depo Dağılımı")
            } footer: {
                Text("Birden fazla depoya dağıtabilirsiniz — her depo için ayrı bir miktar girin.")
            }
            Section("Fiyat / Barkod") {
                TextField("Fiyat (KDV hariç)", text: $price)
                    .keyboardType(.decimalPad)
                HStack {
                    TextField("Barkod", text: $barcode)
                        .keyboardType(.numberPad)
                    Button {
                        showBarcodeScanner = true
                    } label: {
                        Image(systemName: "barcode.viewfinder")
                    }
                }
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
                .disabled(isSaving || code.trimmingCharacters(in: .whitespaces).isEmpty || validDepotRows.isEmpty)
            }
        }
        .sheet(isPresented: $showBarcodeScanner) {
            BarcodeScannerSheet(title: "Barkod Tara") { code in
                barcode = code
            }
        }
        .task {
            if depots.isEmpty {
                depots = (try? await APIClient.shared.get("/depots")) ?? []
            }
        }
    }

    private var validDepotRows: [StockDepotAllocation] {
        depotRows.compactMap { row in
            guard let depotId = row.depotId, let qty = Int(row.quantity), qty > 0 else { return nil }
            return StockDepotAllocation(depotId: depotId, quantity: Double(qty))
        }
    }

    private func submit() async {
        guard !validDepotRows.isEmpty else {
            errorMessage = "Depo seçimi zorunlu."
            return
        }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = NewStockItem(
                code: code.trimmingCharacters(in: .whitespaces),
                name: name.trimmingCharacters(in: .whitespaces),
                unit: unit.trimmingCharacters(in: .whitespaces).isEmpty ? "adet" : unit,
                depots: validDepotRows,
                category: category.trimmingCharacters(in: .whitespaces),
                price: Double(price.replacingOccurrences(of: ",", with: ".")),
                imageUrl: "",
                barcode: barcode.trimmingCharacters(in: .whitespaces),
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: StockItem = try await APIClient.shared.post("/stock", body: body)
            _ = try? await StockCache.shared.reload()
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}
