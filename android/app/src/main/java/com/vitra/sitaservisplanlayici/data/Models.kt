package com.vitra.sitaservisplanlayici.data

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class AppUser(
    val id: String,
    val name: String,
    val role: String? = null,
    val photo: String? = null,
    val photoPosition: PhotoPosition? = null
)

@Serializable
data class PhotoPosition(val x: Double, val y: Double)

@Serializable
data class LoginRequest(val name: String, val password: String)

@Serializable
data class Appointment(
    val id: String,
    val customerName: String? = null,
    val customerPhone: String? = null,
    val address: String? = null,
    val addressDetail: AddressDetail? = null,
    val complaint: String? = null,
    val scheduledDate: String? = null,
    val status: String? = null,
    // "acil" | "normal" — electron/db.js addAppointment ile aynı sözleşme.
    val urgency: String? = null,
    val assignedTechnicianId: String? = null,
    val stopOrder: Int? = null,
    val feeAmount: Double? = null,
    val feePaid: Boolean? = null,
    val lat: Double? = null,
    val lng: Double? = null,
    // null değilse konum belirsiz/şüpheli bulunmuş demektir (bkz.
    // electron/handlers.js checkGeocodeQuality) — kullanıcıya gösterilebilecek
    // Türkçe bir uyarı metni taşır.
    val geocodeIssue: String? = null
)

@Serializable
data class AppointmentSaveResponse(
    val appointment: Appointment,
    val geocodeError: String? = null,
    val geocodeWarning: String? = null
)

// src/lib/turkeyAddressData.js + AppointmentForm.jsx'teki form.addressDetail
// ile birebir aynı alanlar — electron/geocodeQuery.js'teki buildGeocodeAttempts
// SADECE bunlardan geocoding sorgusu üretiyor (apartmentNo hariç, bkz. o
// dosyadaki yorum). Bu olmadan backend geocoding'i hiç denemiyor.
@Serializable
data class AddressDetail(
    val il: String? = null,
    val ilce: String? = null,
    val mahalle: String? = null,
    val street: String? = null,
    val buildingName: String? = null,
    val apartmentNo: String? = null
) {
    fun isEmpty(): Boolean =
        il.isNullOrBlank() && ilce.isNullOrBlank() && mahalle.isNullOrBlank() &&
            street.isNullOrBlank() && buildingName.isNullOrBlank() && apartmentNo.isNullOrBlank()
}

@Serializable
data class NewAppointment(
    val customerName: String,
    val customerPhone: String? = null,
    val address: String,
    val addressDetail: AddressDetail? = null,
    val complaint: String? = null,
    val scheduledDate: String,
    val urgency: String = "normal",
    val assignedTechnicianId: String? = null,
    val actingUserId: String? = null,
    // Masaüstündeki formla aynı: firma adına yerinde görüşülecek kişi ve yalnız bize görünen not.
    val contactName: String? = null,
    val internalNote: String? = null
)

@Serializable
data class StockItem(
    val id: String,
    val code: String? = null,
    val name: String? = null,
    val barcode: String? = null,
    val quantity: Int? = null,
    val price: Double? = null,
    val vatRate: Double? = null,
    val unit: String? = null,
    val category: String? = null,
    val depotId: String? = null,
    val imageUrl: String? = null,
    val lowStockThreshold: Int? = null,
    // "Bu üründe en son kim ne zaman işlem yaptı" — electron/db.js'teki genel
    // stampCreatedPatch/stampUpdatedPatch deseni artık stockItems tablosuna da
    // bağlı. SQL migrasyonu çalıştırılana kadar sunucu bunları hiç
    // döndürmeyebilir, bu yüzden hepsi opsiyonel.
    val createdBy: String? = null,
    val createdAt: String? = null,
    val updatedBy: String? = null,
    val updatedAt: String? = null
)

/** GET /api/stock/:id/depots yanıtı — bir ürünün birden fazla depoda farklı
 * miktarlarda durabilmesinin gerçek kaynağı (bkz. electron/db.js
 * stockItemDepots). Önceden Android'de bu uç hiç çağrılmıyordu. */
@Serializable
data class StockItemDepot(
    val id: String,
    val stockItemId: String? = null,
    val depotId: String? = null,
    val quantity: Int? = null
)

/** Yeni ürün eklerken birden fazla depoya dağıtmak için. */
@Serializable
data class StockDepotAllocation(val depotId: String, val quantity: Int)

// src/lib/format.js'teki isLowStock ile aynı eşik mantığı — sabit <=0 değil,
// her ürünün kendi lowStockThreshold'u (yoksa varsayılan 2).
const val DEFAULT_LOW_STOCK_THRESHOLD = 2
fun StockItem.isLowStock(): Boolean = (quantity ?: 0) <= (lowStockThreshold ?: DEFAULT_LOW_STOCK_THRESHOLD)

// Ana sayfadaki "Kritik Stok": katalogdan gelen ve hiç stoğa girmemiş (0) binlerce ürün
// sayılmaz — yalnız minimum eşiği tanımlanıp altına düşenler ya da stoğu 1–2'ye inenler.
fun StockItem.isCriticalStock(): Boolean {
    val qty = quantity ?: 0
    val threshold = lowStockThreshold
    return if (threshold != null) qty <= threshold else qty in 1..DEFAULT_LOW_STOCK_THRESHOLD
}

// Ürün kodu ile adını TEK satırda, AYNI puntoda göstermek için — kod
// dispatcher'lar için en az ad kadar önemli, artık küçük bir altyazı değil,
// isimle birlikte asıl başlık (ör. "A47222 — AquaSee Bataryası").
fun StockItem.codeAndName(): String {
    val trimmedCode = code?.trim().orEmpty()
    val trimmedName = name?.trim().orEmpty()
    return when {
        trimmedCode.isNotEmpty() && trimmedName.isNotEmpty() -> "$trimmedCode — $trimmedName"
        trimmedCode.isNotEmpty() -> trimmedCode
        trimmedName.isNotEmpty() -> trimmedName
        else -> "(isimsiz)"
    }
}

@Serializable
data class NewStockItem(
    val code: String? = null,
    val name: String,
    val barcode: String? = null,
    val quantity: Int = 0,
    val price: Double = 0.0,
    val vatRate: Double = 20.0,
    val unit: String? = "Adet",
    val category: String? = null,
    val depotId: String? = null,
    val actingUserId: String? = null
)

@Serializable
data class Depot(
    val id: String,
    val name: String
)

@Serializable
data class Technician(
    val id: String,
    val name: String
)

@Serializable
data class QuoteItem(
    val qty: Double? = null,
    val code: String? = null,
    val unit: String? = null,
    val vatRate: Double? = null,
    val unitPrice: Double? = null,
    val description: String? = null,
    val discountRate: Double? = null,
    val stockItemId: String? = null
)

@Serializable
data class Quote(
    val id: String,
    val quoteNo: String? = null,
    val customerName: String? = null,
    val contactName: String? = null,
    val customerPhone: String? = null,
    val customerEmail: String? = null,
    val customerAddress: String? = null,
    val quoteDate: String? = null,
    val validityDays: Int? = null,
    val preparedBy: String? = null,
    val currency: String? = null,
    val discountRate: Double? = null,
    val paymentTerms: String? = null,
    val warranty: String? = null,
    val notes: String? = null,
    val iban: String? = null,
    val items: List<QuoteItem> = emptyList()
)

// src/lib/orderTotals.js'teki computeTotals ile birebir aynı — satır bazlı
// iskontodan sonraki tutarlar toplanır, KDV her satırın kendi (iskontolu)
// tutarı üzerinden kendi oranıyla hesaplanıp toplanır.
data class QuoteTotals(
    val araToplam: Double,
    val indirimTutari: Double,
    val kdvMatrahi: Double,
    val kdvToplami: Double,
    val genelToplam: Double
)

fun computeQuoteTotals(items: List<QuoteItem>): QuoteTotals {
    fun gross(item: QuoteItem) = (item.qty ?: 0.0) * (item.unitPrice ?: 0.0)
    fun lineNet(item: QuoteItem) = gross(item) * (1 - (item.discountRate ?: 0.0) / 100.0)

    val grossToplam = items.sumOf { gross(it) }
    val araToplam = items.sumOf { lineNet(it) }
    val indirimTutari = grossToplam - araToplam
    val kdvMatrahi = araToplam
    val kdvToplami = items.sumOf { lineNet(it) * ((it.vatRate ?: 0.0) / 100.0) }
    val genelToplam = kdvMatrahi + kdvToplami
    return QuoteTotals(araToplam, indirimTutari, kdvMatrahi, kdvToplami, genelToplam)
}

// src/lib/orderTotals.js'teki computeTotals ile aynı mantık — satır bazlı
// iskonto düşüldükten sonra KDV, her satırın kendi oranıyla hesaplanır.
fun quoteGrandTotal(items: List<QuoteItem>): Double {
    var total = 0.0
    for (item in items) {
        val gross = (item.qty ?: 0.0) * (item.unitPrice ?: 0.0)
        val lineNet = gross * (1 - (item.discountRate ?: 0.0) / 100.0)
        total += lineNet * (1 + (item.vatRate ?: 0.0) / 100.0)
    }
    return total
}

@Serializable
data class SaleItem(
    val stockItemId: String? = null,
    val code: String? = null,
    val name: String? = null,
    val qty: Double? = null,
    val unitPrice: Double? = null,
    val discountRate: Double? = null,
    val vatRate: Double? = null,
    // Bir ürün birden fazla depoda olabildiği için backend (electron/db.js
    // addSale → deductStockItemDepotQuantity) bunu bilmeden stok düşemiyor —
    // eksikse sessizce atlar. QuickSaleScreen ürün seçilince bunu çözümler.
    val depotId: String? = null
)

@Serializable
data class NewSale(
    val items: List<SaleItem>,
    val generalDiscountRate: Double = 0.0,
    val subtotal: Double,
    val vatTotal: Double,
    val total: Double,
    val deductedFromStock: Boolean,
    val actingUserId: String
)

@Serializable
data class Sale(val id: String)

@Serializable
data class PendingPart(
    val id: String,
    val customerName: String? = null,
    val customerPhone: String? = null,
    val description: String? = null,
    // "bekleniyor" (varsayılan) | "geldi" — electron/db.js addPendingPart ile aynı sözleşme.
    val status: String? = null
)

// Masaüstündeki Ücret Takip ile aynı sözleşme (electron/db.js
// addFeeEntry/updateFeeEntry) — "amount" girilen tutarın kendisi, KDV
// alanı artık UI'da gösterilmiyor (ekleme/düzenlemede her zaman 0 gönderilir).
@Serializable
data class FeeEntry(
    val id: String,
    val category: String,
    val description: String? = null,
    val amount: Double,
    val totalAmount: Double,
    val date: String
)

@Serializable
data class IncomingOrder(
    val id: String,
    val orderNo: String? = null,
    val customerName: String? = null,
    val notes: String? = null,
    val orderDate: String? = null,
    val status: String? = null
)

@Serializable
data class PartCheckout(
    val id: String,
    // Aynı "Zimmetle" işleminde birlikte seçilmiş kişiler ortak bir groupId
    // paylaşır (bkz. src/components/PartCheckoutsPage.jsx byTechnician) —
    // yazdırma çıktısında bu kişiler TEK bir başlık altında gösterilir.
    val groupId: String? = null,
    val technicianId: String? = null,
    val stockItemId: String? = null,
    val appointmentId: String? = null,
    val date: String? = null,
    val qtyTaken: Int? = null,
    val qtyUsed: Int? = null,
    val qtyReturned: Int? = null,
    val qtyStoredInVehicle: Int? = null,
    val status: String? = null
)

@Serializable
data class ChatMessage(
    val id: String,
    val senderId: String,
    val recipientId: String,
    val body: String,
    val createdAt: String? = null,
    val readAt: String? = null
)

@Serializable
data class NewMessage(val senderId: String, val recipientId: String, val body: String)

@Serializable
data class ActivityEntry(
    val id: String,
    val actorUserId: String? = null,
    val entityType: String? = null,
    val description: String? = null,
    val createdAt: String? = null
)

@Serializable
data class ShopLocation(val lat: Double, val lng: Double)

// POST /api/routes gerçek yanıt şekli — "stops" alanı, electron/handlers.js
// buildRoutes'ta orijinal randevu kaydının üzerine stopOrder/status/
// assignedTechnicianId eklenerek (spread) oluşturuluyor, yani tam bir
// Appointment şekli taşıyor.
@Serializable
data class RouteGroup(
    val technician: Technician,
    val stops: List<Appointment> = emptyList()
)

@Serializable
data class BuildRoutesResponse(
    val routes: List<RouteGroup> = emptyList(),
    val skippedCount: Int = 0,
    val skippedCustomers: List<String> = emptyList()
)

@Serializable
data class ApiErrorBody(val message: String? = null)

/** Stok detayındaki "TV'de Göster" (POST /api/tv/broadcast) — deviceName TV'de "yayınlayan" olarak görünür. */
@Serializable
data class TvBroadcastBody(val item: StockItem, val actingUserId: String, val deviceName: String)
