import Foundation

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
    private let baseURL = URL(string: "http://127.0.0.1:4173/api")!
    #else
    private let baseURL = URL(string: "http://192.168.1.28:4173/api")!
    #endif
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
        let encoded = barcode.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? barcode
        return try await get("/stock/by-barcode/\(encoded)")
    }

    /// `body` opsiyonel — bazı silme uçları (ör. /stock/:id) aktiviteyi kimin
    /// yaptığını (ve stok silmede yönetici doğrulamasını) actingUserId'den
    /// çıkarıyor; DELETE gövdesiz gönderilirse bu uçlarda kimlik kaybolurdu.
    @discardableResult
    func delete(_ path: String, body: Encodable? = nil) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path))
        request.httpMethod = "DELETE"
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.checkStatus(response, data: data)
        return data
    }

    private func send<T: Decodable>(path: String, method: String, body: Encodable?) async throws -> T {
        var url = baseURL
        // path kendi query string'ini taşıyabilir (ör. "/activity-log?actingUserId=...")
        if let comps = URLComponents(string: path) {
            url = baseURL.appendingPathComponent(comps.path.hasPrefix("/") ? String(comps.path.dropFirst()) : comps.path)
            if let query = comps.query {
                var full = URLComponents(url: url, resolvingAgainstBaseURL: false)!
                full.query = query
                url = full.url!
            }
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let body {
            request.httpBody = try encoder.encode(AnyEncodable(body))
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        try Self.checkStatus(response, data: data)
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decoding(error)
        }
    }

    private static func checkStatus(_ response: URLResponse, data: Data) throws {
        guard let http = response as? HTTPURLResponse else { return }
        guard !(200...299).contains(http.statusCode) else { return }
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
