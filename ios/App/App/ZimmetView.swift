import SwiftUI

/// Teknisyen başına bir satır — o teknisyenin zimmetlediği tüm ürünler satıra
/// dokununca açılan [ZimmetTechnicianDetailView]'da listelenir. Eskiden tüm
/// zimmet kayıtları (ürün bazında) tek bir düz liste olarak gösteriliyordu;
/// istenen değişiklik önce isim listesi, isme basınca o kişinin ürünleri.
private struct TechnicianZimmetGroup: Identifiable {
    let technicianId: String
    let technicianName: String
    let checkouts: [PartCheckout]
    var id: String { technicianId }
    var outstandingCount: Int { checkouts.filter { $0.status == "outstanding" }.count }
}

struct ZimmetListView: View {
    @State private var checkouts: [PartCheckout] = []
    @State private var techNames: [String: String] = [:]
    @State private var stockById: [String: StockItem] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreate = false

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if groups.isEmpty {
                Text("Zimmet kaydı yok.").foregroundStyle(.secondary)
            } else {
                ForEach(groups) { group in
                    NavigationLink {
                        ZimmetTechnicianDetailView(
                            technicianName: group.technicianName,
                            checkouts: group.checkouts,
                            stockById: stockById,
                            onChanged: { Task { await load() } }
                        )
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(group.technicianName).foregroundStyle(.primary)
                                Text("\(group.checkouts.count) ürün").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            if group.outstandingCount > 0 {
                                Text("\(group.outstandingCount) Mutabakat Bekliyor")
                                    .font(.caption2.bold()).foregroundStyle(.white)
                                    .padding(.horizontal, 6).padding(.vertical, 2)
                                    .background(.orange, in: Capsule())
                            } else {
                                Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Zimmet")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                NavigationLink {
                    PartCheckoutsWebPrintView(
                        date: todayISODate(),
                        checkouts: checkouts.filter { $0.date == todayISODate() },
                        techNames: techNames,
                        stockById: stockById
                    )
                } label: {
                    Image(systemName: "printer")
                }
                .disabled(isLoading)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus.circle.fill") }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                ZimmetCreateView(onCreated: { Task { await load() } })
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    /// Mutabakat bekleyeni olan teknisyenler önce, sonra isme göre alfabetik.
    private var groups: [TechnicianZimmetGroup] {
        let byTech = Dictionary(grouping: checkouts, by: { $0.technicianId ?? "" })
        return byTech.map { technicianId, checkouts in
            TechnicianZimmetGroup(
                technicianId: technicianId,
                technicianName: techNames[technicianId] ?? "—",
                checkouts: checkouts.sorted { ($0.date ?? "") > ($1.date ?? "") }
            )
        }
        .sorted {
            if ($0.outstandingCount > 0) != ($1.outstandingCount > 0) { return $0.outstandingCount > 0 }
            return $0.technicianName.localizedCaseInsensitiveCompare($1.technicianName) == .orderedAscending
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let checkoutsReq: [PartCheckout] = APIClient.shared.get("/part-checkouts")
            async let techsReq: [Technician] = APIClient.shared.get("/technicians")
            async let stockReq = StockCache.shared.all()
            let (c, t, s) = try await (checkoutsReq, techsReq, stockReq)
            checkouts = c
            techNames = Dictionary(uniqueKeysWithValues: t.map { ($0.id, $0.name) })
            stockById = Dictionary(uniqueKeysWithValues: s.map { ($0.id, $0) })
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

/// Bir teknisyenin zimmetlediği tüm ürünler — ZimmetListView'daki isim
/// satırına dokununca açılır. Eskiden ZimmetListView'da inline olan
/// satır/mutabakat mantığı buraya taşındı.
struct ZimmetTechnicianDetailView: View {
    let technicianName: String
    let initialCheckouts: [PartCheckout]
    let stockById: [String: StockItem]
    let onChanged: () -> Void

    @State private var checkouts: [PartCheckout] = []
    @State private var reconcileTarget: PartCheckout?

    init(technicianName: String, checkouts: [PartCheckout], stockById: [String: StockItem], onChanged: @escaping () -> Void) {
        self.technicianName = technicianName
        self.initialCheckouts = checkouts
        self.stockById = stockById
        self.onChanged = onChanged
    }

    var body: some View {
        List {
            ForEach(checkouts) { c in
                let item = c.stockItemId.flatMap { stockById[$0] }
                let isOutstanding = c.status == "outstanding"
                Button {
                    if isOutstanding { reconcileTarget = c }
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item?.name ?? item?.code ?? "(ürün)").foregroundStyle(.primary)
                            Text(trDate(c.date, empty: "")).font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(Int(c.qtyTaken ?? 0)) \(item?.unit ?? "adet")").font(.subheadline.bold())
                        if isOutstanding {
                            Text("Mutabakat Bekliyor")
                                .font(.caption2.bold()).foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.orange, in: Capsule())
                        } else {
                            Image(systemName: "checkmark.circle.fill").foregroundStyle(.green)
                        }
                    }
                }
                .disabled(!isOutstanding)
            }
        }
        .navigationTitle(technicianName)
        .navigationBarTitleDisplayMode(.inline)
        .task { checkouts = initialCheckouts }
        .sheet(item: $reconcileTarget) { checkout in
            NavigationStack {
                ZimmetReconcileView(
                    checkout: checkout,
                    itemName: checkout.stockItemId.flatMap { stockById[$0] }?.name ?? "(ürün)",
                    onDone: {
                        // Listeden çıkıp geri girmeden rozetin anında
                        // güncellenmesi için yerel kopyayı da işaretliyoruz —
                        // üstteki ZimmetListView zaten onChanged ile ayrıca
                        // yenileniyor.
                        if let idx = checkouts.firstIndex(where: { $0.id == checkout.id }) {
                            checkouts[idx].status = "reconciled"
                        }
                        onChanged()
                    }
                )
            }
        }
    }
}

/// Satış ekranındaki gibi (bkz. QuickSaleView.addScannedItem) tek seferde
/// birden fazla parça eklenebilsin diye bir satır listesi tutuyoruz. Eskiden
/// tek bir `selectedItem` vardı — art arda farklı barkod okutulduğunda yeni
/// satır açmak yerine öncekinin üzerine yazıyordu (bildirilen hata: "farklı
/// barkodları üst üste yazıyor").
struct ZimmetLineItem: Identifiable {
    let id: String
    let item: StockItem
    var quantity: Int
    // Bir ürün birden fazla depoda olabildiği için backend (electron/db.js
    // addPartCheckout) depotId olmadan HATA verip zimmetlemeyi tamamen
    // engelliyor — eskiden burada hiç gönderilmiyordu. nil = henüz
    // çözümlenmedi/kullanıcı seçmedi.
    var depotId: String?
    var depotOptions: [StockItemDepot]?
    var depotFetchFailed: Bool = false
}

struct ZimmetCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var technicians: [Technician] = []
    @State private var selectedTechId: String?
    @State private var query = ""
    @State private var searchResults: [StockItem] = []
    @State private var lineItems: [ZimmetLineItem] = []
    @State private var depots: [Depot] = []
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var submitErrorMessage: String?
    @State private var showScanner = false

    // QuickSaleView'deki ("Satış") AYNI öncelik kuralı: dükkanda stok varsa
    // soru sormadan dükkan seçilir — zimmetlenen parçalar da genelde
    // dükkandan alınıyor, kullanıcıya her seferinde sormak gereksiz.
    private var shopDepotId: String? { depots.first { $0.name == "Dükkan" }?.id }

    var body: some View {
        Form {
            Section("Teknisyen") {
                Picker("Teknisyen", selection: $selectedTechId) {
                    ForEach(technicians) { tech in
                        Text(tech.name).tag(Optional(tech.id))
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }
            Section("Parça") {
                Button {
                    showScanner = true
                } label: {
                    Label("Barkod ile Bul", systemImage: "barcode.viewfinder")
                }
                TextField("Parça ara (kod veya isim)", text: $query)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .task(id: query) {
                        guard query.count >= 2 else { searchResults = []; return }
                        try? await Task.sleep(for: .milliseconds(250))
                        guard !Task.isCancelled else { return }
                        let all = (try? await StockCache.shared.all()) ?? []
                        let lower = query.lowercased()
                        searchResults = all.filter {
                            ($0.code?.lowercased().contains(lower) ?? false) || ($0.name?.lowercased().contains(lower) ?? false)
                        }.prefix(15).map { $0 }
                    }
                ForEach(searchResults) { item in
                    Button {
                        addOrIncrementItem(item)
                        query = ""
                        searchResults = []
                    } label: {
                        VStack(alignment: .leading) {
                            Text(item.codeAndName).foregroundStyle(.primary)
                            Text("\(Int(item.quantity ?? 0)) \(item.unit ?? "adet")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if !lineItems.isEmpty {
                Section("Seçilen parçalar") {
                    ForEach(lineItems) { line in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Text(line.item.codeAndName)
                                Spacer()
                                Stepper(value: quantityBinding(for: line.id), in: 1...10000) {
                                    Text("\(line.quantity)").font(.title3.bold().monospacedDigit())
                                }
                            }
                            depotStatusView(for: line)
                        }
                    }
                    .onDelete { offsets in
                        lineItems.remove(atOffsets: offsets)
                    }
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
            if let submitErrorMessage {
                Text(submitErrorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Yeni Zimmet")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting { ProgressView() } else { Text("Zimmetle") }
                }
                .disabled(lineItems.isEmpty || selectedTechId == nil || isSubmitting)
            }
        }
        .task {
            technicians = (try? await APIClient.shared.get("/technicians")) ?? []
            technicians = technicians.filter { $0.assignable != false }
            selectedTechId = technicians.first?.id
        }
        .task {
            depots = (try? await APIClient.shared.get("/depots")) ?? []
        }
        .sheet(isPresented: $showScanner) {
            BarcodeScannerSheet(title: "Barkod ile Parça Bul") { code in
                Task { await lookupBarcode(code) }
            }
        }
        .alert(
            "Ürün Bulunamadı",
            isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })
        ) {
            Button("Tamam", role: .cancel) {}
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private func quantityBinding(for id: String) -> Binding<Int> {
        Binding(
            get: { lineItems.first(where: { $0.id == id })?.quantity ?? 1 },
            set: { newValue in
                if let idx = lineItems.firstIndex(where: { $0.id == id }) {
                    lineItems[idx].quantity = newValue
                }
            }
        )
    }

    /// Aynı ürün art arda okutulursa/aranırsa yeni satır açmak yerine
    /// miktarını artırır — farklı ürünler ise satış ekranındaki gibi ayrı
    /// satırlar olarak listeye eklenir.
    private func addOrIncrementItem(_ item: StockItem) {
        if let idx = lineItems.firstIndex(where: { $0.id == item.id }) {
            lineItems[idx].quantity += 1
        } else {
            lineItems.append(ZimmetLineItem(id: item.id, item: item, quantity: 1))
            Task { await resolveDepot(for: item.id) }
        }
    }

    /// Bir ürün birden fazla depoda olabildiği için (bkz. electron/db.js
    /// stockItemDepots) backend depotId olmadan zimmetlemeyi hata ile
    /// engelliyor — tek depoda stok varsa otomatik atar, birden fazlaysa
    /// kullanıcı "depotStatusView"daki seçiciden seçene kadar boş kalır.
    /// "try?" ile sorgu BAŞARISIZ olursa eskiden bu da boş dizi [] olarak
    /// yorumlanıyor, "hiçbir depoda stok yok" ile aynı gösteriliyordu —
    /// stoğu GERÇEKTEN olan bir ürün bile "Stokta yok" uyarısı alıyordu.
    private func resolveDepot(for stockItemId: String) async {
        guard let idx = lineItems.firstIndex(where: { $0.id == stockItemId }) else { return }
        do {
            let rows: [StockItemDepot] = try await APIClient.shared.get("/stock/\(stockItemId)/depots")
            let withStock = rows.filter { ($0.quantity ?? 0) > 0 }
            lineItems[idx].depotOptions = withStock
            lineItems[idx].depotFetchFailed = false
            if let shopId = shopDepotId, withStock.contains(where: { $0.depotId == shopId }) {
                lineItems[idx].depotId = shopId
            } else if withStock.count == 1 {
                lineItems[idx].depotId = withStock[0].depotId
            }
        } catch {
            lineItems[idx].depotOptions = nil
            lineItems[idx].depotFetchFailed = true
        }
    }

    @ViewBuilder
    private func depotStatusView(for line: ZimmetLineItem) -> some View {
        if line.depotFetchFailed {
            Button {
                Task { await resolveDepot(for: line.id) }
            } label: {
                Text("Depo bilgisi alınamadı — tekrar dene").font(.caption)
            }
        } else if let options = line.depotOptions {
            if options.isEmpty {
                Text("Stokta yok").font(.caption).foregroundStyle(.red)
            } else if options.count == 1 {
                Text(depots.first { $0.id == options[0].depotId }?.name ?? "Bilinmeyen depo")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Picker(
                    "Depo",
                    selection: Binding(
                        get: { lineItems.first { $0.id == line.id }?.depotId },
                        set: { newValue in
                            if let idx = lineItems.firstIndex(where: { $0.id == line.id }) { lineItems[idx].depotId = newValue }
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

    private func lookupBarcode(_ code: String) async {
        do {
            if let item = try await APIClient.shared.stockItem(byBarcode: code) {
                addOrIncrementItem(item)
                query = ""
                searchResults = []
            } else {
                errorMessage = "Bu barkoda ait ürün bulunamadı: \(code)"
            }
        } catch {
            errorMessage = error.turkishMessage
        }
    }

    private func submit() async {
        guard !lineItems.isEmpty, let techId = selectedTechId, let userId = appState.currentUser?.id else { return }
        // Backend (electron/db.js addPartCheckout) depotId olmadan HATA
        // verip tüm zimmetlemeyi engelliyor — birden fazla depoda duran ve
        // henüz seçilmemiş bir satır varsa göndermeden önce kullanıcıya
        // sorduruyoruz (masaüstündeki PartCheckoutsPage.jsx ile aynı kontrol).
        if let ambiguous = lineItems.first(where: { $0.depotId == nil }) {
            let reason: String
            if ambiguous.depotFetchFailed {
                reason = "için depo bilgisi alınamadı — tekrar deneyin."
            } else if (ambiguous.depotOptions?.count ?? 0) > 1 {
                reason = "birden fazla depoda var — hangi depodan düşüleceğini seçin."
            } else {
                reason = "hiçbir depoda stokta değil."
            }
            submitErrorMessage = "\"\(ambiguous.item.codeAndName)\" \(reason)"
            return
        }
        isSubmitting = true
        errorMessage = nil
        submitErrorMessage = nil
        defer { isSubmitting = false }
        do {
            struct Body: Encodable {
                let technicianId: String
                let stockItemId: String
                let depotId: String
                let date: String
                let qtyTaken: Int
                let actingUserId: String
            }
            let date = todayISODate()
            for line in lineItems {
                guard let depotId = line.depotId else { continue }
                let _: PartCheckout = try await APIClient.shared.post(
                    "/part-checkouts",
                    body: Body(technicianId: techId, stockItemId: line.item.id, depotId: depotId, date: date, qtyTaken: line.quantity, actingUserId: userId)
                )
                await StockCache.shared.invalidate(id: line.item.id, newQuantity: max(0, (line.item.quantity ?? 0) - Double(line.quantity)))
            }
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

/// Desktop'taki reconcilePartCheckout ile aynı kural: kullanılan + iade
/// edilen + arabada depolanan miktarın toplamı, alınan miktara eşit olmalı.
struct ZimmetReconcileView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let checkout: PartCheckout
    let itemName: String
    let onDone: () -> Void

    @State private var qtyUsed: Int = 0
    @State private var qtyReturned: Int = 0
    @State private var qtyStoredInVehicle: Int = 0
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var taken: Int { Int(checkout.qtyTaken ?? 0) }
    private var remaining: Int { taken - qtyUsed - qtyReturned - qtyStoredInVehicle }

    var body: some View {
        Form {
            Section {
                Text(itemName).font(.headline)
                Text("Alınan: \(taken) adet").font(.subheadline).foregroundStyle(.secondary)
            }
            Section("Kullanılan / İade / Araçta") {
                Stepper("Kullanılan: \(qtyUsed)", value: $qtyUsed, in: 0...taken)
                Stepper("İade Edilen: \(qtyReturned)", value: $qtyReturned, in: 0...taken)
                Stepper("Araçta Depolanan: \(qtyStoredInVehicle)", value: $qtyStoredInVehicle, in: 0...taken)
            }
            Section {
                LabeledContent("Kalan") {
                    Text("\(remaining)")
                        .foregroundStyle(remaining == 0 ? .green : .red)
                        .fontWeight(.bold)
                }
                if remaining != 0 {
                    Text("Kullanılan + iade edilen + arabada depolanan miktarın toplamı, alınan miktara (\(taken)) eşit olmalı.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Mutabakat")
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
                .disabled(remaining != 0 || isSaving)
            }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = ReconcileCheckout(
                qtyUsed: Double(qtyUsed),
                qtyReturned: Double(qtyReturned),
                qtyStoredInVehicle: Double(qtyStoredInVehicle),
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: PartCheckout = try await APIClient.shared.put("/part-checkouts/\(checkout.id)/reconcile", body: body)
            onDone()
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}
