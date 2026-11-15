import Foundation

/// Bundle'a eklenen il-ilce-mahalle.json'u (masaüstündeki public/data/
/// il-ilce-mahalle.json ile birebir aynı dosya, src/lib/turkeyAddressData.js'in
/// native karşılığı) bir kez okuyup bellekte tutar. Şekil:
/// { "İL": { "İLÇE": ["Mahalle 1", ...] } }.
///
/// BU DOSYA VAR OLMA SEBEBİ: electron/geocodeQuery.js'teki buildGeocodeAttempts
/// il/ilçe/mahalle olmadan ("adres bilgisi (mahalle/ilçe) eksik") geocoding'i
/// hiç DENEMİYOR bile — düz metin "Adres" alanı tek başına yeterli değil.
/// Masaüstü zaten bu seçimi kullanıyor; mobilde de aynısı olmazsa mobilden
/// oluşturulan randevular asla haritada konumlanamaz.
actor TurkeyAddressData {
    static let shared = TurkeyAddressData()

    private var cached: [String: [String: [String]]]?

    func load() -> [String: [String: [String]]] {
        if let cached { return cached }
        guard
            let url = Bundle.main.url(forResource: "il-ilce-mahalle", withExtension: "json"),
            let data = try? Data(contentsOf: url),
            let decoded = try? JSONDecoder().decode([String: [String: [String]]].self, from: data)
        else {
            cached = [:]
            return [:]
        }
        cached = decoded
        return decoded
    }
}

/// src/lib/turkeyAddressData.js'teki composeAddress ile birebir aynı mantık —
/// backend'e giden `address` düz metni her zaman bundan üretilir, elle
/// yazılmaz (aksi halde il/ilçe/mahalle ile tutarsız bir adres satırı oluşur).
func composeAddress(_ detail: AddressDetail) -> String {
    var parts: [String] = []
    if let street = detail.street, !street.isEmpty { parts.append(street) }
    if let buildingName = detail.buildingName, !buildingName.isEmpty { parts.append(buildingName) }
    if let apartmentNo = detail.apartmentNo, !apartmentNo.isEmpty { parts.append("Daire \(apartmentNo)") }
    if let mahalle = detail.mahalle, !mahalle.isEmpty { parts.append("\(mahalle) Mahallesi") }
    let cityLine = [detail.ilce, detail.il].compactMap { $0?.isEmpty == false ? $0 : nil }.joined(separator: "/")
    if !cityLine.isEmpty { parts.append(cityLine) }
    return parts.joined(separator: ", ")
}
