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

    private let baseURL = URL(string: "http://192.168.1.132:4173/api")!
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

    @discardableResult
    func delete(_ path: String) async throws -> Data {
        var request = URLRequest(url: baseURL.appendingPathComponent(path.hasPrefix("/") ? String(path.dropFirst()) : path))
        request.httpMethod = "DELETE"
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
