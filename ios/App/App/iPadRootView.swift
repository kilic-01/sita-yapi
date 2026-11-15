import SwiftUI

/// Masaüstündeki Sidebar.jsx'e benzer, kalıcı bir sol menü — iPhone'daki
/// TabView + "Daha Fazla" (bkz. RootTabView.swift/MoreView.swift) ile AYNI
/// ekranları gösterir, hiçbir yeni ekran/veri çağrısı icat edilmedi, sadece
/// kapsayıcı değişti. Home/Appointments/Stock/Messages kendi NavigationStack'ini
/// zaten taşıyor (iPhone'daki TabView'da da öyle) — o yüzden burada SARILMAZ;
/// "Daha Fazla"dan taşınan diğerleri (zimmet, teklif, bekleyen parça, gelen
/// sipariş, ücret takip, depolar, aktivite, ayarlar) kendi NavigationStack'ini
/// taşımıyordu (MoreView'ın paylaşılan stack'ine güveniyorlardı) — burada her
/// biri kendi NavigationStack'iyle sarılıyor.
enum SidebarItem: String, Hashable, CaseIterable, Identifiable {
    case home, appointments, stock, messages
    case zimmet, pendingParts, quotes, feeTracking, incomingOrders
    case depots, activityLog
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: return "Ana Sayfa"
        case .appointments: return "Randevular"
        case .stock: return "Stok"
        case .messages: return "Mesajlar"
        case .zimmet: return "Zimmet"
        case .pendingParts: return "Bekleyen Parçalar"
        case .quotes: return "Teklifler"
        case .feeTracking: return "Ücret Takip"
        case .incomingOrders: return "Gelen Siparişler"
        case .depots: return "Depolar"
        case .activityLog: return "Aktivite"
        case .settings: return "Ayarlar"
        }
    }

    var systemImage: String {
        switch self {
        case .home: return "house.fill"
        case .appointments: return "calendar"
        case .stock: return "shippingbox.fill"
        case .messages: return "bubble.left.and.bubble.right.fill"
        case .zimmet: return "shippingbox.fill"
        case .pendingParts: return "clock.fill"
        case .quotes: return "doc.text.fill"
        case .feeTracking: return "turkishlirasign.circle.fill"
        case .incomingOrders: return "tray.and.arrow.down.fill"
        case .depots: return "archivebox.fill"
        case .activityLog: return "chart.bar.fill"
        case .settings: return "gearshape.fill"
        }
    }
}

struct iPadRootView: View {
    @Environment(AppState.self) private var appState
    @State private var selection: SidebarItem? = .home
    // HomeView/ProgramWidgetView "Bugünün Randevuları" gibi bir widget'a
    // dokununca @Environment(TabRouter.self) üzerinden sekme değiştiriyor —
    // bu nesne sadece RootTabView (iPhone) içinde enjekte ediliyordu, burada
    // yoktu ve HomeView açılır açılmaz "No Observable object of type
    // TabRouter found" fatal hatasıyla çöküyordu.
    @State private var router = TabRouter()

    var body: some View {
        splitView
            .overlay(alignment: .bottom) { TvBroadcastBar().frame(maxWidth: 560).padding(.bottom, 16) }
    }

    private var splitView: some View {
        NavigationSplitView {
            List(selection: $selection) {
                Section("Genel") {
                    row(.home)
                    row(.appointments)
                    row(.stock)
                    row(.messages)
                }
                Section("Operasyon") {
                    row(.zimmet)
                    row(.pendingParts)
                    row(.quotes)
                    row(.feeTracking)
                    row(.incomingOrders)
                }
                Section("Diğer") {
                    row(.depots)
                    row(.activityLog)
                    row(.settings)
                }
            }
            .navigationTitle("Sita Yapı")
        } detail: {
            detail(for: selection ?? .home)
        }
        .environment(router)
        .onChange(of: router.selection) { _, newValue in
            // AppTab.more'un iPad'de karşılığı yok — sidebar'da zaten her şey
            // aynı anda görünür durumda, o yüzden sadece doğrudan karşılığı
            // olan sekmeler (ana sayfa/randevular/stok/mesajlar) seçimi
            // değiştirir.
            switch newValue {
            case .home: selection = .home
            case .appointments: selection = .appointments
            case .stock: selection = .stock
            case .messages: selection = .messages
            case .more: break
            }
        }
    }

    @ViewBuilder
    private func row(_ item: SidebarItem) -> some View {
        if item == .messages {
            Label(item.title, systemImage: item.systemImage)
                .badge(appState.unreadMessageCount)
                .tag(item)
        } else {
            Label(item.title, systemImage: item.systemImage)
                .tag(item)
        }
    }

    @ViewBuilder
    private func detail(for item: SidebarItem) -> some View {
        switch item {
        case .home: HomeView()
        case .appointments: AppointmentsView()
        case .stock: StockView()
        case .messages: MessagesView()
        case .zimmet:
            NavigationStack { ZimmetListView() }
        case .pendingParts:
            NavigationStack { PendingPartsView() }
        case .quotes:
            NavigationStack { QuoteListView() }
        case .feeTracking:
            NavigationStack { FeeTrackingView() }
        case .incomingOrders:
            NavigationStack { IncomingOrdersView() }
        case .depots:
            NavigationStack {
                GenericListView(title: "Depolar", fetch: { try await APIClient.shared.get("/depots") as [Depot] }) { (d: Depot) in
                    (d.name ?? "(isimsiz)", "", nil)
                }
            }
        case .activityLog:
            NavigationStack {
                let userId = appState.currentUser?.id ?? ""
                GenericListView(title: "Aktivite", fetch: { try await APIClient.shared.get("/activity-log?actingUserId=\(userId)") as [ActivityLogEntry] }) { (a: ActivityLogEntry) in
                    (a.description ?? "İşlem", a.createdAt ?? "", nil)
                }
            }
        case .settings:
            NavigationStack { iPadSettingsView() }
        }
    }
}

/// MoreView.swift'teki "Güvenlik" (Face ID) bölümü + profile erişim — iPad'de
/// ayrı bir "Daha Fazla" ekranı olmadığı için bu ikisi kendi sidebar
/// satırına taşındı.
private struct iPadSettingsView: View {
    @Environment(AppLockState.self) private var appLock
    @State private var showProfile = false

    var body: some View {
        List {
            Section("Güvenlik") {
                Toggle(
                    "Face ID ile Kilitle",
                    isOn: Binding(get: { appLock.isEnabled }, set: { appLock.isEnabled = $0 })
                )
            }
            Section("Hesap") {
                Button("Profilim") { showProfile = true }
            }
        }
        .navigationTitle("Ayarlar")
        .sheet(isPresented: $showProfile) {
            NavigationStack { ProfileView() }
        }
    }
}
