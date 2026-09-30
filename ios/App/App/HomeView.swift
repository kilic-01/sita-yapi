import SwiftUI

/// Web sürümündeki "gezinme butonu" kartları kaldırılmıştı (bkz.
/// server/public-barkod/index.html geçmişi) çünkü sekme çubuğuyla aynı yere
/// gidiyorlardı — gerçek Apple uygulamalarının ilk sekmesi (App Store
/// "Today", Health "Özet") gezinmeyi tekrar etmez, gerçek içerik gösterir.
/// Native sürüm aynı ilkeyle: sadece bilgi kartları.
struct HomeInfoCard: View {
    let systemImage: String
    let tint: Color
    let value: String
    let label: String

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(tint, in: RoundedRectangle(cornerRadius: 12))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.headline)
                Text(label).font(.subheadline).foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

struct HomeView: View {
    @Environment(AppState.self) private var appState
    @State private var apptCount: Int?
    @State private var nextAppt: Appointment?
    @State private var lowStockCount: Int?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Merhaba, \(appState.currentUser?.name ?? "")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 16)

                    HomeInfoCard(
                        systemImage: "calendar",
                        tint: .blue,
                        value: apptCount.map(String.init) ?? "—",
                        label: "Bugünkü randevu"
                    )
                    .padding(.horizontal, 16)

                    if let nextAppt {
                        HomeInfoCard(
                            systemImage: "mappin.circle.fill",
                            tint: .green,
                            value: nextAppt.customerName ?? "(isimsiz)",
                            label: nextAppt.address ?? "—"
                        )
                        .padding(.horizontal, 16)
                    }

                    HomeInfoCard(
                        systemImage: "shippingbox.fill",
                        tint: .orange,
                        value: lowStockCount.map(String.init) ?? "—",
                        label: "Kritik stokta ürün"
                    )
                    .padding(.horizontal, 16)
                }
                .padding(.vertical, 16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Sita Yapı")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        appState.requestLogoutConfirmation = true
                    } label: {
                        Text(String(appState.currentUser?.name.first ?? "?"))
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(.tint, in: Circle())
                    }
                }
            }
            .confirmationDialog("Çıkış yapmak istiyor musunuz?", isPresented: Binding(
                get: { appState.requestLogoutConfirmation },
                set: { appState.requestLogoutConfirmation = $0 }
            ), titleVisibility: .visible) {
                Button("Çıkış Yap", role: .destructive) { appState.logout() }
                Button("Vazgeç", role: .cancel) {}
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private func load() async {
        do {
            let appts: [Appointment] = try await APIClient.shared.get("/appointments/by-date/\(todayISODate())")
            apptCount = appts.count
            nextAppt = appts
                .filter { $0.status != "completed" && $0.status != "cancelled" }
                .sorted { ($0.stopOrder ?? 999) < ($1.stopOrder ?? 999) }
                .first
        } catch {
            apptCount = nil
        }
        do {
            let stock = try await StockCache.shared.all()
            lowStockCount = stock.filter { item in
                guard let threshold = item.lowStockThreshold else { return false }
                return (item.quantity ?? 0) <= threshold
            }.count
        } catch {
            lowStockCount = nil
        }
    }
}

func todayISODate() -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    return formatter.string(from: Date())
}

/// ~10 binlik stok listesinin web sürümündeki gibi tek seferlik önbelleği.
actor StockCache {
    static let shared = StockCache()
    private var cached: [StockItem]?

    func all() async throws -> [StockItem] {
        if let cached { return cached }
        let items: [StockItem] = try await APIClient.shared.get("/stock")
        cached = items
        return items
    }

    func invalidate(id: String, newQuantity: Double) {
        guard var items = cached, let idx = items.firstIndex(where: { $0.id == id }) else { return }
        items[idx].quantity = newQuantity
        cached = items
    }
}
