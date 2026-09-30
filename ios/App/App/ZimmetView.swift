import SwiftUI

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
            } else if checkouts.isEmpty {
                Text("Zimmet kaydı yok.").foregroundStyle(.secondary)
            } else {
                ForEach(sorted) { c in
                    let item = c.stockItemId.flatMap { stockById[$0] }
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(item?.name ?? item?.code ?? "(ürün)")
                            Text("\(techNames[c.technicianId ?? ""] ?? "—") · \(c.date ?? "")")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("\(Int(c.qtyTaken ?? 0)) \(item?.unit ?? "adet")").font(.subheadline.bold())
                    }
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
    @State private var searchTask: Task<Void, Never>?

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
                TextField("Parça ara (kod veya isim)", text: $query)
                    .onChange(of: query) { _, newValue in
                        searchTask?.cancel()
                        guard newValue.count >= 2 else { searchResults = []; return }
                        searchTask = Task {
                            try? await Task.sleep(for: .milliseconds(250))
                            guard !Task.isCancelled else { return }
                            let all = (try? await StockCache.shared.all()) ?? []
                            let lower = newValue.lowercased()
                            searchResults = all.filter {
                                ($0.code?.lowercased().contains(lower) ?? false) || ($0.name?.lowercased().contains(lower) ?? false)
                            }.prefix(15).map { $0 }
                        }
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
