import Foundation
import UIKit
import Observation

@Observable
final class AppState {
    var currentUser: AppUser?
    // Mesajlar sekmesinin rozetinde gösterilen toplam okunmamış mesaj sayısı —
    // RootTabView periyodik olarak yeniliyor (bkz. refreshUnreadMessageCount).
    var unreadMessageCount: Int = 0
    // Bu telefonun TV'deki yayını — alttaki "TV'de yayında … [Durdur]" şeridi
    // (masaüstündeki TvBroadcastBar ile aynı). Yayın durdurulunca ya da başka
    // bir cihaz yayın yapınca refreshTvOnAir ile kaybolur.
    var tvOnAir: TvOnAir?
    /// Mesaj bildirimine basıldı: kök ekran Mesajlar'a geçer, MessagesView bu sohbeti açıp sıfırlar.
    var pendingChat: (id: String, name: String)? {
        didSet { if pendingChat != nil { openMessagesTick += 1 } }
    }
    /// Kök ekran (iPhone sekmeleri / iPad kenar menüsü) bunu izleyip Mesajlar'a geçer.
    /// pendingChat'i MessagesView hemen tüketip sıfırladığı için ayrı bir sayaç.
    var openMessagesTick = 0

    // Son bakılanlar (cihazda saklı, en yeni başta, en fazla 5): stok ve randevu
    // aramasında kutu boşken gösterilir — aynı ürünü/müşteriyi günde birkaç kez arayan için.
    private(set) var recentStock: [StockItem] = AppState.loadRecent("sita-recent-stock")
    private(set) var recentAppointments: [Appointment] = AppState.loadRecent("sita-recent-appointments")

    func addRecentStock(_ item: StockItem) {
        recentStock = Array(([item] + recentStock.filter { $0.id != item.id }).prefix(5))
        AppState.saveRecent(recentStock, "sita-recent-stock")
    }

    func addRecentAppointment(_ appt: Appointment) {
        recentAppointments = Array(([appt] + recentAppointments.filter { $0.id != appt.id }).prefix(5))
        AppState.saveRecent(recentAppointments, "sita-recent-appointments")
    }

    private static func loadRecent<T: Decodable>(_ key: String) -> [T] {
        guard let data = UserDefaults.standard.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([T].self, from: data)) ?? []
    }

    private static func saveRecent<T: Encodable>(_ list: [T], _ key: String) {
        if let data = try? JSONEncoder().encode(list) { UserDefaults.standard.set(data, forKey: key) }
    }

    private let storageKey = "sita-yapi-native-user"

    init() {
        // Oturum anahtarı olmayan eski girişler (anahtar sisteminden önceki sürüm)
        // geçersiz: kullanıcıdan bir kez yeniden giriş istenir.
        if AuthToken.value != nil,
           let data = UserDefaults.standard.data(forKey: storageKey),
           let user = try? JSONDecoder().decode(AppUser.self, from: data) {
            currentUser = user
        } else {
            UserDefaults.standard.removeObject(forKey: storageKey)
        }
        // Sunucu 401 dönerse (anahtar geçersiz/süresi dolmuş, kullanıcı silinmiş) çıkış.
        NotificationCenter.default.addObserver(forName: .sitaSessionExpired, object: nil, queue: .main) { [weak self] _ in
            self?.logout()
        }
        // Bildirime basılarak açıldıysa (soğuk başlangıç) bekleyen sohbeti al; açıkken gelirse duyurudan.
        pendingChat = PendingChat.value
        PendingChat.value = nil
        NotificationCenter.default.addObserver(forName: .sitaOpenChat, object: nil, queue: .main) { [weak self] _ in
            self?.pendingChat = PendingChat.value
            PendingChat.value = nil
        }
    }

    func login(_ user: AppUser) {
        currentUser = user
        if let data = try? JSONEncoder().encode(user) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }

    func logout() {
        currentUser = nil
        AuthToken.clear()
        UserDefaults.standard.removeObject(forKey: storageKey)
    }

    func refreshTvOnAir() async {
        guard let mine = tvOnAir else { return }
        struct Current: Decodable { let sentAt: String? }
        do {
            // Sunucu yayın yoksa "null" döner → nil.
            let current: Current? = try await APIClient.shared.get("/tv/current")
            if current?.sentAt != mine.sentAt { tvOnAir = nil }
        } catch {
            // Geçici ağ hatası şeridi kaldırmamalı.
        }
    }

    func stopTv() async throws {
        struct Empty: Encodable {}
        struct Ok: Decodable { let ok: Bool? }
        let _: Ok = try await APIClient.shared.post("/tv/clear", body: Empty())
        tvOnAir = nil
        Haptics.tap()
    }

    func refreshUnreadMessageCount() async {
        guard let myId = currentUser?.id else { unreadMessageCount = 0; return }
        guard let messages: [ChatMessage] = try? await APIClient.shared.get("/messages/\(myId)") else { return }
        unreadMessageCount = messages.filter { $0.recipientId == myId && $0.senderId != myId && $0.readAt == nil }.count
    }
}

struct TvOnAir: Equatable {
    let sentAt: String
    let title: String
    let subtitle: String?
}

/// Dokunsal geri bildirim: bir işlem gerçekleşince ekrana bakmadan anlaşılsın.
enum Haptics {
    static func success() { UINotificationFeedbackGenerator().notificationOccurred(.success) }
    static func warning() { UINotificationFeedbackGenerator().notificationOccurred(.warning) }
    static func tap() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
}
