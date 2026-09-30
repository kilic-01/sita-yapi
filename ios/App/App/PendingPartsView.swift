import SwiftUI

struct PendingPartsView: View {
    @Environment(AppState.self) private var appState
    @State private var parts: [PendingPart] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreate = false

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if parts.isEmpty {
                Text("Bekleyen parça yok.").foregroundStyle(.secondary)
            } else {
                ForEach(sorted) { part in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(part.customerName ?? "(isimsiz)").font(.body)
                            Text(part.description ?? "").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button {
                            Task { await toggleStatus(part) }
                        } label: {
                            Text(part.status == "geldi" ? "Geldi" : "Bekliyor")
                                .font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(part.status == "geldi" ? Color.green.opacity(0.15) : Color.orange.opacity(0.15))
                                .foregroundStyle(part.status == "geldi" ? .green : .orange)
                                .clipShape(Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .navigationTitle("Bekleyen Parçalar")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus.circle.fill") }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                PendingPartCreateView(onCreated: { Task { await load() } })
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private var sorted: [PendingPart] {
        parts.sorted { ($0.orderedAt ?? "") > ($1.orderedAt ?? "") }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            parts = try await APIClient.shared.get("/pending-parts")
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Yüklenemedi."
        }
    }

    private func toggleStatus(_ part: PendingPart) async {
        let newStatus = part.status == "geldi" ? "bekleniyor" : "geldi"
        do {
            let body = StatusUpdate(status: newStatus, actingUserId: appState.currentUser?.id ?? "")
            let _: PendingPart = try await APIClient.shared.put("/pending-parts/\(part.id)", body: body)
            if let idx = parts.firstIndex(where: { $0.id == part.id }) {
                parts[idx].status = newStatus
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Durum güncellenemedi."
        }
    }
}

struct PendingPartCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var customerName = ""
    @State private var customerPhone = ""
    @State private var description = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Müşteri") {
                TextField("Müşteri Adı", text: $customerName)
                TextField("Telefon", text: $customerPhone).keyboardType(.phonePad)
            }
            Section("Parça") {
                TextField("Açıklama (ör. ürün kodu/adı)", text: $description, axis: .vertical).lineLimit(2...4)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Bekleyen Parça Ekle")
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
                .disabled(customerName.trimmingCharacters(in: .whitespaces).isEmpty || description.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = NewPendingPart(
                customerName: customerName.trimmingCharacters(in: .whitespaces),
                customerPhone: customerPhone,
                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                orderedAt: todayISODate(),
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: PendingPart = try await APIClient.shared.post("/pending-parts", body: body)
            onCreated()
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kaydedilemedi."
        }
    }
}
