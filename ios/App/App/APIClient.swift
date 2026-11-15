import Foundation
import Security

/// server/index.js'in sunduğu aynı REST uçlarını kullanıyoruz — backend'de
/// hiçbir değişiklik gerekmedi, web sürümü (server/public-barkod) ile aynı
/// sözleşme. TODO: LAN IP'si yerine gerçek/hostlanmış bir backend adresi
/// gerekecek — bkz. capacitor.config.ts'teki aynı geçici adres notu.
enum APIError: LocalizedError {
    case server(String)
    case decoding(Error)

    var errorDescription: String? {
        switch self {
        case .server(let message): return message
        case .decoding: return "Sunucu yanıtı okunamadı."
        }
    }
}

actor APIClient {
    static let shared = APIClient()

    // Mac'in LAN IP'si Wi-Fi değiştikçe (ör. hotspot'a geçince) sık sık
    // kayıyor ve simülatör/telefon backend'e hiç ulaşamaz hale geliyordu —
    // arama/düzenleme/giriş gibi HER özellik aynı anda "bozuk" görünüyordu.
    // Simülatör aslında Mac'in kendi ağ yığınını paylaşıyor, yani bir
    // loopback adresi Wi-Fi ağı ne olursa olsun HER ZAMAN çalışır — bu, en
    // sık test edilen ortam için sorunu kalıcı olarak ortadan kaldırıyor.
    // "localhost" DEĞİL, doğrudan "127.0.0.1" kullanılıyor: "localhost" hem
    // ::1 (IPv6) hem 127.0.0.1'e (IPv4) çözümleniyor, ama sunucu sadece
    // IPv4'te dinliyor (app.listen(PORT, "0.0.0.0")) — istekler önce IPv6'yı
    // deneyip "Connection refused" alıyor, IPv4'e düşene kadar gecikiyordu
    // (bazen arama/giriş gibi hızlı ardışık isteklerde tamamen başarısız
    // gibi görünüyordu). Gerçek cihaz için hâlâ güncel LAN IP'si gerekiyor
    // (bunu değiştirmenin bir yolu yok, telefon fiziksel olarak ayrı bir ağ
    // arayüzü).
    #if targetEnvironment(simulator)
    nonisolated static let defaultServerAddress = "127.0.0.1:4173"
    #else
    nonisolated static let defaultServerAddress = "192.168.1.120:4173"
    #endif

    /// Gerçek cihazda Mac'in LAN IP'si Wi-Fi değiştikçe kayıyor — sabit
    /// yazılı adres her seferinde yeniden derleme gerektiriyordu. Artık giriş
    /// ekranından değiştirilebilen kalıcı bir tercih (boşsa varsayılan).
    nonisolated static let serverAddressKey = "sita-yapi-server-address"

    nonisolated static var serverAddress: String {
        get {
            let stored = UserDefaults.standard.string(forKey: serverAddressKey)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return stored.isEmpty ? defaultServerAddress : stored
        }
        set { UserDefaults.standard.set(newValue.trimmingCharacters(in: .whitespacesAndNewlines), forKey: serverAddressKey) }
    }

    /// "192.168.1.5", "192.168.1.5:4173", "http://host:4173/api" → "http://host:port/api"
    /// "https://sita-yapi-api.onrender.com" → "https://sita-yapi-api.onrender.com/api"
    nonisolated static func baseURL(for address: String) -> URL? {
        var a = address.trimmingCharacters(in: .whitespacesAndNewlines)
        while a.hasSuffix("/") { a.removeLast() }
        if !a.hasPrefix("http://") && !a.hasPrefix("https://") { a = "http://" + a }
        if a.hasSuffix("/api") { a.removeLast(4) }
        let hostPart = a.components(separatedBy: "://").last ?? a
        // Port yalnız şifresiz yerel sunucu (ofis Mac'i, 4173) için eklenir. HTTPS
        // adresinde (canlı sunucu) standart 443 kullanılır — eskiden ":4173"
        // ekleniyor, canlı sunucuya bağlantı zaman aşımına düşüyordu.
        if a.hasPrefix("http://") && !hostPart.contains(":") { a += ":4173" }
        return URL(string: a + "/api")
    }

    private var baseURL: URL {
        Self.baseURL(for: Self.serverAddress) ?? Self.baseURL(for: Self.defaultServerAddress)!
    }
    private let decoder: JSONDecoder = JSONDecoder()
    private let encoder: JSONEncoder = JSONEncoder()

    func get<T: Decodable>(_ path: String) async throws -> T {
        try await send(path: path, method: "GET", body: Optional<Int>.none)
    }

    func post<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        try await send(path: path, method: "POST", body: body)
    }

    func put<T: Decodable>(_ path: String, body: Encodable) async throws -> T {
        try await send(path: path, method: "PUT", body: body)
    }

    /// Barkod okuma araçları için — ~10 binlik stok listesinin tamamını
    /// çekmeden tek kalemi bulur (bkz. electron/db.js getStockItemByBarcode).
    func stockItem(byBarcode barcode: String) async throws -> StockItem? {
        // .urlPathAllowed "/" karakterini KODLAMIYOR — "/" içeren barkod
        // fazladan bir yol parçası gibi yanlış uca gidiyordu.
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove("/")
        let encoded = barcode.addingPercentEncoding(withAllowedCharacters: allowed) ?? barcode
        return try await get("/stock/by-barcode/\(encoded)")
    }

    /// Giriş: başarılıysa kullanıcıyı döndürür ve sunucunun verdiği oturum
    /// anahtarını Keychain'e yazar; ad/şifre hatalıysa nil.
    func login(name: String, password: String) async throws -> AppUser? {
        struct LoginBody: Encodable { let name: String; let password: String }
        struct TokenOnly: Decodable { let token: String? }
        let data = try await sendRaw(path: "/login", method: "POST", body: LoginBody(name: name, password: password))
        // Hatalı ad/şifrede sunucu "null" döner.
        // (try? iç içe opsiyonu tek seviyeye indirir: "null" ya da çözülemeyen → nil.)
        guard let user = try? decoder.decode(AppUser?.self, from: data) else { return nil }
        guard let token = (try? decoder.decode(TokenOnly.self, from: data))?.token, !token.isEmpty else {
            throw APIError.server("Sunucu oturum anahtarı vermedi. Sunucu güncel mi?")
        }
        AuthToken.save(token)
        return user
    }

    /// `body` opsiyonel — bazı silme uçları (ör. /stock/:id) aktiviteyi kimin
    /// yaptığını (ve stok silmede yönetici doğrulamasını) actingUserId'den
    /// çıkarıyor; DELETE gövdesiz gönderilirse bu uçlarda kimlik kaybolurdu.
    @discardableResult
    func delete(_ path: String, body: Encodable? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path))
        request.httpMethod = "DELETE"
        Self.authorize(&request)
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.checkStatus(response, data: data)
        return data
    }

    private func send<T: Decodable>(path: String, method: String, body: Encodable?) async throws -> T {
        let data = try await sendRaw(path: path, method: method, body: body)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    /// Her isteğe oturum anahtarını ekler (giriş isteğinde anahtar yoktur).
    private static func authorize(_ request: inout URLRequest) {
        if let token = AuthToken.value {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
    }

    private func sendRaw(path: String, method: String, body: Encodable?) async throws -> Data {
        var url = baseURL
        // path kendi query string'ini taşıyabilir (ör. "/activity-log?actingUserId=...").
        // percentEncodedPath kullanılıyor: comps.path çağıranın kodladığı
        // karakterleri (ör. barkoddaki %2F) geri çözüp yolu bozuyordu.
        if let comps = URLComponents(string: path),
           var full = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) {
            let suffix = comps.percentEncodedPath.hasPrefix("/") ? comps.percentEncodedPath : "/" + comps.percentEncodedPath
            full.percentEncodedPath += suffix
            full.percentEncodedQuery = comps.percentEncodedQuery
            if let built = full.url { url = built }
        } else {
            url = baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        Self.authorize(&request)
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.checkStatus(response, data: data)
        return data
    }

    private static func checkStatus(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200...299).contains(http.statusCode) else { return }
        // Oturum anahtarı geçersiz/süresi dolmuş: anahtarı sil, uygulama giriş ekranına döner.
        if http.statusCode == 401 {
            AuthToken.clear()
            NotificationCenter.default.post(name: .sitaSessionExpired, object: nil)
        }
        if let body = try? JSONDecoder().decode(APIErrorBody.self, from: data), let message = body.message {
            throw APIError.server(message)
        }
        throw APIError.server("Sunucu hatası (\(http.statusCode))")
    }
}

/// `Encodable` var olan değerleri (protokol tipi) JSONEncoder'a tip
/// güvenli şekilde geçirebilmek için ince bir sarmalayıcı.
private struct AnyEncodable: Encodable {
    private let value: Encodable
    init(_ value: Encodable) { self.value = value }
    func encode(to encoder: Encoder) throws { try value.encode(to: encoder) }
}

extension Error {
    /// Ağ hatalarını (bağlantı yok, zaman aşımı) kullanıcıya gösterilecek
    /// Türkçe bir mesaja çevirir — `URLError.localizedDescription` cihaz
    /// diline göre İngilizce de dönebiliyordu. `APIError.server` mesajı
    /// backend'den geldiği için zaten Türkçe, o durumda olduğu gibi kullanılır.
    var turkishMessage: String {
        if let urlError = self as? URLError {
            switch urlError.code {
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed:
                return "İnternet bağlantınızı kontrol edin."
            case .timedOut:
                return "Sunucuya bağlanırken zaman aşımı oluştu. Lütfen tekrar deneyin."
            case .cannotFindHost, .cannotConnectToHost:
                return "Sunucuya ulaşılamıyor. Lütfen tekrar deneyin."
            default:
                return "Bağlantı hatası oluştu. Lütfen tekrar deneyin."
            }
        }
        return (self as? LocalizedError)?.errorDescription ?? "Bir hata oluştu, lütfen tekrar deneyin."
    }
}


extension Notification.Name {
    /// Sunucu 401 döndü: oturum bitti (AppState dinler ve çıkış yapar).
    static let sitaSessionExpired = Notification.Name("sitaSessionExpired")
}

/// Sunucunun girişte verdiği oturum anahtarı — Keychain'de, yalnız bu cihazda
/// (iCloud yedeğine/başka cihaza geçmez) ve cihazın ilk kilidi açıldıktan sonra
/// okunabilir. Kullanıcı bilgisinin durduğu UserDefaults'a YAZILMAZ.
enum AuthToken {
    private static let service = "com.vitra.sitaservisplanlayici.api"
    private static let account = "session"
    private static var cached: String?
    private static let lock = NSLock()

    static var value: String? {
        lock.lock(); defer { lock.unlock() }
        if let cached { return cached }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var out: AnyObject?
        guard SecItemCopyMatching(query as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data, let token = String(data: data, encoding: .utf8) else { return nil }
        cached = token
        return token
    }

    static func save(_ token: String) {
        lock.lock(); defer { lock.unlock() }
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        var add = base
        add[kSecValueData as String] = Data(token.utf8)
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(add as CFDictionary, nil)
        cached = token
    }

    static func clear() {
        lock.lock(); defer { lock.unlock() }
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
        SecItemDelete(base as CFDictionary)
        cached = nil
    }
}
