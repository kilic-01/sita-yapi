package com.vitra.sitayapitv

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import android.util.Log
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

@Serializable
data class TvProduct(
    val id: String? = null,
    val code: String = "",
    val name: String = "",
    val category: String = "",
    val imageUrl: String = "",
    // Birden fazla fotoğraf varsa ürün ekranında slider olarak döner; boşsa imageUrl kullanılır.
    val images: List<String> = emptyList(),
    // VitrA YouTube kanalında ürünün serisine ait tanıtım videosu (varsa).
    val videoId: String = "",
    // vitra.com.tr'deki kısa özellik maddeleri — bilgi sütununda madde madde.
    val features: List<String> = emptyList(),
    // Haftanın ürünü kampanya yazısı (Ayarlar > TV Vitrin Sayfaları); boşsa gösterilmez.
    val note: String = "",
    // Haftanın ürünü indirim oranı (%) — priceIncVat indirimsiz fiyat; 0 ise indirim yok.
    val discountRate: Int = 0,
    val unit: String = "adet",
    val priceExVat: Double? = null,
    val priceIncVat: Double? = null,
)

@Serializable
data class TvQuoteItem(
    val code: String = "",
    val description: String = "",
    val qty: Double = 0.0,
    val unit: String = "Adet",
    val unitPrice: Double = 0.0,
    val discountRate: Double = 0.0,
    val lineTotal: Double = 0.0,
    val imageUrl: String = "",
)

@Serializable
data class TvQuoteTotals(
    val subtotal: Double = 0.0,
    val discount: Double = 0.0,
    val vat: Double = 0.0,
    val total: Double = 0.0,
)

@Serializable
data class TvQuote(
    val quoteNo: String = "",
    val customerName: String = "",
    val quoteDate: String = "",
    val validityDays: Int? = null,
    val currency: String = "TRY",
    val items: List<TvQuoteItem> = emptyList(),
    val totals: TvQuoteTotals = TvQuoteTotals(),
)

@Serializable
data class TvRouteStop(
    val order: Int = 0,
    val customer: String = "",
    val area: String = "",
    val urgent: Boolean = false,
    val completed: Boolean = false,
    val minutes: Int? = null,
)

@Serializable
data class TvRouteTechnician(
    val name: String = "",
    val color: String = "",
    val onLeave: Boolean = false,
    val stops: List<TvRouteStop> = emptyList(),
)

@Serializable
data class TvRoutes(
    val date: String = "",
    val technicians: List<TvRouteTechnician> = emptyList(),
)

/** Ofis panosu (günün özeti) — sadece ofis modundaki TV'lerde gösterilir. */
@Serializable
data class TvDashboard(
    val date: String = "",
    val appointmentsToday: Int = 0,
    val completedToday: Int = 0,
    val urgentToday: Int = 0,
    val unassignedToday: Int = 0,
    val appointmentsTomorrow: Int = 0,
    val pendingParts: Int = 0,
    val partsArrived: Int = 0,
    val openQuotes: Int = 0,
    val technicians: List<TvDashboardTech> = emptyList(),
)

@Serializable
data class TvDashboardTech(
    val name: String = "",
    val color: String = "",
    val total: Int = 0,
    val completed: Int = 0,
    val onLeave: Boolean = false,
)

/** Masaüstünden gelen yayın — "kind"e göre [product], [quote] ya da [routes] dolu. */
@Serializable
data class TvPayload(
    val kind: String = "product",
    val product: TvProduct? = null,
    val quote: TvQuote? = null,
    val routes: TvRoutes? = null,
    val dashboard: TvDashboard? = null,
    // Hedef TV kimliği; boşsa (null) tüm TV'ler gösterir.
    val target: String? = null,
    val sentBy: String = "",
    // Yayını gönderen bilgisayarın adı.
    val sentFrom: String = "",
    val sentAt: String = "",
)

enum class ConnectionState { CONNECTING, CONNECTED, DISCONNECTED }

/**
 * Masaüstündeki "TV'de Yayınla" butonunun kullandığı Supabase Realtime
 * "tv-yayin" broadcast kanalını dinler (bkz. electron/db.js — TV Yayını).
 * supabase-kt yerine Phoenix protokolü doğrudan OkHttp WebSocket ile
 * konuşuluyor: ihtiyaç sadece katıl / dinle / "hello" gönder / heartbeat.
 *
 * Broadcast mesajları kalıcı değil — bağlantı her kurulduğunda "hello"
 * gönderilir, o an yayın yapan masaüstü son ürünü (ve bu TV'nin ayarlarını)
 * tekrar yollar. TV, kanala "presence" ile kimliğini/adını/modunu bildirir —
 * masaüstü bağlı TV'leri buradan görür (birden fazla TV, çalışma durumu).
 */
class TvChannel(private val supabaseUrl: String, private val apiKey: String, private val settings: TvSettings) {
    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(20, TimeUnit.SECONDS)
        .build()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val refCounter = AtomicInteger(0)

    private val _connection = MutableStateFlow(ConnectionState.CONNECTING)
    val connection: StateFlow<ConnectionState> = _connection

    private val _current = MutableStateFlow<TvPayload?>(null)
    val current: StateFlow<TvPayload?> = _current

    @Volatile private var socket: WebSocket? = null
    private var heartbeatJob: Job? = null
    private var watchdogJob: Job? = null
    private var reconnectJob: Job? = null
    private var joinRef: String? = null
    private var stopped = false

    private val topic = "realtime:$CHANNEL"

    fun start() {
        stopped = false
        connect()
    }

    fun stop() {
        stopped = true
        heartbeatJob?.cancel()
        watchdogJob?.cancel()
        reconnectJob?.cancel()
        socket?.close(1000, null)
        socket = null
    }

    /** Kumandadaki "geri" tuşu: sadece bu TV'de bekleme ekranına döner. */
    fun dismissLocally() {
        _current.value = null
    }

    /** İnternet (yeniden) geldiğinde MainActivity çağırır — 5 sn beklemeden dener. */
    fun reconnectIfNeeded() {
        if (stopped || _connection.value == ConnectionState.CONNECTED) return
        reconnectJob?.cancel()
        connect()
    }

    private fun connect() {
        heartbeatJob?.cancel()
        watchdogJob?.cancel()
        // Eski soketin geç gelen olayları (bkz. Listener'daki "webSocket ==
        // socket" kontrolleri) yeni bağlantıyı etkilemesin diye önce null'lanır.
        val old = socket
        socket = null
        old?.cancel()
        _connection.value = ConnectionState.CONNECTING
        val wsUrl = supabaseUrl.trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://") +
            "/realtime/v1/websocket?apikey=$apiKey&vsn=1.0.0"
        val request = Request.Builder().url(wsUrl).build()
        val ws = client.newWebSocket(request, Listener())
        socket = ws
        // Stick açılırken Wi-Fi henüz gelmemişse DNS çözümlemesi OkHttp'nin
        // zaman aşımlarına takılmadan uzun süre askıda kalabiliyor (emülatörde
        // açılışta görüldü: ne onOpen ne onFailure geldi). Belirli sürede
        // kanala katılamazsak bu denemeyi bırakıp baştan kuruyoruz.
        watchdogJob = scope.launch {
            delay(CONNECT_WATCHDOG_MS)
            if (socket === ws && _connection.value != ConnectionState.CONNECTED) {
                Log.w(TAG, "bağlantı zaman aşımı — yeniden deneniyor")
                _connection.value = ConnectionState.DISCONNECTED
                connect()
            }
        }
    }

    private fun scheduleReconnect() {
        if (stopped) return
        heartbeatJob?.cancel()
        _connection.value = ConnectionState.DISCONNECTED
        if (reconnectJob?.isActive == true) return
        reconnectJob = scope.launch {
            delay(RECONNECT_DELAY_MS)
            if (!stopped) connect()
        }
    }

    private fun nextRef(): String = refCounter.incrementAndGet().toString()

    private fun send(ws: WebSocket, topic: String, event: String, payload: JsonObject, joinRef: String? = null) {
        val msg = buildJsonObject {
            put("topic", topic)
            put("event", event)
            put("payload", payload)
            put("ref", nextRef())
            if (joinRef != null) put("join_ref", joinRef)
        }
        ws.send(msg.toString())
    }

    private fun join(ws: WebSocket) {
        val ref = nextRef()
        joinRef = ref
        val payload = buildJsonObject {
            putJsonObject("config") {
                putJsonObject("broadcast") { put("self", false); put("ack", false) }
                putJsonObject("presence") { put("key", settings.config.value.tvId) }
                putJsonArray("postgres_changes") {}
                put("private", false)
            }
        }
        val msg = buildJsonObject {
            put("topic", topic)
            put("event", "phx_join")
            put("payload", payload)
            put("ref", ref)
            put("join_ref", ref)
        }
        ws.send(msg.toString())
    }

    private fun sayHello(ws: WebSocket) {
        send(ws, topic, "broadcast", buildJsonObject {
            put("type", "broadcast")
            put("event", "hello")
            putJsonObject("payload") { put("tvId", settings.config.value.tvId) }
        }, joinRef)
    }

    /** Kanala bu TV'nin kimliğini/adını/modunu bildirir (Supabase presence). */
    private fun trackPresence(ws: WebSocket) {
        val c = settings.config.value
        send(ws, topic, "presence", buildJsonObject {
            put("type", "presence")
            put("event", "track")
            putJsonObject("payload") {
                put("tvId", c.tvId)
                put("name", c.name)
                put("mode", c.mode)
                put("version", BuildConfig.VERSION_NAME)
            }
        }, joinRef)
    }

    /** Yayın bu TV için mi: hedef belirtilmemişse herkese; mağaza modunda ofis yayınları gösterilmez. */
    private fun isForMe(payload: TvPayload): Boolean {
        val c = settings.config.value
        if (payload.target != null && payload.target != c.tvId) return false
        if (payload.kind in TvConfig.OFFICE_ONLY_KINDS && !c.isOffice) return false
        return true
    }

    private fun startHeartbeat(ws: WebSocket) {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                delay(HEARTBEAT_MS)
                send(ws, "phoenix", "heartbeat", buildJsonObject {})
            }
        }
    }

    private fun handleMessage(ws: WebSocket, text: String) {
        val msg = runCatching { json.parseToJsonElement(text).jsonObject }.getOrNull() ?: return
        val msgTopic = msg["topic"]?.jsonPrimitive?.content
        val event = msg["event"]?.jsonPrimitive?.content
        val payload = msg["payload"] as? JsonObject ?: return
        if (msgTopic != topic) return
        when (event) {
            "phx_reply" -> {
                val status = payload["status"]?.jsonPrimitive?.content
                val ref = msg["ref"]?.jsonPrimitive?.content
                if (ref == joinRef) {
                    if (status == "ok") {
                        watchdogJob?.cancel()
                        _connection.value = ConnectionState.CONNECTED
                        trackPresence(ws)
                        sayHello(ws)
                    } else {
                        ws.close(1000, null)
                    }
                }
            }
            "broadcast" -> {
                when (payload["event"]?.jsonPrimitive?.content) {
                    "show" -> {
                        val inner = payload["payload"] ?: return
                        runCatching { json.decodeFromJsonElement<TvPayload>(inner) }
                            .onSuccess { if (isForMe(it)) _current.value = it }
                    }
                    "clear" -> {
                        val target = (payload["payload"] as? JsonObject)?.get("target")?.jsonPrimitive?.contentOrNull
                        if (target == null || target == settings.config.value.tvId) _current.value = null
                    }
                    // Masaüstünden "Güncellemeleri kontrol et".
                    "update" -> scope.launch { Updater.check() }
                    "showcase" -> {
                        val inner = payload["payload"] ?: return
                        runCatching { json.decodeFromJsonElement<TvShowcase>(inner) }
                            .onSuccess { ShowcaseStore.apply(it) }
                    }
                    "specialDays" -> {
                        val inner = (payload["payload"] as? JsonObject)?.get("days") ?: return
                        runCatching { json.decodeFromJsonElement<List<SpecialDay>>(inner) }
                            .onSuccess { SpecialDays.apply(it) }
                    }
                    "config" -> {
                        val inner = payload["payload"] ?: return
                        runCatching { json.decodeFromJsonElement<TvConfig>(inner) }.onSuccess { incoming ->
                            if (incoming.tvId != settings.config.value.tvId) return@onSuccess
                            settings.apply(incoming)
                            // Yeni moda geçince artık gösterilmemesi gereken yayın kapanır.
                            _current.value?.let { if (!isForMe(it)) _current.value = null }
                            trackPresence(ws)
                        }
                    }
                }
            }
            "phx_error", "phx_close" -> ws.close(1000, null)
        }
    }

    private inner class Listener : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket açıldı")
            if (webSocket != socket) return
            join(webSocket)
            startHeartbeat(webSocket)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            Log.d(TAG, "mesaj: ${text.take(200)}")
            if (webSocket != socket) return
            handleMessage(webSocket, text)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            webSocket.close(1000, null)
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            if (webSocket == socket) scheduleReconnect()
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.w(TAG, "bağlantı hatası (${response?.code}): ${t.message}")
            if (webSocket == socket) scheduleReconnect()
        }
    }

    companion object {
        const val CHANNEL = "tv-yayin"
        private const val TAG = "SitaTv"
        private const val HEARTBEAT_MS = 25_000L
        private const val RECONNECT_DELAY_MS = 5_000L
        private const val CONNECT_WATCHDOG_MS = 20_000L
    }
}
