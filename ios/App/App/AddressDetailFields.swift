import SwiftUI

// Swift'in varsayılan String sıralaması (`<` / `.sorted()`) Unicode skaler
// değerine göre çalışıyor — Türkçe "İ" harfi bu sırada "Z"den sonra geldiği
// için "İSTANBUL" ve "İZMİR" listenin en altına düşüyordu. Türk alfabesi
// kurallarına göre sıralamak için `tr_TR` locale'iyle karşılaştırma şart.
// Ayrıca iş akışında en sık kullanılan İstanbul/Beşiktaş en üste sabitleniyor.
private let trLocale = Locale(identifier: "tr_TR")

private extension Sequence where Element == String {
    func sortedTurkish() -> [String] {
        sorted { $0.compare($1, options: [], range: nil, locale: trLocale) == .orderedAscending }
    }
}

private extension Array where Element == String {
    func withPinnedFirst(_ pinned: String) -> [String] {
        guard contains(pinned) else { return self }
        return [pinned] + filter { $0 != pinned }
    }
}

/// Masaüstündeki AddressDetailInput (AppointmentForm.jsx) ile aynı il -> ilçe
/// -> mahalle kademeli seçimi — bkz. TurkeyAddressData.swift'teki üst yorum:
/// backend geocoding'i bu alanlar olmadan hiç denemiyor.
struct AddressDetailFields: View {
    @Binding var detail: AddressDetail
    @State private var data: [String: [String: [String]]] = [:]

    private var iller: [String] {
        data.keys.sortedTurkish().withPinnedFirst("İSTANBUL")
    }

    private var ilceler: [String] {
        guard let il = detail.il else { return [] }
        return (data[il]?.keys).map { Array($0).sortedTurkish().withPinnedFirst("BEŞİKTAŞ") } ?? []
    }

    private var mahalleler: [String] {
        guard let il = detail.il, let ilce = detail.ilce else { return [] }
        return (data[il]?[ilce] ?? []).sortedTurkish()
    }

    var body: some View {
        Group {
            Picker("İl", selection: Binding(
                get: { detail.il },
                set: { detail.il = $0; detail.ilce = nil; detail.mahalle = nil }
            )) {
                Text("Seçiniz").tag(String?.none)
                ForEach(iller, id: \.self) { il in
                    Text(il).tag(Optional(il))
                }
            }
            Picker("İlçe", selection: Binding(
                get: { detail.ilce },
                set: { detail.ilce = $0; detail.mahalle = nil }
            )) {
                Text("Seçiniz").tag(String?.none)
                ForEach(ilceler, id: \.self) { ilce in
                    Text(ilce).tag(Optional(ilce))
                }
            }
            .disabled(detail.il == nil)
            Picker("Mahalle", selection: $detail.mahalle) {
                Text("Seçiniz").tag(String?.none)
                ForEach(mahalleler, id: \.self) { mahalle in
                    Text(mahalle).tag(Optional(mahalle))
                }
            }
            .disabled(detail.ilce == nil)
            TextField("Sokak / Cadde", text: Binding(
                get: { detail.street ?? "" },
                set: { detail.street = $0 }
            ))
            TextField("Bina Adı (opsiyonel)", text: Binding(
                get: { detail.buildingName ?? "" },
                set: { detail.buildingName = $0 }
            ))
            TextField("Daire No", text: Binding(
                get: { detail.apartmentNo ?? "" },
                set: { detail.apartmentNo = $0 }
            ))
        }
        .task {
            data = await TurkeyAddressData.shared.load()
        }
    }
}
