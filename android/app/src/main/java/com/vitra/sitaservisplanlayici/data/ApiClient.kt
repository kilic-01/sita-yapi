package com.vitra.sitaservisplanlayici.data

import android.content.Context
import android.content.SharedPreferences
import android.os.Build
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class ApiException(message: String) : Exception(message)

/**
 * server/index.js'in sunduğu aynı REST uçları — iOS'taki APIClient.swift'in
 * birebir Android karşılığı. Emülatör, Mac'in kendi ağ yığınını DEĞİL,
 * sanal bir ağ kullanır; "10.0.2.2" Android emülatörünün standart host-loopback
 * takma adıdır (iOS simülatöründeki "127.0.0.1" kısayoluna denk gelir).
 * Gerçek cihazda bu sabit IP yerine Mac'in güncel LAN IP'si gerekir.
 */
object ApiClient {
    private val isEmulator: Boolean =
        Build.FINGERPRINT.contains("generic") || Build.MODEL.contains("sdk") || Build.PRODUCT.contains("sdk")

    // Gerçek cihaz: canlı sunucu (Render, veri Supabase PROD). Geliştirmede giriş
    // ekranındaki Sunucu alanına ofis Mac'inin LAN adresi yazılabilir (yalnız debug
    // derlemesi şifresiz bağlantıya izin verir — src/debug/AndroidManifest.xml).
    val defaultServerAddress: String =
        if (isEmulator) "10.0.2.2:4173" else "https://sita-yapi-api.onrender.com"

    // Mac'in LAN IP'si Wi-Fi değiştikçe kayıyor — sabit yazılı adreste bu,
    // HER özelliği aynı anda bozup yeniden derleme gerektiriyordu. Artık
    // giriş ekranından değiştirilebilen kalıcı bir tercih (boşsa varsayılan).
    private var prefs: SharedPreferences? = null

    fun init(context: Context) {
        if (prefs == null) prefs = context.applicationContext.getSharedPreferences("sita-yapi-server", Context.MODE_PRIVATE)
    }

    var serverAddress: String
        get() = prefs?.getString("address", null)?.takeIf { it.isNotBlank() } ?: defaultServerAddress
        set(value) { prefs?.edit()?.putString("address", value.trim())?.apply() }

    private val baseUrl: String
        get() = normalizeBaseUrl(serverAddress)

    /**
     * "192.168.1.5", "192.168.1.5:4173", "http://host:4173/api" → "http://host:port/api"
     * "https://sita-yapi-api.onrender.com" → "https://sita-yapi-api.onrender.com/api"
     */
    fun normalizeBaseUrl(address: String): String {
        var a = address.trim().trimEnd('/')
        if (!a.startsWith("http://") && !a.startsWith("https://")) a = "http://$a"
        if (a.endsWith("/api")) a = a.removeSuffix("/api")
        val hostPart = a.substringAfter("://")
        // Port yalnız şifresiz yerel sunucu (ofis Mac'i, 4173) için eklenir; HTTPS
        // adresinde (canlı sunucu) standart 443 — eskiden ":4173" ekleniyor, canlıya
        // bağlanırken zaman aşımı oluyordu (iOS'taki aynı hata).
        if (a.startsWith("http://") && !hostPart.contains(':')) a = "$a:4173"
        return "$a/api"
    }

    // encodeDefaults: varsayılana EŞİT alanlar (ör. yeni ürünün vatRate=20,
    // unit="Adet", qtyStoredInVehicle=0) eskiden gövdeye hiç yazılmıyor, sunucuya
    // ulaşmıyordu. explicitNulls=false: null alanlar yine yazılmaz — PUT
    // yamalarında (StockPatch vb.) "değiştirme" anlamı korunur.
    val json = Json { ignoreUnknownKeys = true; isLenient = true; encodeDefaults = true; explicitNulls = false }
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .build()
    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    /** Sunucu 401 dönünce (oturum bitti) çağrılır — AppState çıkış yapar. */
    @Volatile var onSessionExpired: (() -> Unit)? = null

    /** Her isteğe oturum anahtarı (giriş isteğinde anahtar yoktur). */
    private fun Request.Builder.withAuth(): Request.Builder {
        AuthToken.value?.let { header("Authorization", "Bearer $it") }
        return this
    }

    suspend fun getRaw(path: String): String = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(baseUrl + path).withAuth().get().build()
        executeRaw(request)
    }

    suspend fun postRaw(path: String, bodyJson: String): String = withContext(Dispatchers.IO) {
        val requestBody = bodyJson.toRequestBody(jsonMedia)
        val request = Request.Builder().url(baseUrl + path).withAuth().post(requestBody).build()
        executeRaw(request)
    }

    suspend fun putRaw(path: String, bodyJson: String): String = withContext(Dispatchers.IO) {
        val requestBody = bodyJson.toRequestBody(jsonMedia)
        val request = Request.Builder().url(baseUrl + path).withAuth().put(requestBody).build()
        executeRaw(request)
    }

    suspend fun deleteRaw(path: String, bodyJson: String? = null): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder().url(baseUrl + path).withAuth()
        if (bodyJson != null) builder.delete(bodyJson.toRequestBody(jsonMedia)) else builder.delete()
        executeRaw(builder.build())
    }

    private fun executeRaw(request: Request): String {
        client.newCall(request).execute().use { resp ->
            val bodyStr = resp.body?.string().orEmpty()
            if (resp.code == 401) {
                // Anahtar geçersiz/süresi dolmuş ya da kullanıcı silinmiş: anahtarı sil, çıkış yap.
                AuthToken.clear()
                onSessionExpired?.invoke()
            }
            if (!resp.isSuccessful) throw ApiException(errorMessage(bodyStr, resp.code))
            return bodyStr
        }
    }

    private fun errorMessage(body: String?, code: Int): String {
        if (body != null) {
            try {
                val err = json.decodeFromString(ApiErrorBody.serializer(), body)
                if (err.message != null) return err.message
            } catch (_: Exception) { }
        }
        return "Sunucu hatası ($code)"
    }
}

suspend inline fun <reified T> ApiClient.get(path: String): T =
    json.decodeFromString(getRaw(path))

suspend inline fun <reified B, reified T> ApiClient.post(path: String, body: B): T =
    json.decodeFromString(postRaw(path, json.encodeToString(body)))

suspend inline fun <reified B, reified T> ApiClient.put(path: String, body: B): T =
    json.decodeFromString(putRaw(path, json.encodeToString(body)))
