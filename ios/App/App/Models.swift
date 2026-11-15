import Foundation

// Web sürümünde (server/public-barkod/index.html) doğrulanmış aynı REST
// sözleşmesiyle konuşuyoruz — alan adları backend'in (server/index.js,
// electron/handlers.js) döndürdüğü camelCase JSON ile birebir eşleşiyor.

struct AppUser: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    var role: String?
    var photo: String?
    var photoPosition: PhotoPosition?
}

/// Dairesel avatar kırpma/konumlama ofseti (0-100 yüzde) — masaüstündeki
/// MyProfileSection.jsx ile aynı sözleşme.
struct PhotoPosition: Codable, Equatable {
    var x: Double
    var y: Double
}

extension Appointment {
    /// Apple Haritalar'da yol tarifi — koordinat varsa doğrudan oraya, yoksa
    /// adres metniyle. İkisi de yoksa nil.
    var directionsURL: URL? {
        var comps = URLComponents(string: "http://maps.apple.com/")!
        if let lat, let lng {
            comps.queryItems = [URLQueryItem(name: "daddr", value: "\(lat),\(lng)")]
        } else if let address, !address.isEmpty {
            comps.queryItems = [URLQueryItem(name: "daddr", value: address)]
        } else {
            return nil
        }
        return comps.url
    }
}

extension String {
    /// Telefon numaraları backend'de serbest metin — boşluk/tire/parantez
    /// içerebilir (özellikle Excel'den içe aktarılan ~20 bin+ eski kayıtta).
    /// `URL(string: "tel:\(phone)")` böyle karakterlerde nil döner; bunu
    /// zorla açmak (`!`) uygulamayı çökertirdi — önce sadece rakam/+ bırakıp
    /// öyle deniyoruz.
    var telURL: URL? {
        let cleaned = filter { $0.isNumber || $0 == "+" }
        guard !cleaned.isEmpty else { return nil }
        return URL(string: "tel:\(cleaned)")
    }
}

struct TechnicianLeave: Codable {
    var startDate: String?
    var endDate: String?
}

struct Technician: Codable, Identifiable {
    let id: String
    let name: String
    var phone: String?
    var assignable: Bool?
    var leaves: [TechnicianLeave]?
}

/// Desktop'taki isOnLeave (src/lib/format.js) ile aynı mantık: verilen
/// tarih, teknisyenin izin aralıklarından birinin içine düşüyor mu.
func isOnLeave(_ technician: Technician, dateISO: String) -> Bool {
    guard let leaves = technician.leaves, !leaves.isEmpty else { return false }
    return leaves.contains { leave in
        guard let start = leave.startDate, let end = leave.endDate else { return false }
        return dateISO >= start && dateISO <= end
    }
}

struct OfficeStaffMember: Codable, Identifiable {
    let id: String
    let name: String
    var phone: String?
}

struct Appointment: Codable, Identifiable {
    let id: String
    var customerName: String?
    var address: String?
    var addressDetail: AddressDetail?
    var customerPhone: String?
    var status: String?
    var complaint: String?
    var stopOrder: Int?
    var scheduledDate: String?
    var urgency: String?
    var feeAmount: Double?
    var feePaid: Bool?
    var heldForLeave: Bool?
    var assignedTechnicianId: String?
    var lat: Double?
    var lng: Double?
    /// null değilse konum belirsiz/şüpheli demektir (bkz. electron/handlers.js
    /// checkGeocodeQuality) — Türkçe bir uyarı metni içerir.
    var geocodeIssue: String?
}

/// POST /api/appointments ve PUT /api/appointments/:id, tekliflerin/diğer
/// endpoint'lerin aksine randevuyu DÜZ değil `{appointment, geocodeError,
/// geocodeWarning}` sarmalayıcısı içinde döner (bkz. electron/handlers.js
/// addAppointment/updateAppointment) — geocoding arkaplanda bitmeden hemen
/// dönüldüğü için bu iki alan şu an her zaman null, ama sarmalayıcı hep var.
struct AppointmentSaveResponse: Decodable {
    let appointment: Appointment
    let geocodeError: String?
    let geocodeWarning: String?
}

// src/lib/turkeyAddressData.js + AppointmentForm.jsx'teki form.addressDetail
// ile birebir aynı alanlar — electron/geocodeQuery.js'teki buildGeocodeAttempts
// SADECE bunlardan geocoding sorgusu üretiyor (apartmentNo hariç, bkz. o
// dosyadaki yorum). Bu olmadan backend geocoding'i hiç denemiyor.
struct AddressDetail: Codable, Equatable {
    var il: String?
    var ilce: String?
    var mahalle: String?
    var street: String?
    var buildingName: String?
    var apartmentNo: String?

    var isEmpty: Bool {
        [il, ilce, mahalle, street, buildingName, apartmentNo].allSatisfy { ($0 ?? "").isEmpty }
    }
}

/// Yeni randevu oluşturma isteği gövdesi — POST /api/appointments.
/// customerName + address + scheduledDate dışındaki her şey backend'de
/// zaten opsiyonel (bkz. electron/db.js addAppointment).
struct NewAppointment: Encodable {
    var customerName: String
    var address: String
    var addressDetail: AddressDetail?
    var scheduledDate: String
    var customerPhone: String
    var complaint: String
    var urgency: String
    var assignedTechnicianId: String?
    var actingUserId: String
    // Masaüstündeki formla aynı: firma adına yerinde görüşülecek kişi ve yalnız bize görünen not.
    var contactName: String = ""
    var internalNote: String = ""
}

struct ShopLocation: Codable {
    var lat: Double
    var lng: Double
}

struct StockItem: Codable, Identifiable {
    let id: String
    var code: String?
    var name: String?
    var quantity: Double?
    var unit: String?
    var price: Double?
    var lowStockThreshold: Double?
    var barcode: String?
    var depotId: String?
    var category: String?
    var imageUrl: String?
    // "Bu üründe en son kim ne zaman işlem yaptı" — electron/db.js'teki genel
    // stampCreatedPatch/stampUpdatedPatch deseni artık stockItems tablosuna da
    // bağlı. SQL migrasyonu çalıştırılana kadar sunucu bu alanları hiç
    // döndürmeyebilir, bu yüzden hepsi opsiyonel.
    var createdBy: String?
    var createdAt: String?
    var updatedBy: String?
    var updatedAt: String?
}

extension StockItem {
    /// Ürün kodu ile adını TEK satırda, AYNI puntoda göstermek için — kod
    /// dispatcher'lar için en az ad kadar önemli, artık küçük bir altyazı
    /// değil, isimle birlikte asıl başlık (ör. "A47222 — AquaSee Bataryası").
    var codeAndName: String {
        let trimmedCode = code?.trimmingCharacters(in: .whitespaces) ?? ""
        let trimmedName = name?.trimmingCharacters(in: .whitespaces) ?? ""
        if !trimmedCode.isEmpty && !trimmedName.isEmpty { return "\(trimmedCode) — \(trimmedName)" }
        if !trimmedCode.isEmpty { return trimmedCode }
        return trimmedName.isEmpty ? "(isimsiz)" : trimmedName
    }
}

/// GET /api/stock/:id/depots yanıtı — bir ürünün birden fazla depoda farklı
/// miktarlarda durabilmesinin gerçek kaynağı (bkz. electron/db.js
/// stockItemDepots). Önceden iOS'ta bu uç hiç çağrılmıyordu, sadece
/// StockItem.depotId (tekil, artık güncellenmeyen eski bir alan) okunuyordu.
struct StockItemDepot: Codable, Identifiable {
    let id: String
    var stockItemId: String?
    var depotId: String?
    var quantity: Double?
}

/// Yeni ürün eklerken birden fazla depoya dağıtmak için (bkz. electron/db.js
/// addStockItem'ın artık desteklediği "depots" dizisi).
struct StockDepotAllocation: Encodable {
    var depotId: String
    var quantity: Double
}

/// POST /api/stock gövdesi — yeni stok kalemi oluşturma (bkz. electron/db.js
/// addStockItem, hepsi opsiyonel dışında code).
struct NewStockItem: Encodable {
    var code: String
    var name: String
    var unit: String
    var depots: [StockDepotAllocation]
    var category: String
    var price: Double?
    var imageUrl: String
    var barcode: String
    var actingUserId: String
}

/// POST /api/stock/:id/transfer gövdesi — Depo Transferi (stok kaydırma).
struct StockTransferBody: Encodable {
    var fromDepotId: String
    var toDepotId: String
    var qty: Double
    var actingUserId: String
}

struct PartCheckout: Codable, Identifiable {
    let id: String
    var technicianId: String?
    var stockItemId: String?
    var date: String?
    var qtyTaken: Double?
    var status: String?
    // Yazdırma çıktısında (bkz. PartCheckoutsWebPrintView) masaüstündeki
    // reconcileSummary ile aynı "Kullanıldı/İade/Arabada" dökümünü
    // göstermek için — mutabakat yapılana kadar hepsi null kalır.
    var qtyUsed: Double?
    var qtyReturned: Double?
    var qtyStoredInVehicle: Double?
    var appointmentId: String?
}

struct ChatMessage: Codable, Identifiable {
    let id: String
    var senderId: String
    var recipientId: String
    var body: String
    var createdAt: String?
    var readAt: String?
}

struct QuoteItem: Codable, Identifiable {
    var id = UUID()
    var qty: Double?
    var code: String?
    var unit: String?
    var vatRate: Double?
    var unitPrice: Double?
    var description: String?
    var discountRate: Double?
    /// Yalnızca native tarafta (Hızlı Satış barkod/arama akışı) kullanılıyor
    /// — tekliflerin kablo formatına dahil değil, bu yüzden CodingKeys dışında.
    var stockItemId: String? = nil
    /// Bir ürün birden fazla depoda olabildiği için (bkz. electron/db.js
    /// stockItemDepots) hangi depodan düşüleceği — QuickSaleView bunu
    /// ürün seçilince çözümler (tek depoda stok varsa otomatik, birden
    /// fazlaysa kullanıcı seçer). Boş kalırsa backend deduction'ı atlar.
    var depotId: String? = nil

    enum CodingKeys: String, CodingKey {
        case qty, code, unit, vatRate, unitPrice, description, discountRate
    }
}

struct Quote: Codable, Identifiable {
    let id: String
    var quoteNo: String?
    var customerName: String?
    var contactName: String?
    var customerPhone: String?
    var customerEmail: String?
    var customerAddress: String?
    var quoteDate: String?
    var validityDays: Int?
    var preparedBy: String?
    var currency: String?
    var items: [QuoteItem]?
    var discountRate: Double?
    var paymentTerms: String?
    var warranty: String?
    var notes: String?
    var iban: String?
}

struct NewQuote: Encodable {
    var customerName: String
    var contactName: String
    var customerPhone: String
    var customerEmail: String
    var customerAddress: String
    var quoteDate: String
    var validityDays: Int
    var preparedBy: String
    var currency: String
    var items: [QuoteItem]
    var actingUserId: String
}

struct QuoteTotals {
    var araToplam: Double = 0
    var indirimTutari: Double = 0
    var kdvToplami: Double = 0
    var genelToplam: Double = 0
}

/// src/lib/orderTotals.js'teki computeTotals ile birebir aynı mantık.
func computeQuoteTotals(_ items: [QuoteItem]) -> QuoteTotals {
    func gross(_ item: QuoteItem) -> Double { (item.qty ?? 0) * (item.unitPrice ?? 0) }
    func lineNet(_ item: QuoteItem) -> Double { gross(item) * (1 - (item.discountRate ?? 0) / 100) }
    let grossToplam = items.reduce(0) { $0 + gross($1) }
    let araToplam = items.reduce(0) { $0 + lineNet($1) }
    let indirim = grossToplam - araToplam
    let kdv = items.reduce(0) { $0 + lineNet($1) * ((($1.vatRate ?? 0)) / 100) }
    let genel = araToplam + kdv
    return QuoteTotals(araToplam: araToplam, indirimTutari: indirim, kdvToplami: kdv, genelToplam: genel)
}

struct PendingPart: Codable, Identifiable {
    let id: String
    var customerName: String?
    var customerPhone: String?
    var description: String?
    var status: String?
    var orderedAt: String?
    var arrivedAt: String?
}

struct NewPendingPart: Encodable {
    var customerName: String
    var customerPhone: String
    var description: String
    var orderedAt: String
    var actingUserId: String
}

struct StatusUpdate: Encodable {
    var status: String
    var actingUserId: String
}

// Masaüstündeki Ücret Takip (electron/db.js addFeeEntry/updateFeeEntry) ile
// aynı sözleşme — "amount" girilen tutarın kendisi (KDV ile ilgili bir alan
// artık gösterilmiyor, bkz. FeeTrackingView.swift), vatRate her zaman 0
// gönderiliyor ki totalAmount == amount kalsın.
struct FeeEntry: Codable, Identifiable {
    let id: String
    var category: String
    var description: String?
    var amount: Double
    var totalAmount: Double
    var date: String
}

struct NewFeeEntry: Encodable {
    var category: String
    var amount: Double
    var vatRate: Double
    var description: String
    var date: String
    var actingUserId: String
}

struct FeeEntryPatch: Encodable {
    var category: String
    var amount: Double
    var vatRate: Double
    var description: String
    var date: String
    var actingUserId: String
}

struct IncomingOrder: Codable, Identifiable {
    let id: String
    var customerName: String?
    var orderNo: String?
    var status: String?
    var orderDate: String?
    var notes: String?
}

struct NewIncomingOrder: Encodable {
    var customerName: String
    var orderDate: String
    var notes: String
    var actingUserId: String
}

struct SaleItem: Codable {
    var stockItemId: String?
    var code: String
    var name: String
    var qty: Double
    var unitPrice: Double
    var discountRate: Double
    // Bir ürün birden fazla depoda olabildiği için backend (electron/db.js
    // addSale → deductStockItemDepotQuantity) bunu bilmeden stok düşemiyor —
    // eksikse sessizce atlar. QuickSaleView ürün seçilince bunu çözümler.
    var depotId: String?
}

struct NewSale: Encodable {
    var items: [SaleItem]
    var generalDiscountRate: Double
    var subtotal: Double
    var vatTotal: Double
    var total: Double
    var deductedFromStock: Bool
    var actingUserId: String
}

struct ReconcileCheckout: Encodable {
    var qtyUsed: Double
    var qtyReturned: Double
    var qtyStoredInVehicle: Double
    var actingUserId: String
}

struct Depot: Codable, Identifiable {
    let id: String
    var name: String?
}

struct ActivityLogEntry: Codable, Identifiable {
    let id: String
    var description: String?
    var entityType: String?
    var createdAt: String?
}

/// Sunucudan gelen düz hata gövdesi: { "message": "..." }
struct APIErrorBody: Codable {
    let message: String?
}
