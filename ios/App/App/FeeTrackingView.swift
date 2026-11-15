import SwiftUI

/// Desktop'taki Ücret Takip sayfasının (FeeTrackingPage.jsx) native
/// karşılığı — aylık özet/pasta grafik yok, sade bir liste + ekle/düzenle/
/// sil. "amount" zaten KDV dahil girilen tutarın kendisi (bkz. Models.swift
/// FeeEntry notu).
private let feeCategories: [(id: String, label: String)] = [
    ("yedekParca", "Yedek Parça"),
    ("iscilik", "İşçilik"),
    ("garantiDahili", "Garanti Dahili"),
    ("urunler", "Ürünler"),
]

private func feeCategoryLabel(_ id: String) -> String {
    feeCategories.first { $0.id == id }?.label ?? id
}

private func feeMoney(_ n: Double) -> String {
    n.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR")))
}

struct FeeTrackingView: View {
    @Environment(AppState.self) private var appState
    @State private var entries: [FeeEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreate = false
    @State private var editingEntry: FeeEntry?

    private var sorted: [FeeEntry] { entries.sorted { $0.date > $1.date } }

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if entries.isEmpty {
                Text("Henüz kayıt yok.").foregroundStyle(.secondary)
            } else {
                ForEach(sorted) { entry in
                    Button {
                        editingEntry = entry
                    } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(feeCategoryLabel(entry.category)).font(.body)
                                let subtitle = [entry.date.isEmpty ? nil : trDate(entry.date), (entry.description?.isEmpty == false ? entry.description : nil)]
                                    .compactMap { $0 }
                                    .joined(separator: " · ")
                                Text(subtitle).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(feeMoney(entry.totalAmount)).font(.body.bold())
                        }
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.primary)
                }
                .onDelete { offsets in
                    Task { await delete(at: offsets) }
                }
            }
        }
        .navigationTitle("Ücret Takip")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus.circle.fill") }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                FeeEntryFormView(entry: nil, onSaved: { Task { await load() } })
            }
        }
        .sheet(item: $editingEntry) { entry in
            NavigationStack {
                FeeEntryFormView(entry: entry, onSaved: { Task { await load() } })
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            entries = try await APIClient.shared.get("/fee-entries")
        } catch {
            errorMessage = error.turkishMessage
        }
    }

    private func delete(at offsets: IndexSet) async {
        struct Body: Encodable { let actingUserId: String }
        let toDelete = offsets.map { sorted[$0] }
        for entry in toDelete {
            do {
                try await APIClient.shared.delete(
                    "/fee-entries/\(entry.id)",
                    body: Body(actingUserId: appState.currentUser?.id ?? "")
                )
            } catch {
                errorMessage = error.turkishMessage
            }
        }
        await load()
    }
}

struct FeeEntryFormView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let entry: FeeEntry?
    let onSaved: () -> Void

    @State private var category: String
    @State private var amountText: String
    @State private var description: String
    @State private var date: Date
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(entry: FeeEntry?, onSaved: @escaping () -> Void) {
        self.entry = entry
        self.onSaved = onSaved
        _category = State(initialValue: entry?.category ?? "yedekParca")
        _amountText = State(initialValue: entry != nil ? String(entry!.amount) : "")
        _description = State(initialValue: entry?.description ?? "")
        _date = State(initialValue: Self.parseDate(entry?.date) ?? Date())
    }

    var body: some View {
        Form {
            Section("Kategori") {
                Picker("Kategori", selection: $category) {
                    ForEach(feeCategories, id: \.id) { c in
                        Text(c.label).tag(c.id)
                    }
                }
            }
            Section("Tutar") {
                TextField("Tutar", text: $amountText)
                    .keyboardType(.decimalPad)
            }
            Section("Tarih") {
                DatePicker("Tarih", selection: $date, displayedComponents: .date)
            }
            Section("Açıklama") {
                TextField("Açıklama (opsiyonel)", text: $description, axis: .vertical).lineLimit(2...4)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle(entry == nil ? "Yeni Ücret Kaydı" : "Kaydı Düzenle")
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
                .disabled(parsedAmount == nil || isSaving)
            }
        }
    }

    private var parsedAmount: Double? {
        Double(amountText.replacingOccurrences(of: ",", with: "."))
    }

    private func submit() async {
        guard let amount = parsedAmount, amount > 0 else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        let dateString = formatter.string(from: date)
        let actingUserId = appState.currentUser?.id ?? ""
        do {
            if let entry {
                let body = FeeEntryPatch(category: category, amount: amount, vatRate: 0, description: description, date: dateString, actingUserId: actingUserId)
                let _: FeeEntry = try await APIClient.shared.put("/fee-entries/\(entry.id)", body: body)
            } else {
                let body = NewFeeEntry(category: category, amount: amount, vatRate: 0, description: description, date: dateString, actingUserId: actingUserId)
                let _: FeeEntry = try await APIClient.shared.post("/fee-entries", body: body)
            }
            onSaved()
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }

    private static func parseDate(_ s: String?) -> Date? {
        guard let s else { return nil }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: String(s.prefix(10)))
    }
}

extension FeeEntry: Hashable {
    static func == (lhs: FeeEntry, rhs: FeeEntry) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}
