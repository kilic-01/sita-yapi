import Foundation

// Web sürümünde (server/public-barkod/index.html) doğrulanmış aynı REST
// sözleşmesiyle konuşuyoruz — alan adları backend'in (server/index.js,
// electron/handlers.js) döndürdüğü camelCase JSON ile birebir eşleşiyor.

struct AppUser: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    var role: String?
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
}

/// Yeni randevu oluşturma isteği gövdesi — POST /api/appointments.
/// customerName + address + scheduledDate dışındaki her şey backend'de
/// zaten opsiyonel (bkz. electron/db.js addAppointment).
struct NewAppointment: Encodable {
    var customerName: String
    var address: String
    var scheduledDate: String
    var customerPhone: String
    var complaint: String
    var urgency: String
    var assignedTechnicianId: String?
    var actingUserId: String
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
}

struct PartCheckout: Codable, Identifiable {
    let id: String
    var technicianId: String?
    var stockItemId: String?
    var date: String?
    var qtyTaken: Double?
    var status: String?
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
    /// Yalnızca native tarafta (Hızlı Satış barkod akışı) kullanılıyor —
    /// tekliflerin kablo formatına dahil değil, bu yüzden CodingKeys dışında.
    var stockItemId: String? = nil

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
