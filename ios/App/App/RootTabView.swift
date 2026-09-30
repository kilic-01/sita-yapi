import SwiftUI

enum AppTab: Hashable {
    case home, appointments, stock, messages, more
}

/// Anasayfadaki widget'lardan birine dokununca (ör. "Bugünün Randevuları")
/// desktop'taki onNavigate("appointments") ile aynı işi yapabilmek için
/// seçili sekmeyi dışarıdan değiştirebiliyoruz.
@Observable
final class TabRouter {
    var selection: AppTab = .home
}

/// iOS 26 SDK'sıyla derlenen standart bir TabView otomatik olarak Liquid
/// Glass malzemesini alır — web sürümündeki gibi elle backdrop-filter/blur
/// simüle etmemize gerek yok, bu gerçek native malzeme.
struct RootTabView: View {
    @State private var router = TabRouter()

    var body: some View {
        TabView(selection: Binding(get: { router.selection }, set: { router.selection = $0 })) {
            Tab("Ana Sayfa", systemImage: "house.fill", value: AppTab.home) {
                HomeView()
            }
            Tab("Randevular", systemImage: "calendar", value: AppTab.appointments) {
                AppointmentsView()
            }
            Tab("Stok", systemImage: "shippingbox.fill", value: AppTab.stock) {
                StockView()
            }
            Tab("Mesajlar", systemImage: "bubble.left.and.bubble.right.fill", value: AppTab.messages) {
                MessagesView()
            }
            Tab("Daha Fazla", systemImage: "ellipsis", value: AppTab.more) {
                MoreView()
            }
        }
        .environment(router)
    }
}

struct RootView: View {
    @State private var appState = AppState()

    var body: some View {
        Group {
            if appState.currentUser != nil {
                RootTabView()
            } else {
                LoginView()
            }
        }
        .environment(appState)
        .tint(Color(red: 0 / 255, green: 122 / 255, blue: 255 / 255))
    }
}
