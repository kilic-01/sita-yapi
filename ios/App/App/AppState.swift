import Foundation
import Observation

@Observable
final class AppState {
    var currentUser: AppUser?
    var requestLogoutConfirmation: Bool = false

    private let storageKey = "sita-yapi-native-user"

    init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let user = try? JSONDecoder().decode(AppUser.self, from: data) {
            currentUser = user
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
        UserDefaults.standard.removeObject(forKey: storageKey)
    }
}
