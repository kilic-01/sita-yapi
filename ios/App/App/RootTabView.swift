import SwiftUI

/// iOS 26 SDK'sıyla derlenen standart bir TabView otomatik olarak Liquid
/// Glass malzemesini alır — web sürümündeki gibi elle backdrop-filter/blur
/// simüle etmemize gerek yok, bu gerçek native malzeme.
struct RootTabView: View {
    var body: some View {
        TabView {
            Tab("Ana Sayfa", systemImage: "house.fill") {
                HomeView()
            }
            Tab("Randevular", systemImage: "calendar") {
                AppointmentsView()
            }
            Tab("Stok", systemImage: "shippingbox.fill") {
                StockView()
            }
            Tab("Mesajlar", systemImage: "bubble.left.and.bubble.right.fill") {
                MessagesView()
            }
            Tab("Daha Fazla", systemImage: "ellipsis") {
                MoreView()
            }
        }
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
