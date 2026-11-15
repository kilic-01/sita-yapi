import SwiftUI

// Masaüstündeki IncomingOrderForm.jsx STATUS_OPTIONS / IncomingOrdersPage.jsx renkleriyle aynı.
private let orderStatuses: [(value: String, label: String, color: Color)] = [
    ("yeni", "Yeni", Color(red: 0x3B / 255, green: 0x82 / 255, blue: 0xF6 / 255)),
    ("hazirlaniyor", "Hazırlanıyor", Color(red: 0xF5 / 255, green: 0x9E / 255, blue: 0x0B / 255)),
    ("kargoda", "Kargoda", Color(red: 0x8B / 255, green: 0x5C / 255, blue: 0xF6 / 255)),
    ("teslim_edildi", "Teslim Edildi", Color(red: 0x10 / 255, green: 0xB9 / 255, blue: 0x81 / 255)),
    ("odendi", "Ödendi", Color(red: 0x6B / 255, green: 0x72 / 255, blue: 0x80 / 255)),
]

struct IncomingOrdersView: View {
    @Environment(AppState.self) private var appState
    @State private var orders: [IncomingOrder] = []
    // Satıra dokununca durum değiştirme menüsü.
    @State private var statusTarget: IncomingOrder?
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
                    Button { statusTarget = order } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(order.customerName ?? "(isimsiz)").font(.body)
                            Text([order.orderNo, order.orderDate.map { trDate($0) }].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        if let status = order.status {
                            let s = orderStatuses.first { $0.value == status }
                            Text(s?.label ?? status)
                                .font(.caption.bold())
                                .foregroundStyle(s?.color ?? .secondary)
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background((s?.color ?? .gray).opacity(0.15), in: Capsule())
                        }
                    }
                    .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .navigationTitle("Gelen Siparişler")
        .confirmationDialog(
            statusTarget?.customerName ?? "Sipariş",
            isPresented: Binding(get: { statusTarget != nil }, set: { if !$0 { statusTarget = nil } }),
            titleVisibility: .visible
        ) {
            ForEach(orderStatuses, id: \.value) { s in
                Button(s.label) {
                    if let order = statusTarget { Task { await setStatus(order, s.value) } }
                }
            }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("Durumu değiştir")
        }
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
        .refreshable { await load() }
    }

    private var sorted: [IncomingOrder] {
        orders.sorted { ($0.orderDate ?? "") > ($1.orderDate ?? "") }
    }

    private func setStatus(_ order: IncomingOrder, _ status: String) async {
        struct Body: Encodable { let status: String; let actingUserId: String }
        do {
            let _: IncomingOrder = try await APIClient.shared.put(
                "/incoming-orders/\(order.id)",
                body: Body(status: status, actingUserId: appState.currentUser?.id ?? "")
            )
            if let idx = orders.firstIndex(where: { $0.id == order.id }) { orders[idx].status = status }
        } catch {
            errorMessage = error.turkishMessage
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            orders = try await APIClient.shared.get("/incoming-orders")
        } catch {
            errorMessage = error.turkishMessage
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
            errorMessage = error.turkishMessage
        }
    }
}
