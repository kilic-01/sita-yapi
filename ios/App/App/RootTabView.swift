import SwiftUI
import UserNotifications

enum AppTab: Hashable {
    case home, appointments, stock, messages, more
}

/// Anasayfadaki widget'lardan birine dokununca (ör. "Bugünün Randevuları")
/// desktop'taki onNavigate("appointments") ile aynı işi yapabilmek için
/// seçili sekmeyi dışarıdan değiştirebiliyoruz.
@Observable
final class TabRouter {
    var selection: AppTab = .home
    // Ana sayfadaki hızlı işlemler: Stok'ta barkod okuyucuyu, Randevular'da
    // arama kutusunu açtırmak için (ilgili ekran okuyup sıfırlar).
    var pendingStockScan = false
    var pendingAppointmentSearch = false
}

/// iOS 26 SDK'sıyla derlenen standart bir TabView otomatik olarak Liquid
/// Glass malzemesini alır — web sürümündeki gibi elle backdrop-filter/blur
/// simüle etmemize gerek yok, bu gerçek native malzeme.
struct RootTabView: View {
    @State private var router = TabRouter()
    @Environment(AppState.self) private var appState

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
            .badge(appState.unreadMessageCount)
            Tab("Daha Fazla", systemImage: "ellipsis", value: AppTab.more) {
                MoreView()
            }
        }
        .environment(router)
        // Kayarken küçülen sekme çubuğu (iOS 26); TV yayın şeridi sekme çubuğunun
        // aksesuarı olur — Apple Müzik'teki "çalıyor" çubuğu gibi, küçülünce ona katılır.
        .tabBarMinimizeBehavior(.onScrollDown)
        .modifier(TvAccessoryModifier())
        // Mesajlar sekmesindeki gerçek zamanlı bağlantı olmadığından (bkz.
        // MessagesView'daki aynı not), rozet sayısını da periyodik olarak
        // sessizce yeniliyoruz.
        .task {
            while !Task.isCancelled {
                await appState.refreshUnreadMessageCount()
                try? await Task.sleep(for: .seconds(8))
            }
        }
    }
}

struct RootView: View {
    @State private var appState = AppState()
    @State private var appLock = AppLockState()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if appState.currentUser == nil {
                LoginView()
            } else if appLock.isEnabled && !appLock.isUnlocked {
                LockScreenView(onUnlockTapped: { Task { await appLock.authenticate() } })
                    .task { await appLock.authenticate() }
            } else if UIDevice.current.userInterfaceIdiom == .pad {
                // iPad'in büyük ekranında alt sekme çubuğu + gömülü "Daha
                // Fazla" listesi masaüstü deneyiminden çok uzak kalıyordu —
                // bkz. iPadRootView.swift: aynı ekranlar, masaüstündeki
                // Sidebar.jsx'e benzer kalıcı bir sol menüyle.
                iPadRootView()
            } else {
                RootTabView()
            }
        }
        .environment(appState)
        .environment(appLock)
        .tint(Color(red: 0 / 255, green: 122 / 255, blue: 255 / 255))
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { appLock.lock() }
        }
        .task(id: appState.currentUser?.id) {
            guard appState.currentUser != nil else { return }
            // İzin verilirse didRegisterForRemoteNotificationsWithDeviceToken
            // (AppDelegate) tetiklenir, token'ı okuyup backend'e kaydeder —
            // reddedilirse sessizce hiçbir şey olmaz, uygulama etkilenmez.
            let granted = (try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])) ?? false
            if granted {
                await MainActor.run { UIApplication.shared.registerForRemoteNotifications() }
            }
        }
        .task(id: appState.currentUser?.id) {
            // Oturum UserDefaults'ta kalıcı — hesap sunucu tarafında silinirse
            // (ör. personel ayrılması) uygulama hâlâ "giriş yapılmış" gibi
            // davranıp her yazma işleminde (mesaj gönderme vb.) kullanıcıya
            // çiğ bir veritabanı hatası gösteriyordu. Girişte bir kere
            // doğrulayıp hesap artık yoksa sessizce çıkış yaptırıyoruz.
            guard let user = appState.currentUser else { return }
            if let users: [AppUser] = try? await APIClient.shared.get("/users"),
               !users.contains(where: { $0.id == user.id }) {
                appState.logout()
            }
        }
    }
}


/// Bu telefon ofisteki TV'de yayın yaparken altta görünen şerit — neyin yayında
/// olduğunu gösterir ve tek dokunuşla durdurur (masaüstündeki TvBroadcastBar.jsx
/// ile aynı). Başka bir cihaz yayın yapınca ya da yayın durdurulunca kaybolur.
struct TvBroadcastBar: View {
    @Environment(AppState.self) private var appState
    @State private var isStopping = false
    @State private var errorMessage: String?

    var body: some View {
        if let onAir = appState.tvOnAir {
            HStack(spacing: 10) {
                Image(systemName: "airplayvideo").foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 1) {
                    Text("TV'de yayında: \(onAir.title)").font(.subheadline.bold()).lineLimit(1)
                    if let error = errorMessage {
                        Text(error).font(.caption).foregroundStyle(.red).lineLimit(1)
                    } else if let subtitle = onAir.subtitle, !subtitle.isEmpty {
                        Text(subtitle).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                Button {
                    Task { await stop() }
                } label: {
                    Label(isStopping ? "Durduruluyor…" : "Durdur", systemImage: "stop.fill")
                        .font(.subheadline.bold())
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .buttonBorderShape(.capsule)
                .disabled(isStopping)
            }
            .padding(.leading, 14).padding(.trailing, 6).padding(.vertical, 6)
            .background(.regularMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(.tint.opacity(0.6)))
            .shadow(radius: 6, y: 2)
            .padding(.horizontal, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            // Yayın başka bir cihazdan devralındı ya da durduruldu mu? (6 sn'de bir)
            .task(id: onAir.sentAt) {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(6))
                    await appState.refreshTvOnAir()
                }
            }
        }
    }

    private func stop() async {
        isStopping = true
        errorMessage = nil
        defer { isStopping = false }
        do {
            try await appState.stopTv()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

/// TV yayın şeridini sekme çubuğunun aksesuarı yapar (iOS 26.1+: yayın yokken gizli).
/// iOS 26.0'da aksesuar gizlenemediği için şerit eski yerinde, sekme çubuğunun üstünde durur.
struct TvAccessoryModifier: ViewModifier {
    @Environment(AppState.self) private var appState

    func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content.tabViewBottomAccessory(isEnabled: appState.tvOnAir != nil) { TvAccessoryBar() }
        } else {
            content.overlay(alignment: .bottom) {
                TvBroadcastBar().padding(.bottom, 64)
                    .animation(.spring(duration: 0.3), value: appState.tvOnAir)
            }
        }
    }
}

/// Sekme çubuğu aksesuarı içindeki yayın satırı: açıkken başlık + alt satır,
/// sekme çubuğu küçülünce (inline) yalnız başlık; her zaman bir dokunuşla durdur.
struct TvAccessoryBar: View {
    @Environment(AppState.self) private var appState
    @Environment(\.tabViewBottomAccessoryPlacement) private var placement
    @State private var isStopping = false
    @State private var errorMessage: String?

    var body: some View {
        if let onAir = appState.tvOnAir {
            HStack(spacing: 10) {
                Image(systemName: "airplayvideo").foregroundStyle(.tint)
                VStack(alignment: .leading, spacing: 0) {
                    Text(onAir.title).font(.subheadline.bold()).lineLimit(1)
                    if placement != .inline {
                        Text(errorMessage ?? onAir.subtitle ?? "TV'de yayında")
                            .font(.caption)
                            .foregroundStyle(errorMessage == nil ? Color.secondary : Color.red)
                            .lineLimit(1)
                    }
                }
                Spacer(minLength: 4)
                Button {
                    Task {
                        isStopping = true
                        errorMessage = nil
                        do { try await appState.stopTv() } catch { errorMessage = error.turkishMessage }
                        isStopping = false
                    }
                } label: {
                    if isStopping { ProgressView() } else { Image(systemName: "stop.fill").foregroundStyle(.red) }
                }
                .disabled(isStopping)
                .accessibilityLabel("Yayını durdur")
            }
            .padding(.horizontal, 16)
            // Yayın başka bir cihazdan devralındı ya da durduruldu mu? (6 sn'de bir)
            .task(id: onAir.sentAt) {
                while !Task.isCancelled {
                    try? await Task.sleep(for: .seconds(6))
                    await appState.refreshTvOnAir()
                }
            }
        }
    }
}
