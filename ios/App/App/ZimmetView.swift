import SwiftUI

struct ZimmetListView: View {
    @State private var checkouts: [PartCheckout] = []
    @State private var techNames: [String: String] = [:]
    @State private var stockById: [String: StockItem] = [:]
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreate = false
    @State private var reconcileTarget: PartCheckout?

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if checkouts.isEmpty {
                Text("Zimmet kaydı yok.").foregroundStyle(.secondary)
            } else {
                ForEach(sorted) { c in
                    let item = c.stockItemId.flatMap { stockById[$0] }
                    let isOutstanding = c.status == "outstanding"
                    Button {
                        if isOutstanding { reconcileTarget = c }
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item?.name ?? item?.code ?? "(ürün)").foregroundStyle(.primary)
                                Text("\(techNames[c.technicianId ?? ""] ?? "—") · \(c.date ?? "")")
                                    .font(.caption).foregroundStyle(.secondary)
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
        }
        .navigationTitle("Zimmet")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus.circle.fill") }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                ZimmetCreateView(onCreated: { Task { await load() } })
            }
        }
        .sheet(item: $reconcileTarget) { checkout in
            NavigationStack {
                ZimmetReconcileView(
                    checkout: checkout,
                    itemName: checkout.stockItemId.flatMap { stockById[$0] }?.name ?? "(ürün)",
                    onDone: { Task { await load() } }
                )
            }
        }
        .task { await load() }
    }

    private var sorted: [PartCheckout] {
        checkouts.sorted { ($0.date ?? "") > ($1.date ?? "") }.prefix(50).map { $0 }
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
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Zimmet listesi yüklenemedi."
        }
    }
}

struct ZimmetCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var technicians: [Technician] = []
    @State private var selectedTechId: String?
    @State private var query = ""
    @State private var searchResults: [StockItem] = []
    @State private var selectedItem: StockItem?
    @State private var quantity = 1
    @State private var isSubmitting = false
    @State private var errorMessage: String?
    @State private var showScanner = false

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
                        selectedItem = item
                        quantity = 1
                        query = ""
                        searchResults = []
                    } label: {
                        VStack(alignment: .leading) {
                            Text(item.name ?? item.code ?? "(isimsiz)").foregroundStyle(.primary)
                            Text("\(item.code ?? "") · \(Int(item.quantity ?? 0)) \(item.unit ?? "adet")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if let selectedItem {
                Section("Seçilen parça") {
                    Text(selectedItem.name ?? selectedItem.code ?? "(isimsiz)")
                    Stepper(value: $quantity, in: 1...10000) {
                        Text("\(quantity)").font(.title3.bold().monospacedDigit())
                    }
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
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
                .disabled(selectedItem == nil || selectedTechId == nil || isSubmitting)
            }
        }
        .task {
            technicians = (try? await APIClient.shared.get("/technicians")) ?? []
            technicians = technicians.filter { $0.assignable != false }
            selectedTechId = technicians.first?.id
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

    private func lookupBarcode(_ code: String) async {
        do {
            if let item = try await APIClient.shared.stockItem(byBarcode: code) {
                selectedItem = item
                quantity = 1
                query = ""
                searchResults = []
            } else {
                errorMessage = "Bu barkoda ait ürün bulunamadı: \(code)"
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Arama başarısız."
        }
    }

    private func submit() async {
        guard let item = selectedItem, let techId = selectedTechId, let userId = appState.currentUser?.id else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            struct Body: Encodable {
                let technicianId: String
                let stockItemId: String
                let date: String
                let qtyTaken: Int
                let actingUserId: String
            }
            let _: PartCheckout = try await APIClient.shared.post(
                "/part-checkouts",
                body: Body(technicianId: techId, stockItemId: item.id, date: todayISODate(), qtyTaken: quantity, actingUserId: userId)
            )
            await StockCache.shared.invalidate(id: item.id, newQuantity: max(0, (item.quantity ?? 0) - Double(quantity)))
            onCreated()
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Zimmetlenemedi."
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
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Mutabakat kaydedilemedi."
        }
    }
}
