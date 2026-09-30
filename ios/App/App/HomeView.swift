import SwiftUI

/// Desktop'taki HOME_WIDGETS'ın (src/components/homeWidgets.jsx) native
/// karşılığı — sürükle-bırak ızgara yerine dikey bir liste, ama masaüstündeki
/// gibi widget'lar kaldırılıp yeniden eklenebiliyor (bkz. HomeWidgetPreferences,
/// "Düzenle" butonu). Kapsam dışı bırakılanlar (bilinçli): "İzin Dönüşü
/// Bekleyen Randevular" (verimli çekmek için ayrı bir backend ucu gerekir,
/// telefonda tüm randevu tablosunu taramak istemedik) ve "Gün Sonu Özeti"
/// (sadece yönetici, düşük öncelik).

struct HomeView: View {
    @Environment(AppState.self) private var appState
    @Environment(TabRouter.self) private var router

    @State private var todayAppts: [Appointment] = []
    @State private var tomorrowAppts: [Appointment] = []
    @State private var weekAppts: [Appointment] = []
    @State private var quotes: [Quote] = []
    @State private var checkouts: [PartCheckout] = []
    @State private var technicians: [Technician] = []
    @State private var lowStockItems: [StockItem] = []
    @State private var showCreateAppointment = false
    @State private var showQuickSale = false
    @State private var widgetPrefs = HomeWidgetPreferences()
    @State private var isEditingWidgets = false
    @State private var showAddWidgetSheet = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Merhaba, \(appState.currentUser?.name ?? "")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    quickActionsRow

                    statsStrip

                    ForEach(widgetPrefs.visible, id: \.self) { id in
                        editableWidget(id) { widgetContent(for: id) }
                    }

                    if isEditingWidgets && !widgetPrefs.hidden.isEmpty {
                        Button {
                            showAddWidgetSheet = true
                        } label: {
                            Label("Widget Ekle", systemImage: "plus.circle.fill")
                                .font(.subheadline.bold())
                                .frame(maxWidth: .infinity)
                                .padding(14)
                                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                        }
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button(isEditingWidgets ? "Bitti" : "Düzenle") {
                        withAnimation { isEditingWidgets.toggle() }
                    }
                }
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
            .sheet(isPresented: $showCreateAppointment) {
                NavigationStack {
                    AppointmentCreateView(onCreated: { showCreateAppointment = false; Task { await load() } })
                }
            }
            .sheet(isPresented: $showQuickSale) {
                NavigationStack {
                    QuickSaleView()
                }
            }
            .sheet(isPresented: $showAddWidgetSheet) {
                NavigationStack {
                    List(widgetPrefs.hidden, id: \.self) { id in
                        Button {
                            withAnimation { widgetPrefs.add(id) }
                            if widgetPrefs.hidden.isEmpty { showAddWidgetSheet = false }
                        } label: {
                            HStack {
                                Text(id.title).foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "plus.circle.fill").foregroundStyle(.green)
                            }
                        }
                    }
                    .navigationTitle("Widget Ekle")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .topBarTrailing) {
                            Button("Kapat") { showAddWidgetSheet = false }
                        }
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    /// Düzenleme modundayken her widget'ın sol üst köşesine iOS'un kendi ana
    /// ekran simgesi kaldırma davranışıyla aynı kırmızı "−" rozetini ekler.
    @ViewBuilder
    private func editableWidget<Content: View>(_ id: HomeWidgetID, @ViewBuilder content: () -> Content) -> some View {
        ZStack(alignment: .topLeading) {
            content()
            if isEditingWidgets {
                Button {
                    withAnimation { widgetPrefs.remove(id) }
                } label: {
                    Image(systemName: "minus.circle.fill")
                        .symbolRenderingMode(.palette)
                        .foregroundStyle(.white, .red)
                        .font(.title2)
                        .background(Circle().fill(.white))
                }
                .offset(x: -8, y: -8)
            }
        }
    }

    @ViewBuilder
    private func widgetContent(for id: HomeWidgetID) -> some View {
        switch id {
        case .program:
            ProgramWidgetView()

        case .todayAppointments:
            HomeWidgetCard(title: "Bugünün Randevuları", systemImage: "calendar.badge.clock", tint: .blue) {
                router.selection = .appointments
            } content: {
                Text("\(todayAppts.count)").font(.system(size: 34, weight: .bold))
                HStack(spacing: 10) {
                    statPill("✔ \(todayAppts.filter { $0.status == "completed" }.count) tamamlandı")
                    statPill("➜ \(todayAppts.filter { $0.status == "routed" }.count) yolda")
                    statPill("⏳ \(todayAppts.filter { $0.status == "pending" }.count) bekliyor")
                }
                let urgent = todayAppts.filter { $0.urgency == "acil" && $0.status != "completed" && $0.status != "cancelled" }.count
                if urgent > 0 {
                    Text("\(urgent) acil").font(.caption.bold()).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(.red, in: Capsule())
                }
            }

        case .tomorrowAppointments:
            HomeWidgetCard(title: "Yarının Randevuları", systemImage: "calendar.badge.plus", tint: .green) {
                router.selection = .appointments
            } content: {
                Text("\(tomorrowAppts.count)").font(.system(size: 34, weight: .bold))
                let notRouted = tomorrowAppts.filter { $0.status == "pending" }.count
                if notRouted > 0 {
                    Text("\(notRouted) iş henüz rotalanmadı").font(.caption.bold()).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 3).background(.orange, in: Capsule())
                }
            }

        case .lowStock:
            HomeWidgetCard(title: "Az Stoklu Ürünler", systemImage: "shippingbox.fill", tint: .orange) {
                router.selection = .stock
            } content: {
                if lowStockItems.isEmpty {
                    Label("Az stoklu ürün yok.", systemImage: "checkmark.circle.fill").foregroundStyle(.green).font(.subheadline)
                } else {
                    ForEach(lowStockItems.prefix(5)) { item in
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red).font(.caption)
                            Text(item.name ?? item.code ?? "(isimsiz)").font(.subheadline)
                            Spacer()
                            Text("\(Int(item.quantity ?? 0)) \(item.unit ?? "adet")").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                    if lowStockItems.count > 5 {
                        Text("+\(lowStockItems.count - 5) ürün daha").font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

        case .quotes:
            HomeWidgetCard(title: "Fiyat Teklifleri", systemImage: "doc.text.fill", tint: .gray) {
                router.selection = .more
            } content: {
                if quotes.isEmpty {
                    Text("Henüz teklif oluşturulmadı.").font(.subheadline).foregroundStyle(.secondary)
                } else {
                    ForEach(quotes.prefix(5)) { q in
                        HStack {
                            VStack(alignment: .leading) {
                                Text(q.customerName ?? "(isimsiz)").font(.subheadline)
                                Text([q.quoteNo, q.quoteDate].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer()
                        }
                    }
                }
            }

        case .checkouts:
            HomeWidgetCard(title: "Mutabakatı Bekleyen Zimmetler", systemImage: "exclamationmark.triangle.fill", tint: .red) {
                router.selection = .more
            } content: {
                if overdueCheckouts.isEmpty {
                    Label("Bekleyen mutabakat yok.", systemImage: "checkmark.circle.fill").foregroundStyle(.green).font(.subheadline)
                } else {
                    ForEach(overdueCheckouts.prefix(5)) { c in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(technicians.first { $0.id == c.technicianId }?.name ?? "Bilinmeyen teknisyen").font(.subheadline)
                            Text("\(c.date ?? "") tarihli zimmet hâlâ mutabakatsız").font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private var overdueCheckouts: [PartCheckout] {
        let today = todayISODate()
        return checkouts.filter { $0.status == "outstanding" && ($0.date ?? "") < today }
    }

    @ViewBuilder
    private func statPill(_ text: String) -> some View {
        Text(text).font(.caption).foregroundStyle(.secondary)
    }

    private var pendingCollection: Double {
        todayAppts
            .filter { $0.status != "cancelled" && $0.feeAmount != nil && $0.feePaid != true }
            .reduce(0) { $0 + ($1.feeAmount ?? 0) }
    }

    private var weekCompletionRate: Int {
        let relevant = weekAppts.filter { $0.status != "cancelled" }
        guard !relevant.isEmpty else { return 0 }
        let completed = relevant.filter { $0.status == "completed" }.count
        return Int((Double(completed) / Double(relevant.count) * 100).rounded())
    }

    private var statsStrip: some View {
        HStack(spacing: 0) {
            statItem(value: pendingCollection.formatted(.currency(code: "TRY").precision(.fractionLength(0))), label: "Bekleyen Tahsilat", color: pendingCollection == 0 ? .green : .primary)
            Divider().frame(height: 30)
            statItem(value: "%\(weekCompletionRate)", label: "Bu Hafta Tamamlandı", color: .primary)
            Divider().frame(height: 30)
            statItem(value: "\(lowStockItems.count)", label: "Kritik Stok", color: lowStockItems.isEmpty ? .green : .red)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func statItem(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var quickActionsRow: some View {
        HStack(spacing: 12) {
            quickActionButton(title: "Randevu Oluştur", systemImage: "calendar.badge.plus", tint: .blue) {
                showCreateAppointment = true
            }
            quickActionButton(title: "Satış", systemImage: "turkishlirasign.circle.fill", tint: .green) {
                showQuickSale = true
            }
        }
    }

    private func quickActionButton(title: String, systemImage: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                Image(systemName: systemImage)
                    .font(.title2)
                    .foregroundStyle(tint)
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
        .buttonStyle(.plain)
    }

    private func load() async {
        let today = todayISODate()
        let tomorrow = isoDate(daysFromToday: 1)
        async let todayReq: [Appointment] = APIClient.shared.get("/appointments/by-date/\(today)")
        async let tomorrowReq: [Appointment] = APIClient.shared.get("/appointments/by-date/\(tomorrow)")
        async let weekReq: [[Appointment]] = withThrowingTaskGroup(of: (Int, [Appointment]).self) { group in
            for offset in 0...6 {
                group.addTask {
                    let date = isoDate(daysFromToday: -offset)
                    let appts: [Appointment] = (try? await APIClient.shared.get("/appointments/by-date/\(date)")) ?? []
                    return (offset, appts)
                }
            }
            var results = [Int: [Appointment]]()
            for try await (offset, appts) in group { results[offset] = appts }
            return (0...6).map { results[$0] ?? [] }
        }
        async let quotesReq: [Quote] = APIClient.shared.get("/quotes")
        async let checkoutsReq: [PartCheckout] = APIClient.shared.get("/part-checkouts")
        async let techsReq: [Technician] = APIClient.shared.get("/technicians")
        async let stockReq = StockCache.shared.all()

        todayAppts = (try? await todayReq) ?? []
        tomorrowAppts = (try? await tomorrowReq) ?? []
        weekAppts = ((try? await weekReq) ?? []).flatMap { $0 }
        quotes = ((try? await quotesReq) ?? []).sorted { ($0.quoteDate ?? "") > ($1.quoteDate ?? "") }
        checkouts = (try? await checkoutsReq) ?? []
        technicians = (try? await techsReq) ?? []
        let stock = (try? await stockReq) ?? []
        lowStockItems = stock.filter { item in
            let threshold = item.lowStockThreshold ?? 2
            return (item.quantity ?? 0) <= threshold
        }
    }
}

func isoDate(daysFromToday offset: Int) -> String {
    let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    return formatter.string(from: date)
}

func todayISODate() -> String {
    isoDate(daysFromToday: 0)
}

/// Anasayfa widget'larının kimliği — kullanıcı bir widget'ı kaldırınca hangi
/// widget'ların hâlâ eklenebilir olduğunu bilmek için CaseIterable.
enum HomeWidgetID: String, CaseIterable, Codable, Hashable {
    case program, todayAppointments, tomorrowAppointments, lowStock, quotes, checkouts

    var title: String {
        switch self {
        case .program: return "Haftalık Program"
        case .todayAppointments: return "Bugünün Randevuları"
        case .tomorrowAppointments: return "Yarının Randevuları"
        case .lowStock: return "Az Stoklu Ürünler"
        case .quotes: return "Fiyat Teklifleri"
        case .checkouts: return "Mutabakatı Bekleyen Zimmetler"
        }
    }
}

/// Hangi widget'ların görünür olduğunu ve sırasını cihazda saklar — sunucuda
/// bir karşılığı yok, tamamen bu telefona özel bir tercih (bkz. AppLockState
/// ile aynı desen).
@Observable
final class HomeWidgetPreferences {
    private(set) var visible: [HomeWidgetID]
    private static let key = "sita-yapi-home-widgets-v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.key),
           let saved = try? JSONDecoder().decode([HomeWidgetID].self, from: data) {
            visible = saved
        } else {
            visible = HomeWidgetID.allCases
        }
    }

    var hidden: [HomeWidgetID] {
        HomeWidgetID.allCases.filter { !visible.contains($0) }
    }

    func remove(_ id: HomeWidgetID) {
        visible.removeAll { $0 == id }
        persist()
    }

    func add(_ id: HomeWidgetID) {
        guard !visible.contains(id) else { return }
        visible.append(id)
        persist()
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(visible) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }
}

private struct HomeWidgetCard<Content: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    let onTap: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onTap) {
                Label(title, systemImage: systemImage)
                    .font(.subheadline.bold())
                    .foregroundStyle(tint)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
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
