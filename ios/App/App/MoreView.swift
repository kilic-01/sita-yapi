import SwiftUI

/// Web sürümündeki GENERIC_LISTS motorunun native karşılığı — Çalışanlar/
/// Araçlar/Tatiller/Tedarikçiler/Yakıt kasıtlı olarak yok (kullanıcı
/// isteğiyle kaldırıldı; ayrıca bunlar masaüstünde de sadece yönetici
/// hesaplarına açık — requireAdmin ile korunuyor).
private enum MoreDestination: Hashable {
    case zimmet
    case quotes, pendingParts, incomingOrders, depots, activityLog, feeTracking
}

private struct MoreRow: View {
    let title: String
    let subtitle: String?
    let systemImage: String
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(.white)
                .frame(width: 28, height: 28)
                .background(tint, in: RoundedRectangle(cornerRadius: 7))
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                if let subtitle {
                    Text(subtitle).font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

struct MoreView: View {
    @Environment(AppState.self) private var appState
    @Environment(AppLockState.self) private var appLock

    var body: some View {
        NavigationStack {
            List {
                Section("Güvenlik") {
                    Toggle(
                        "Face ID ile Kilitle",
                        isOn: Binding(get: { appLock.isEnabled }, set: { appLock.isEnabled = $0 })
                    )
                }
                NavigationLink(value: MoreDestination.zimmet) {
                    MoreRow(title: "Zimmet", subtitle: "Parça zimmetleme", systemImage: "shippingbox.fill", tint: .indigo)
                }
                NavigationLink(value: MoreDestination.quotes) {
                    MoreRow(title: "Teklifler", subtitle: nil, systemImage: "doc.text.fill", tint: .gray)
                }
                NavigationLink(value: MoreDestination.pendingParts) {
                    MoreRow(title: "Bekleyen Parçalar", subtitle: nil, systemImage: "clock.fill", tint: .orange)
                }
                NavigationLink(value: MoreDestination.incomingOrders) {
                    MoreRow(title: "Gelen Siparişler", subtitle: nil, systemImage: "tray.and.arrow.down.fill", tint: .blue)
                }
                NavigationLink(value: MoreDestination.depots) {
                    MoreRow(title: "Depolar", subtitle: nil, systemImage: "archivebox.fill", tint: .indigo)
                }
                // Aktivite yalnız yöneticiye açık (sunucu da reddediyor) — diğerlerine hiç gösterilmez.
                if appState.currentUser?.role == "admin" {
                    NavigationLink(value: MoreDestination.activityLog) {
                        MoreRow(title: "Aktivite", subtitle: nil, systemImage: "chart.bar.fill", tint: .green)
                    }
                }
                NavigationLink(value: MoreDestination.feeTracking) {
                    MoreRow(title: "Ücret Takip", subtitle: nil, systemImage: "turkishlirasign.circle.fill", tint: .teal)
                }
            }
            .navigationTitle("Daha Fazla")
            .navigationDestination(for: MoreDestination.self) { destination in
                switch destination {
                case .zimmet:
                    ZimmetListView()
                case .quotes:
                    QuoteListView()
                case .pendingParts:
                    PendingPartsView()
                case .incomingOrders:
                    IncomingOrdersView()
                case .depots:
                    GenericListView(title: "Depolar", fetch: { try await APIClient.shared.get("/depots") as [Depot] }) { (d: Depot) in
                        (d.name ?? "(isimsiz)", "", nil)
                    }
                case .activityLog:
                    let userId = appState.currentUser?.id ?? ""
                    GenericListView(title: "Aktivite", fetch: { try await APIClient.shared.get("/activity-log?actingUserId=\(userId)") as [ActivityLogEntry] }) { (a: ActivityLogEntry) in
                        (a.description ?? "İşlem", formatActivityDate(a.createdAt), nil)
                    }
                case .feeTracking:
                    FeeTrackingView()
                }
            }
        }
    }
}

/// Tek bir şablonla salt-okunur listeleri render eder (web sürümündeki
/// openGenericList/GENERIC_LISTS ile aynı fikir).
struct GenericListView<Item: Decodable & Identifiable>: View {
    let title: String
    let fetch: () async throws -> [Item]
    let render: (Item) -> (title: String, subtitle: String, status: String?)

    @State private var items: [Item] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if items.isEmpty {
                Text("Kayıt yok.").foregroundStyle(.secondary)
            } else {
                ForEach(items) { item in
                    let row = render(item)
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title).font(.body)
                            if !row.subtitle.isEmpty {
                                Text(row.subtitle).font(.caption).foregroundStyle(.secondary)
                            }
                        }
                        Spacer()
                        if let status = row.status {
                            Text(status)
                                .font(.caption.bold())
                                .padding(.horizontal, 8).padding(.vertical, 3)
                                .background(.tint.opacity(0.15), in: Capsule())
                        }
                    }
                }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            do {
                items = try await fetch()
            } catch {
                errorMessage = error.turkishMessage
            }
            isLoading = false
        }
    }
}

/// "2026-11-14T13:22:05.123Z" → "14 Kas 2026, 16:22" (cihazın saat diliminde).
func formatActivityDate(_ iso: String?) -> String {
    guard let iso else { return "" }
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    guard let date else { return iso }
    let out = DateFormatter()
    out.locale = Locale(identifier: "tr_TR")
    out.dateFormat = "d MMM yyyy, HH:mm"
    return out.string(from: date)
}
