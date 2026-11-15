import Foundation

// Uygulamanın her yerinde tarih GG/AA/YYYY (ör. 09/11/2026) gösterilir.
// Android'deki data/DateFormat.kt ile aynı kurallar.

private let trDateOut: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateFormat = "dd/MM/yyyy"
    return f
}()

private let trDateTimeOut: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateFormat = "dd/MM/yyyy HH:mm"
    return f
}()

private let isoDayParser: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

/// Date → "dd/MM/yyyy"
func trDate(_ date: Date) -> String { trDateOut.string(from: date) }

/// Sunucudan gelen "2026-11-09" ya da "2026-11-09T10:15:00Z" → "09/11/2026".
/// Tanınmayan metin olduğu gibi, boşsa `empty` döner.
func trDate(_ raw: String?, empty: String = "—") -> String {
    guard let s = raw?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return empty }
    guard let d = isoDayParser.date(from: String(s.prefix(10))) else { return s }
    return trDateOut.string(from: d)
}

/// ISO zaman damgası → yerel saatle "dd/MM/yyyy HH:mm".
func trDateTime(_ raw: String?, empty: String = "—") -> String {
    guard let s = raw?.trimmingCharacters(in: .whitespaces), !s.isEmpty else { return empty }
    let iso = ISO8601DateFormatter()
    iso.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    if let d = iso.date(from: s) ?? ISO8601DateFormatter().date(from: s) { return trDateTimeOut.string(from: d) }
    let local = DateFormatter()
    local.locale = Locale(identifier: "en_US_POSIX")
    local.dateFormat = "yyyy-MM-dd'T'HH:mm"
    if let d = local.date(from: String(s.prefix(16)).replacingOccurrences(of: " ", with: "T")) { return trDateTimeOut.string(from: d) }
    return s
}
