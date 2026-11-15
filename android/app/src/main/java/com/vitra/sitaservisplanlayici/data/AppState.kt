package com.vitra.sitaservisplanlayici.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString

/**
 * iOS'taki AppState.swift'in karşılığı — oturumu SharedPreferences'ta
 * (UserDefaults'un Android karşılığı) saklar. Uygulama her açıldığında
 * bu oturumun sunucuda hâlâ geçerli olup olmadığı RootNav.kt'de ayrıca
 * doğrulanır (bkz. iOS'taki aynı isimli kalıcı-oturum-doğrulama düzeltmesi).
 */
class AppState(private val context: Context) {
    private val prefs = context.getSharedPreferences("sita-yapi-native-user", Context.MODE_PRIVATE)

    var currentUser by mutableStateOf<AppUser?>(loadUser())
        private set

    // Mesajlar sekmesinin rozetinde gösterilen toplam okunmamış mesaj sayısı —
    // RootApp periyodik olarak yeniliyor (bkz. refreshUnreadMessageCount).
    var unreadMessageCount by mutableStateOf(0)
        private set

    // Bu telefonun TV'deki yayını — alttaki "TV'de yayında … [Durdur]" şeridi
    // (masaüstündeki TvBroadcastBar ile aynı). Durdurulunca ya da başka bir
    // cihaz yayın yapınca refreshTvOnAir ile kaybolur.
    var tvOnAir by mutableStateOf<TvOnAir?>(null)

    // Son bakılanlar (cihazda saklı, en yeni başta, en fazla 5): stok ve randevu
    // aramasında kutu boşken gösterilir — aynı ürünü/müşteriyi günde birkaç kez arayan için.
    var recentStock by mutableStateOf(loadRecent<StockItem>("recent-stock"))
        private set
    var recentAppointments by mutableStateOf(loadRecent<Appointment>("recent-appointments"))
        private set

    fun addRecentStock(item: StockItem) {
        recentStock = (listOf(item) + recentStock.filter { it.id != item.id }).take(5)
        prefs.edit().putString("recent-stock", ApiClient.json.encodeToString(recentStock)).apply()
    }

    fun addRecentAppointment(appt: Appointment) {
        recentAppointments = (listOf(appt) + recentAppointments.filter { it.id != appt.id }).take(5)
        prefs.edit().putString("recent-appointments", ApiClient.json.encodeToString(recentAppointments)).apply()
    }

    private inline fun <reified T> loadRecent(key: String): List<T> =
        runCatching { ApiClient.json.decodeFromString<List<T>>(prefs.getString(key, null) ?: return emptyList()) }.getOrDefault(emptyList())

    // Ana sayfadaki hızlı işlemler: Stok sekmesinde barkod okuyucuyu, Randevular
    // sekmesinde arama kutusunu açtırmak için (ilgili ekran okuyup sıfırlar).
    var pendingStockScan by mutableStateOf(false)
    var pendingAppointmentSearch by mutableStateOf(false)
    // Mesaj bildirimine basıldı: (gönderen id, ad) — RootApp Mesajlar'a geçip bu sohbeti açar.
    var pendingChat by mutableStateOf<Pair<String, String>?>(null)

    /** Bildirim intent'indeki (FCM data ya da kendi bildirimimiz) mesaj bilgisini okur. */
    fun handleNotificationIntent(intent: android.content.Intent?) {
        val extras = intent?.extras ?: return
        if (extras.getString("type") != "message") return
        val senderId = extras.getString("senderId")?.takeIf { it.isNotBlank() } ?: return
        pendingChat = senderId to (extras.getString("senderName") ?: "")
    }

    suspend fun refreshTvOnAir() {
        val mine = tvOnAir ?: return
        val current = runCatching { Repository.currentTvSentAt() }.getOrElse { return } // ağ hatası şeridi kaldırmaz
        if (current != mine.sentAt) tvOnAir = null
    }

    suspend fun stopTv() {
        Repository.clearTv()
        tvOnAir = null
    }

    suspend fun refreshUnreadMessageCount() {
        val myId = currentUser?.id
        if (myId == null) {
            unreadMessageCount = 0
            return
        }
        try {
            val messages = Repository.messages(myId)
            unreadMessageCount = messages.count { it.recipientId == myId && it.senderId != myId && it.readAt == null }
        } catch (_: Exception) {
            // Geçici ağ hatası rozeti sıfırlamamalı, mevcut değeri korur.
        }
    }

    private fun loadUser(): AppUser? {
        val raw = prefs.getString("user_json", null) ?: return null
        return try {
            ApiClient.json.decodeFromString<AppUser>(raw)
        } catch (_: Exception) {
            null
        }
    }

    fun login(user: AppUser) {
        currentUser = user
        SessionHolder.userId = user.id
        prefs.edit().putString("user_json", ApiClient.json.encodeToString(user)).apply()
    }

    fun logout() {
        currentUser = null
        AuthToken.clear()
        SessionHolder.userId = null
        prefs.edit().remove("user_json").apply()
    }

    init {
        // Oturum anahtarı olmayan eski girişler (anahtar sisteminden önceki sürüm)
        // geçersiz: kullanıcıdan bir kez yeniden giriş istenir.
        if (currentUser != null && AuthToken.value == null) {
            currentUser = null
            prefs.edit().remove("user_json").apply()
        }
        SessionHolder.userId = currentUser?.id
        // Sunucu 401 dönerse çıkış (ağ iş parçacığından ana iş parçacığına geçilir).
        ApiClient.onSessionExpired = {
            android.os.Handler(android.os.Looper.getMainLooper()).post { logout() }
        }
    }
}

// FcmService (sistem tarafından, Activity/Compose dışında) çağrıldığında
// hangi kullanıcı adına token kaydedileceğini bilmesi gerekiyor — AppState
// Compose tarafında tutulduğu için buraya basit bir static köprü.
object SessionHolder {
    var userId: String? = null
}

data class TvOnAir(val sentAt: String, val title: String, val subtitle: String?)

/** Dokunsal geri bildirim: bir işlem gerçekleşince ekrana bakmadan anlaşılsın. */
fun android.view.View.hapticConfirm() {
    performHapticFeedback(if (android.os.Build.VERSION.SDK_INT >= 30) android.view.HapticFeedbackConstants.CONFIRM else android.view.HapticFeedbackConstants.VIRTUAL_KEY)
}

fun android.view.View.hapticReject() {
    performHapticFeedback(if (android.os.Build.VERSION.SDK_INT >= 30) android.view.HapticFeedbackConstants.REJECT else android.view.HapticFeedbackConstants.LONG_PRESS)
}
