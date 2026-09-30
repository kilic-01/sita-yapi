import SwiftUI
import LocalAuthentication

/// Uygulama arka plana her gittiğinde kilitlenip Face ID/Touch ID ile tekrar
/// açılmasını sağlayan basit bir kilit — sunucu tarafında bir karşılığı yok,
/// tamamen cihazda tutulan bir tercih (bkz. MoreView'daki aç/kapa anahtarı).
@Observable
final class AppLockState {
    var isUnlocked = false

    var isEnabled: Bool {
        didSet { UserDefaults.standard.set(isEnabled, forKey: Self.key) }
    }

    private static let key = "sita-yapi-faceid-enabled"

    init() {
        isEnabled = UserDefaults.standard.bool(forKey: Self.key)
        isUnlocked = !isEnabled
    }

    func lock() {
        if isEnabled { isUnlocked = false }
    }

    @MainActor
    func authenticate() async {
        guard isEnabled else { isUnlocked = true; return }
        let context = LAContext()
        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &error) else {
            // Biyometri bu cihazda kurulmamış/kullanılamıyor (ör. simülatörde
            // Face ID etkinleştirilmemiş) — bu durumda kilitte kullanıcıyı
            // sonsuza dek dışarıda bırakmak yerine erişime izin veriyoruz.
            isUnlocked = true
            return
        }
        do {
            let success = try await context.evaluatePolicy(
                .deviceOwnerAuthenticationWithBiometrics,
                localizedReason: "Sita Yapı'ya erişmek için kimliğinizi doğrulayın"
            )
            isUnlocked = success
        } catch {
            isUnlocked = false
        }
    }
}

struct LockScreenView: View {
    let onUnlockTapped: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "faceid")
                .font(.system(size: 64))
                .foregroundStyle(.secondary)
            Text("Sita Yapı Kilitli")
                .font(.title2.bold())
            Button {
                onUnlockTapped()
            } label: {
                Text("Kilidi Aç").frame(maxWidth: 220)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }
}
