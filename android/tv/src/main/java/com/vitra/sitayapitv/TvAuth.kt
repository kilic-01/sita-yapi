package com.vitra.sitayapitv

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.io.IOException
import java.nio.ByteBuffer
import java.security.KeyFactory
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.MessageDigest
import java.security.spec.ECGenParameterSpec
import java.security.spec.X509EncodedKeySpec
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.crypto.Cipher
import javax.crypto.KeyAgreement
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

sealed interface AuthState {
    /** Kayıtlı bilgi okunuyor / oturum açılıyor. */
    data object Loading : AuthState
    /** Eşleşmemiş: ekranda [code] gösterilir, masaüstünde onay beklenir. */
    data class Pairing(val code: String) : AuthState
    data object Paired : AuthState
}

/**
 * TV'nin kimliği. "tv-yayin" kanalı özeldir: Supabase'deki RLS politikası
 * yalnız eşleştirilmiş TV hesaplarına (app_metadata.role = "tv") izin verir.
 * APK'da yalnız publishable anahtar vardır; TV'nin kendi hesap bilgileri
 * eşleştirmede masaüstünden şifreli gelir ve cihazda Android Keystore ile
 * şifrelenerek saklanır.
 *
 * Eşleştirme (bkz. electron/db.js "TV eşleştirme"): TV geçici bir P-256 anahtar
 * çifti üretir, açık anahtarın özetinden 6 haneli kodu ekranda gösterir ve
 * açık "tv-eslestirme" kanalına "pair-request" yollar. Yönetici masaüstünde aynı
 * kodu görüp onaylayınca gelen "pair-grant" yalnız bu TV'nin özel anahtarıyla
 * (ECDH + AES-256-GCM) çözülebilir.
 */
class TvAuth(
    context: Context,
    private val supabaseUrl: String,
    private val apiKey: String,
    private val settings: TvSettings,
) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val prefs = context.applicationContext.getSharedPreferences("sita-tv-auth", Context.MODE_PRIVATE)
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()

    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state

    @Serializable
    private data class Stored(val email: String, val password: String, val refreshToken: String = "")

    private var stored: Stored? = null
    @Volatile private var accessToken: String? = null
    @Volatile private var expiresAtMs: Long = 0
    private var started = false

    fun start() {
        if (started) return
        started = true
        scope.launch {
            stored = runCatching { loadStored() }.getOrNull()
            if (stored == null) startPairing() else {
                _state.value = AuthState.Paired
                validAccessToken()
            }
        }
    }

    /**
     * Geçerli erişim anahtarı (süresi 5 dk'dan az kaldıysa yenilenir). Eşleşme
     * yoksa ya da ağ yoksa null. Hesap silinmişse (masaüstünden "Eşleşmeyi
     * kaldır") kayıt temizlenip eşleştirme ekranına dönülür.
     */
    suspend fun validAccessToken(): String? = mutex.withLock {
        val s = stored ?: return@withLock null
        val now = System.currentTimeMillis()
        accessToken?.let { if (expiresAtMs - now > REFRESH_MARGIN_MS) return@withLock it }
        if (s.refreshToken.isNotEmpty()) {
            when (val r = tokenRequest("refresh_token", buildJsonObject { put("refresh_token", s.refreshToken) })) {
                is TokenResult.Ok -> return@withLock acceptSession(r, s)
                TokenResult.Network -> return@withLock accessToken?.takeIf { expiresAtMs > now }
                TokenResult.Rejected -> Unit
            }
        }
        when (val r = tokenRequest("password", buildJsonObject { put("email", s.email); put("password", s.password) })) {
            is TokenResult.Ok -> acceptSession(r, s)
            TokenResult.Network -> accessToken?.takeIf { expiresAtMs > now }
            TokenResult.Rejected -> {
                Log.w(TAG, "TV hesabı reddedildi — eşleştirme gerekiyor")
                forgetLocked()
                null
            }
        }
    }

    /** Masaüstünden "Eşleşmeyi kaldır" (özel kanaldan "unpair"). */
    fun unpair() {
        scope.launch { mutex.withLock { forgetLocked() } }
    }

    private fun forgetLocked() {
        stored = null
        accessToken = null
        expiresAtMs = 0
        prefs.edit().remove(PREF_BLOB).apply()
        startPairing()
    }

    private fun acceptSession(r: TokenResult.Ok, s: Stored): String {
        accessToken = r.accessToken
        expiresAtMs = System.currentTimeMillis() + r.expiresInSec * 1000
        if (r.refreshToken.isNotEmpty() && r.refreshToken != s.refreshToken) {
            val next = s.copy(refreshToken = r.refreshToken)
            stored = next
            runCatching { saveStored(next) }.onFailure { Log.w(TAG, "kimlik kaydedilemedi: ${it.message}") }
        }
        return r.accessToken
    }

    private sealed interface TokenResult {
        data class Ok(val accessToken: String, val refreshToken: String, val expiresInSec: Long) : TokenResult
        data object Rejected : TokenResult
        data object Network : TokenResult
    }

    private fun tokenRequest(grant: String, body: JsonObject): TokenResult {
        val request = Request.Builder()
            .url("${supabaseUrl.trimEnd('/')}/auth/v1/token?grant_type=$grant")
            .header("apikey", apiKey)
            .post(body.toString().toRequestBody("application/json".toMediaType()))
            .build()
        return try {
            http.newCall(request).execute().use { res ->
                val text = res.body?.string().orEmpty()
                when {
                    res.isSuccessful -> {
                        val o = json.parseToJsonElement(text).jsonObject
                        TokenResult.Ok(
                            accessToken = o["access_token"]?.jsonPrimitive?.content ?: return TokenResult.Network,
                            refreshToken = o["refresh_token"]?.jsonPrimitive?.content.orEmpty(),
                            expiresInSec = o["expires_in"]?.jsonPrimitive?.longOrNull ?: 3600,
                        )
                    }
                    // 400/401/403/404/422: bilgi geçersiz (hesap silinmiş, anahtar iptal). 429/5xx: geçici.
                    res.code in 400..499 && res.code != 408 && res.code != 429 -> TokenResult.Rejected
                    else -> TokenResult.Network
                }
            }
        } catch (e: IOException) {
            TokenResult.Network
        } catch (e: Exception) {
            Log.w(TAG, "oturum isteği: ${e.message}")
            TokenResult.Network
        }
    }

    // ---------- Eşleştirme ----------
    private var pairing: PairingSession? = null

    private fun startPairing() {
        pairing?.stop()
        val session = PairingSession()
        pairing = session
        _state.value = AuthState.Pairing(session.code)
        session.start()
    }

    private fun onGranted(email: String, password: String) {
        scope.launch {
            val ok = mutex.withLock {
                val candidate = Stored(email, password)
                when (val r = tokenRequest("password", buildJsonObject { put("email", email); put("password", password) })) {
                    is TokenResult.Ok -> {
                        stored = candidate
                        runCatching { saveStored(candidate) }.onFailure { Log.w(TAG, "kimlik kaydedilemedi: ${it.message}") }
                        acceptSession(r, candidate)
                        true
                    }
                    else -> false
                }
            }
            if (ok) {
                pairing?.stop()
                pairing = null
                _state.value = AuthState.Paired
            }
        }
    }

    private inner class PairingSession {
        private val keyPair: KeyPair = KeyPairGenerator.getInstance("EC").apply {
            initialize(ECGenParameterSpec("secp256r1"))
        }.generateKeyPair()
        private val pub: String = Base64.encodeToString(keyPair.public.encoded, Base64.NO_WRAP)
        val code: String = pairingCode(keyPair.public.encoded)
        private val topic = "realtime:$PAIRING_CHANNEL"
        private val refs = AtomicInteger(0)
        @Volatile private var socket: WebSocket? = null
        @Volatile private var joinRef: String? = null
        @Volatile private var joinPending: String? = null
        @Volatile private var stopped = false
        private var loop: Job? = null

        fun start() {
            loop = scope.launch {
                while (isActive && !stopped) {
                    if (socket == null) connect()
                    socket?.let { ws -> joinRef?.let { sendRequest(ws, it) } }
                    delay(REQUEST_INTERVAL_MS)
                }
            }
        }

        fun stop() {
            stopped = true
            loop?.cancel()
            socket?.close(1000, null)
            socket = null
        }

        private fun connect() {
            joinRef = null
            val wsUrl = supabaseUrl.trimEnd('/').replaceFirst("https://", "wss://").replaceFirst("http://", "ws://") +
                "/realtime/v1/websocket?apikey=$apiKey&vsn=1.0.0"
            socket = http.newWebSocket(Request.Builder().url(wsUrl).build(), object : WebSocketListener() {
                override fun onOpen(webSocket: WebSocket, response: Response) {
                    val ref = refs.incrementAndGet().toString()
                    joinPending = ref
                    webSocket.send(buildJsonObject {
                        put("topic", topic)
                        put("event", "phx_join")
                        putJsonObject("payload") {
                            putJsonObject("config") {
                                putJsonObject("broadcast") { put("self", false); put("ack", false) }
                                put("private", false)
                            }
                        }
                        put("ref", ref)
                        put("join_ref", ref)
                    }.toString())
                    scope.launch {
                        // Phoenix heartbeat (bağlantı açık kalsın).
                        while (isActive && socket === webSocket) {
                            delay(25_000)
                            webSocket.send(buildJsonObject {
                                put("topic", "phoenix"); put("event", "heartbeat")
                                putJsonObject("payload") {}; put("ref", refs.incrementAndGet().toString())
                            }.toString())
                        }
                    }
                }

                override fun onMessage(webSocket: WebSocket, text: String) {
                    if (webSocket !== socket) return
                    val msg = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
                    if (msg["topic"]?.jsonPrimitive?.content != topic) return
                    val payload = msg["payload"] as? JsonObject ?: return
                    when (msg["event"]?.jsonPrimitive?.content) {
                        "phx_reply" -> if (msg["ref"]?.jsonPrimitive?.content == joinPending &&
                            payload["status"]?.jsonPrimitive?.content == "ok"
                        ) {
                            joinRef = joinPending
                            sendRequest(webSocket, joinPending!!)
                        }
                        "broadcast" -> if (payload["event"]?.jsonPrimitive?.content == "pair-grant") {
                            (payload["payload"] as? JsonObject)?.let { handleGrant(it) }
                        }
                        "phx_error", "phx_close" -> drop(webSocket)
                    }
                }

                override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = drop(webSocket)
                override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) = drop(webSocket)
            })
        }

        private fun drop(ws: WebSocket) {
            if (ws === socket) {
                socket = null
                joinRef = null
            }
            ws.cancel()
        }

        private fun sendRequest(ws: WebSocket, ref: String) {
            val c = settings.config.value
            ws.send(buildJsonObject {
                put("topic", topic)
                put("event", "broadcast")
                putJsonObject("payload") {
                    put("type", "broadcast")
                    put("event", "pair-request")
                    putJsonObject("payload") {
                        put("tvId", c.tvId)
                        put("name", c.name)
                        put("version", BuildConfig.VERSION_NAME)
                        put("pub", pub)
                    }
                }
                put("ref", refs.incrementAndGet().toString())
                put("join_ref", ref)
            }.toString())
        }

        private fun handleGrant(p: JsonObject) {
            if (p["tvId"]?.jsonPrimitive?.content?.lowercase() != settings.config.value.tvId.lowercase()) return
            if (p["code"]?.jsonPrimitive?.content != code) return
            val plain = runCatching {
                val epk = KeyFactory.getInstance("EC").generatePublic(
                    X509EncodedKeySpec(Base64.decode(p["epk"]!!.jsonPrimitive.content, Base64.DEFAULT)),
                )
                val shared = KeyAgreement.getInstance("ECDH").run {
                    init(keyPair.private)
                    doPhase(epk, true)
                    generateSecret()
                }
                val key = MessageDigest.getInstance("SHA-256").run {
                    update(shared)
                    update(PAIR_INFO.toByteArray(Charsets.UTF_8))
                    digest()
                }
                Cipher.getInstance("AES/GCM/NoPadding").run {
                    init(
                        Cipher.DECRYPT_MODE,
                        SecretKeySpec(key, "AES"),
                        GCMParameterSpec(128, Base64.decode(p["iv"]!!.jsonPrimitive.content, Base64.DEFAULT)),
                    )
                    updateAAD(settings.config.value.tvId.lowercase().toByteArray(Charsets.UTF_8))
                    String(doFinal(Base64.decode(p["ct"]!!.jsonPrimitive.content, Base64.DEFAULT)), Charsets.UTF_8)
                }
            }.getOrElse {
                Log.w(TAG, "eşleştirme bilgisi çözülemedi: ${it.message}")
                return
            }
            val o = runCatching { json.parseToJsonElement(plain).jsonObject }.getOrNull() ?: return
            val email = o["email"]?.jsonPrimitive?.content ?: return
            val password = o["password"]?.jsonPrimitive?.content ?: return
            onGranted(email, password)
        }
    }

    // ---------- Cihazda şifreli saklama (Android Keystore AES-GCM) ----------
    private fun keystoreKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build(),
            )
        }.generateKey()
    }

    private fun saveStored(s: Stored) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, keystoreKey()) }
        val ct = cipher.doFinal(json.encodeToString(Stored.serializer(), s).toByteArray(Charsets.UTF_8))
        val blob = ByteBuffer.allocate(1 + cipher.iv.size + ct.size).put(cipher.iv.size.toByte()).put(cipher.iv).put(ct).array()
        prefs.edit().putString(PREF_BLOB, Base64.encodeToString(blob, Base64.NO_WRAP)).apply()
    }

    private fun loadStored(): Stored? {
        val raw = prefs.getString(PREF_BLOB, null) ?: return null
        val blob = Base64.decode(raw, Base64.DEFAULT)
        val ivLen = blob[0].toInt()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
            init(Cipher.DECRYPT_MODE, keystoreKey(), GCMParameterSpec(128, blob, 1, ivLen))
        }
        val plain = cipher.doFinal(blob, 1 + ivLen, blob.size - 1 - ivLen)
        return json.decodeFromString(Stored.serializer(), String(plain, Charsets.UTF_8))
    }

    companion object {
        private const val TAG = "SitaTvAuth"
        const val PAIRING_CHANNEL = "tv-eslestirme"
        private const val PAIR_INFO = "sita-tv-eslestirme-v1"
        private const val KEY_ALIAS = "sita-tv-auth"
        private const val PREF_BLOB = "blob"
        private const val REFRESH_MARGIN_MS = 5 * 60_000L
        private const val REQUEST_INTERVAL_MS = 5_000L

        /** Masaüstündeki tvPairingCode ile aynı: SHA-256(açık anahtar) ilk 4 bayt mod 1.000.000. */
        fun pairingCode(spki: ByteArray): String {
            val h = MessageDigest.getInstance("SHA-256").digest(spki)
            val n = ByteBuffer.wrap(h, 0, 4).int.toLong() and 0xffffffffL
            return (n % 1_000_000).toString().padStart(6, '0')
        }
    }
}
