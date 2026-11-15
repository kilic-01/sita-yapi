package com.vitra.sitaservisplanlayici.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

/** iOS'taki her ekranın API çağrılarının tek yerden toplandığı katman. */
object Repository {
    suspend fun login(name: String, password: String): AppUser? =
        ApiClient.post<LoginRequest, AppUser?>("/login", LoginRequest(name, password))

    suspend fun listUsers(): List<AppUser> = ApiClient.get("/users")

    @Serializable
    data class UpdateUserPatch(
        val name: String? = null,
        val password: String? = null,
        val photo: String? = null,
        val photoPosition: PhotoPosition? = null
    )

    @Serializable
    data class UpdateUserBody(val patch: UpdateUserPatch, val actingUserId: String)

    suspend fun updateUser(id: String, patch: UpdateUserPatch, actingUserId: String): AppUser =
        ApiClient.put("/users/$id", UpdateUserBody(patch, actingUserId))

    @Serializable
    data class RegisterDeviceTokenBody(val userId: String, val token: String, val platform: String, val actingUserId: String)

    suspend fun registerDeviceToken(userId: String, token: String, platform: String, actingUserId: String) {
        ApiClient.postRaw("/device-tokens", ApiClient.json.encodeToString(RegisterDeviceTokenBody(userId, token, platform, actingUserId)))
    }

    suspend fun listTechnicians(): List<Technician> = ApiClient.get("/technicians")

    // ---- Harita / Rota Oluştur ----
    suspend fun shopLocation(): ShopLocation = ApiClient.get("/shop-location")

    @Serializable
    data class BuildRoutesBody(val scheduledDate: String, val actingUserId: String? = null)

    suspend fun buildRoutes(scheduledDate: String, actingUserId: String?): BuildRoutesResponse =
        ApiClient.post("/routes", BuildRoutesBody(scheduledDate, actingUserId))

    // ---- Randevular ----
    suspend fun appointmentsByDate(date: String): List<Appointment> =
        ApiClient.get("/appointments/by-date/$date")

    /** Randevular ekranındaki arama: müşteri adı ya da telefonu, tarihten bağımsız (en yeni 50). */
    suspend fun searchAppointments(query: String): List<Appointment> =
        ApiClient.get("/appointments/search?q=${java.net.URLEncoder.encode(query, "UTF-8")}")

    suspend fun appointmentsByCustomerPhone(phone: String): List<Appointment> =
        ApiClient.get("/appointments/by-customer?phone=${java.net.URLEncoder.encode(phone, "UTF-8")}")

    suspend fun appointmentsByCustomer(name: String): List<Appointment> =
        ApiClient.get("/appointments/by-customer?name=${java.net.URLEncoder.encode(name, "UTF-8")}")

    suspend fun createAppointment(body: NewAppointment): AppointmentSaveResponse =
        ApiClient.post("/appointments", body)

    // Gövde elle kuruluyor: kotlinx Json null alanları HİÇ yazmıyor — bu
    // yüzden "telefonu/şikayeti temizle" (boş string) ve "Otomatik rota"
    // (assignedTechnicianId = JSON null) eskiden sunucuya hiç ulaşmıyor,
    // sunucu da eski değeri koruyordu. iOS'taki AppointmentEditView.EditBody
    // ile aynı sözleşme: assignedTechnicianId sadece GERÇEKTEN değiştiyse yazılır.
    suspend fun updateAppointment(
        id: String,
        customerName: String,
        customerPhone: String,
        address: String?,
        addressDetail: AddressDetail?,
        complaint: String,
        scheduledDate: String,
        urgency: String,
        actingUserId: String?,
        technicianChanged: Boolean,
        assignedTechnicianId: String?
    ): AppointmentSaveResponse {
        val body = buildJsonObject {
            put("customerName", customerName)
            put("customerPhone", customerPhone)
            if (address != null) put("address", address)
            if (addressDetail != null) put("addressDetail", ApiClient.json.encodeToJsonElement(AddressDetail.serializer(), addressDetail))
            put("complaint", complaint)
            put("scheduledDate", scheduledDate)
            put("urgency", urgency)
            if (actingUserId != null) put("actingUserId", actingUserId)
            if (technicianChanged) put("assignedTechnicianId", assignedTechnicianId)
        }
        return ApiClient.json.decodeFromString(ApiClient.putRaw("/appointments/$id", body.toString()))
    }

    @Serializable
    data class StatusPatch(val status: String, val actingUserId: String)

    suspend fun updateAppointmentStatus(id: String, status: String, actingUserId: String): Appointment =
        ApiClient.put("/appointments/$id/status", StatusPatch(status, actingUserId))

    suspend fun deleteAppointment(id: String) {
        ApiClient.deleteRaw("/appointments/$id")
    }

    // ---- Stok ----
    suspend fun allStock(): List<StockItem> = ApiClient.get("/stock")

    /** Ürünü ofis TV'sinde gösterir (masaüstündeki "Yayınla" ile aynı iş). */
    /** @return yayının sentAt değeri (TV şeridi bununla kendi yayınını tanır). */
    /** Yayın sonucu: sentAt ve — bazı TV'ler gösteremediyse — sunucunun uyarısı. */
    data class TvSendResult(val sentAt: String?, val warning: String?)

    suspend fun broadcastToTv(item: StockItem, actingUserId: String, deviceName: String): TvSendResult =
        sendResultOf(ApiClient.postRaw("/tv/broadcast", ApiClient.json.encodeToString(TvBroadcastBody.serializer(), TvBroadcastBody(item, actingUserId, deviceName))))

    /** Sunucudaki (telefonların) son yayının sentAt'i; yayın yoksa null. */
    suspend fun currentTvSentAt(): String? = sentAtOf(ApiClient.getRaw("/tv/current"))

    suspend fun clearTv() {
        ApiClient.postRaw("/tv/clear", "{}")
    }

    private fun sendResultOf(body: String): TvSendResult {
        val obj = runCatching { ApiClient.json.parseToJsonElement(body) as? kotlinx.serialization.json.JsonObject }.getOrNull()
        fun str(key: String) = (obj?.get(key) as? kotlinx.serialization.json.JsonPrimitive)?.takeIf { it.isString }?.content
        return TvSendResult(str("sentAt"), str("warning"))
    }

    private fun sentAtOf(body: String): String? = runCatching {
        (ApiClient.json.parseToJsonElement(body) as? kotlinx.serialization.json.JsonObject)
            ?.get("sentAt")?.let { (it as? kotlinx.serialization.json.JsonPrimitive)?.content }
    }.getOrNull()

    // Bulunamayan barkodda sunucu JSON `null` döner (→ null). Ağ/sunucu
    // hataları bilerek yukarı fırlatılıyor — eskiden hepsi null'a çevrilip
    // kullanıcıya yanlışlıkla "ürün bulunamadı" gösteriliyordu.
    suspend fun stockByBarcode(barcode: String): StockItem? =
        ApiClient.get("/stock/by-barcode/${java.net.URLEncoder.encode(barcode, "UTF-8").replace("+", "%20")}")

    @Serializable
    data class NewStockItemBody(
        val code: String? = null,
        val name: String,
        val barcode: String? = null,
        val price: Double = 0.0,
        val vatRate: Double = 20.0,
        val unit: String? = "Adet",
        val category: String? = null,
        // Yeni ürün de ilk eklenişte birden fazla depoya dağıtılabilsin diye
        // (ör. hem dükkan hem şantiye) — tekil depotId/quantity yerine.
        val depots: List<StockDepotAllocation> = emptyList(),
        val actingUserId: String
    )

    suspend fun createStockItem(body: NewStockItemBody): StockItem = ApiClient.post("/stock", body)

    // ---- Depo Bazlı Stok Dağılımı ----
    suspend fun listStockItemDepots(stockItemId: String): List<StockItemDepot> =
        ApiClient.get("/stock/$stockItemId/depots")

    @Serializable
    data class StockDepotQuantityBody(val quantity: Int, val actingUserId: String)

    suspend fun setStockItemDepotQuantity(stockItemId: String, depotId: String, quantity: Int, actingUserId: String): List<StockItemDepot> =
        ApiClient.put("/stock/$stockItemId/depots/$depotId", StockDepotQuantityBody(quantity, actingUserId))

    suspend fun removeStockItemDepot(stockItemId: String, depotId: String, actingUserId: String) {
        ApiClient.deleteRaw(
            "/stock/$stockItemId/depots/$depotId",
            ApiClient.json.encodeToString(ActingUserIdBody.serializer(), ActingUserIdBody(actingUserId))
        )
    }

    @Serializable
    data class StockTransferBody(val fromDepotId: String, val toDepotId: String, val qty: Int, val actingUserId: String)

    // Depo Transferi (stok kaydırma) — ör. depodaki bir ürünü dükkana getirme.
    suspend fun transferStockItemDepot(stockItemId: String, body: StockTransferBody): StockItem =
        ApiClient.post("/stock/$stockItemId/transfer", body)

    @Serializable
    data class StockPatch(
        val name: String? = null,
        val code: String? = null,
        val unit: String? = null,
        val barcode: String? = null,
        val lowStockThreshold: Int? = null,
        val quantity: Int? = null,
        val price: Double? = null,
        val category: String? = null,
        val depotId: String? = null,
        val actingUserId: String? = null
    )

    suspend fun updateStockItem(id: String, patch: StockPatch): StockItem = ApiClient.put("/stock/$id", patch)

    @Serializable
    data class ActingUserIdBody(val actingUserId: String)

    suspend fun deleteStockItem(id: String, actingUserId: String) {
        ApiClient.deleteRaw("/stock/$id", ApiClient.json.encodeToString(ActingUserIdBody.serializer(), ActingUserIdBody(actingUserId)))
    }

    // ---- Depolar ----
    suspend fun listDepots(): List<Depot> = ApiClient.get("/depots")

    // ---- Teklifler ----
    suspend fun listQuotes(): List<Quote> = ApiClient.get("/quotes")

    // iOS'taki QuoteCreateView / NewQuote ile aynı sözleşme.
    @Serializable
    data class NewQuote(
        val customerName: String,
        val contactName: String,
        val customerPhone: String,
        // Varsayılan değer VERİLMİYOR: kotlinx Json varsayılana eşit alanları
        // hiç yazmıyor (encodeDefaults=false), "TRY"/"" sunucuya ulaşmazdı.
        val customerEmail: String,
        val customerAddress: String,
        val quoteDate: String,
        val validityDays: Int,
        val preparedBy: String,
        val currency: String,
        val items: List<QuoteItem>,
        val actingUserId: String
    )

    suspend fun createQuote(body: NewQuote): Quote = ApiClient.post("/quotes", body)

    // ---- Bekleyen Parçalar ----
    suspend fun listPendingParts(): List<PendingPart> = ApiClient.get("/pending-parts")

    @Serializable
    data class NewPendingPart(
        val customerName: String,
        val customerPhone: String? = null,
        val description: String,
        val orderedAt: String? = null,
        val actingUserId: String
    )

    suspend fun addPendingPart(body: NewPendingPart): PendingPart = ApiClient.post("/pending-parts", body)

    @Serializable
    data class PendingPartStatusPatch(val status: String, val actingUserId: String)

    suspend fun updatePendingPartStatus(id: String, status: String, actingUserId: String): PendingPart =
        ApiClient.put("/pending-parts/$id", PendingPartStatusPatch(status, actingUserId))

    // ---- Ücret Takip ----
    suspend fun listFeeEntries(): List<FeeEntry> = ApiClient.get("/fee-entries")

    @Serializable
    data class NewFeeEntry(
        val category: String,
        val amount: Double,
        val vatRate: Double,
        val description: String,
        val date: String,
        val actingUserId: String
    )

    suspend fun addFeeEntry(body: NewFeeEntry): FeeEntry = ApiClient.post("/fee-entries", body)

    suspend fun updateFeeEntry(id: String, body: NewFeeEntry): FeeEntry =
        ApiClient.put("/fee-entries/$id", body)

    suspend fun deleteFeeEntry(id: String, actingUserId: String) {
        ApiClient.deleteRaw("/fee-entries/$id", ApiClient.json.encodeToString(ActingUserIdBody.serializer(), ActingUserIdBody(actingUserId)))
    }

    // ---- Gelen Siparişler ----
    suspend fun listIncomingOrders(): List<IncomingOrder> = ApiClient.get("/incoming-orders")

    suspend fun updateIncomingOrderStatus(id: String, status: String, actingUserId: String) {
        ApiClient.putRaw("/incoming-orders/$id", ApiClient.json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(),
            kotlinx.serialization.json.buildJsonObject {
                put("status", kotlinx.serialization.json.JsonPrimitive(status))
                put("actingUserId", kotlinx.serialization.json.JsonPrimitive(actingUserId))
            }))
    }

    /** Teklifi ofis TV'sinde gösterir (toplamlar sunucuda masaüstüyle aynı hesapla). */
    suspend fun broadcastQuoteToTv(quoteId: String, actingUserId: String, deviceName: String): TvSendResult = sendResultOf(
        ApiClient.postRaw("/tv/broadcast-quote", ApiClient.json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(),
            kotlinx.serialization.json.buildJsonObject {
                put("quoteId", kotlinx.serialization.json.JsonPrimitive(quoteId))
                put("actingUserId", kotlinx.serialization.json.JsonPrimitive(actingUserId))
                put("deviceName", kotlinx.serialization.json.JsonPrimitive(deviceName))
            }))
    )

    suspend fun deleteQuote(id: String) {
        ApiClient.deleteRaw("/quotes/$id")
    }

    @Serializable
    data class NewIncomingOrder(
        val customerName: String,
        val notes: String? = null,
        val orderDate: String,
        val actingUserId: String
    )

    suspend fun addIncomingOrder(body: NewIncomingOrder): IncomingOrder = ApiClient.post("/incoming-orders", body)

    // ---- Zimmet ----
    suspend fun listPartCheckouts(): List<PartCheckout> = ApiClient.get("/part-checkouts")

    @Serializable
    data class NewPartCheckout(
        val technicianId: String,
        val stockItemId: String,
        val date: String,
        val qtyTaken: Int,
        val actingUserId: String,
        // Bir ürün birden fazla depoda olabildiği için backend
        // (electron/db.js addPartCheckout) bu olmadan HATA verip
        // zimmetlemeyi tamamen engelliyor — eskiden hiç gönderilmiyordu.
        val depotId: String? = null
    )

    suspend fun createPartCheckout(body: NewPartCheckout): PartCheckout = ApiClient.post("/part-checkouts", body)

    @Serializable
    data class ReconcilePatch(val qtyUsed: Int, val qtyReturned: Int, val qtyStoredInVehicle: Int = 0, val actingUserId: String)

    suspend fun reconcilePartCheckout(id: String, patch: ReconcilePatch): PartCheckout =
        ApiClient.put("/part-checkouts/$id/reconcile", patch)

    // ---- Aktivite ----
    suspend fun activityLog(actingUserId: String): List<ActivityEntry> =
        ApiClient.get("/activity-log?actingUserId=$actingUserId")

    // Ürün sayfasındaki "info" butonu için — bu ürüne ait depo/miktar
    // değişikliklerinin detaylı geçmişi (admin kısıtlaması yok, yukarıdaki
    // genel "Aktivite" ucundan farklı).
    suspend fun getStockItemActivity(stockItemId: String): List<ActivityEntry> =
        ApiClient.get("/stock/$stockItemId/activity")

    // ---- Mesajlar ----
    suspend fun messages(userId: String): List<ChatMessage> = ApiClient.get("/messages/$userId")

    suspend fun sendMessage(senderId: String, recipientId: String, body: String): ChatMessage =
        ApiClient.post("/messages", NewMessage(senderId, recipientId, body))

    @Serializable
    data class ReadBody(val currentUserId: String, val otherUserId: String)

    suspend fun markRead(currentUserId: String, otherUserId: String) {
        ApiClient.putRaw("/messages/read", ApiClient.json.encodeToString(ReadBody.serializer(), ReadBody(currentUserId, otherUserId)))
    }

    // ---- Satış (Hızlı Satış) ----
    suspend fun addSale(body: NewSale): Sale = ApiClient.post("/sales", body)

    @Serializable
    class EmptyBody
}
