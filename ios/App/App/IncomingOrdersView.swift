import SwiftUI

struct IncomingOrdersView: View {
    @State private var orders: [IncomingOrder] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreate = false

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if orders.isEmpty {
                Text("Gelen sipariş yok.").foregroundStyle(.secondary)
            } else {
                ForEach(sorted) { order in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(order.customerName ?? "(isimsiz)").font(.body)
                            Text([order.orderNo, order.orderDate].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let status = order.status {
                            Text(status)
                                .font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(.tint.opacity(0.15), in: Capsule())
                        }
                    }
                }
            }
        }
        .navigationTitle("Gelen Siparişler")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus.circle.fill") }
            }
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                IncomingOrderCreateView(onCreated: { Task { await load() } })
            }
        }
        .task { await load() }
    }

    private var sorted: [IncomingOrder] {
        orders.sorted { ($0.orderDate ?? "") > ($1.orderDate ?? "") }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            orders = try await APIClient.shared.get("/incoming-orders")
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Yüklenemedi."
        }
    }
}

struct IncomingOrderCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var customerName = ""
    @State private var notes = ""
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Müşteri") {
                TextField("Müşteri Adı", text: $customerName)
            }
            Section("Not") {
                TextField("Sipariş notu", text: $notes, axis: .vertical).lineLimit(2...4)
            }
            Text("Kalem detayları (ürünler, fiyatlar) için ofis/masaüstü kullanılmalı — bu, sahadan hızlı bir sipariş kaydı açar.")
                .font(.caption).foregroundStyle(.secondary)
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Gelen Sipariş Ekle")
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
                .disabled(customerName.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let body = NewIncomingOrder(
                customerName: customerName.trimmingCharacters(in: .whitespaces),
                orderDate: todayISODate(),
                notes: notes,
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: IncomingOrder = try await APIClient.shared.post("/incoming-orders", body: body)
            onCreated()
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kaydedilemedi."
        }
    }
}
