import Foundation

// Web sürümünde (server/public-barkod/index.html) doğrulanmış aynı REST
// sözleşmesiyle konuşuyoruz — alan adları backend'in (server/index.js,
// electron/handlers.js) döndürdüğü camelCase JSON ile birebir eşleşiyor.

struct AppUser: Codable, Identifiable, Equatable {
    let id: String
    let name: String
    var role: String?
}

struct Technician: Codable, Identifiable {
    let id: String
    let name: String
    var phone: String?
    var assignable: Bool?
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
