import UIKit
import SwiftUI

// Bu proje Capacitor'ın WKWebView köprüsüyle başladı (Faz 0), ama artık tam
// native SwiftUI ekranlara geçtik (SF Symbols + gerçek Liquid Glass —
// web sürümü hâlâ server/public-barkod'da, ayrı bir araç olarak duruyor).
// Capacitor paketi/bağımlılığı projede kalmaya devam ediyor ama artık
// kullanılmıyor; kaldırmak project.pbxproj'u gereksiz yere riske atardı.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = UIHostingController(rootView: RootView())
        window?.makeKeyAndVisible()
    }
}
