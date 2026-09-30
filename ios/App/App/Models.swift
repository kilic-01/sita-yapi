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

struct Quote: Codable, Identifiable {
    let id: String
    var quoteNo: String?
    var customerName: String?
    var quoteDate: String?
}

struct PendingPart: Codable, Identifiable {
    let id: String
    var customerName: String?
    var description: String?
    var status: String?
}

struct IncomingOrder: Codable, Identifiable {
    let id: String
    var customerName: String?
    var orderNo: String?
    var status: String?
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
