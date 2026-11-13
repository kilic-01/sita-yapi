package com.vitra.sitayapitv

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.os.SystemClock
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.net.Inet4Address

/** Uygulamanın açıldığı an — bilgi penceresindeki "açık kalma süresi" için (MainActivity.onCreate). */
object AppUptime {
    var startedAt: Long = SystemClock.elapsedRealtime()
}

private val InfoMaterial = Color(0xE61C1C1E)
private val InfoSecondary = Color(0x99FFFFFF)
private val InfoTertiary = Color(0x66FFFFFF)
private val InfoSeparator = Color(0x1FFFFFFF)
private val InfoGood = Color(0xFF30D158)
private val InfoBad = Color(0xFFFF453A)
private val InfoWarn = Color(0xFFFFD60A)

private data class NetworkInfo(val online: Boolean, val type: String, val ip: String?)

private fun readNetwork(context: Context): NetworkInfo {
    val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    val network = cm.activeNetwork ?: return NetworkInfo(false, "Bağlantı yok", null)
    val caps = cm.getNetworkCapabilities(network)
    val type = when {
        caps == null -> "Bilinmiyor"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "Kablo (Ethernet)"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "Wi‑Fi"
        caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "Mobil veri"
        else -> "Diğer"
    }
    // VALIDATED: Android, ağın gerçekten internete çıktığını doğruladı.
    val online = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED) == true
    val ip = cm.getLinkProperties(network)?.linkAddresses
        ?.map { it.address }
        ?.firstOrNull { it is Inet4Address && !it.isLoopbackAddress }
        ?.hostAddress
    return NetworkInfo(online, type, ip)
}

// "Xiaomi MiTV-AFKR0" — model adı üreticiyi zaten içeriyorsa tekrarlanmaz.
private fun deviceModel(): String {
    val maker = Build.MANUFACTURER.replaceFirstChar { it.titlecase(turkish) }
    return if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL else "$maker ${Build.MODEL}"
}

private fun formatUptime(): String {
    val minutes = (SystemClock.elapsedRealtime() - AppUptime.startedAt) / 60_000
    val days = minutes / (60 * 24)
    val hours = (minutes / 60) % 24
    val mins = minutes % 60
    return buildList {
        if (days > 0) add("$days gün")
        if (hours > 0) add("$hours sa")
        add("$mins dk")
    }.joinToString(" ")
}

private fun flowLabel(mode: FlowMode) = when (mode) {
    FlowMode.NORMAL -> "Normal"
    FlowMode.WEATHER -> "Hava Durumu"
    FlowMode.VIDEO -> "Video"
}

private fun updateLabel(update: UpdateState) = when (update) {
    UpdateState.None -> "Güncel"
    is UpdateState.Available -> "Yeni sürüm hazır: ${update.version}"
    is UpdateState.Downloading -> "İndiriliyor: ${update.version}"
    is UpdateState.Confirming -> "Onay bekleniyor: ${update.version}"
    is UpdateState.Failed -> "${update.message} (${update.retry.version})"
}

/**
 * Kumanda menüsündeki "Bilgi": sürüm, internet/sunucu bağlantısı, bu TV'nin
 * ayarları ve cihaz bilgileri. Değerler pencere açıldığında okunur.
 */
@Composable
fun InfoPanel(connection: ConnectionState, config: TvConfig, flowMode: FlowMode, update: UpdateState) {
    val context = LocalContext.current
    val net = remember { readNetwork(context) }
    val uptime = remember { formatUptime() }
    val metrics = context.resources.displayMetrics
    val isDev = BuildConfig.SUPABASE_KEY.startsWith("sb_secret_")

    Box(Modifier.fillMaxSize().background(Color(0x80000000)), contentAlignment = Alignment.Center) {
        Column(
            Modifier
                .width(560.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(InfoMaterial)
                .padding(horizontal = 22.dp, vertical = 18.dp),
        ) {
            Text("Bilgi", style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = TvCallout, fontWeight = FontWeight.SemiBold))
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                Column(Modifier.weight(1f)) {
                    Section("Bağlantı")
                    InfoRow("İnternet", if (net.online) "Bağlı" else "Yok", if (net.online) InfoGood else InfoBad)
                    InfoRow("Bağlantı Türü", net.type)
                    InfoRow("IP Adresi", net.ip ?: "—")
                    InfoRow(
                        "Sunucu (Yayın)",
                        when (connection) {
                            ConnectionState.CONNECTED -> "Bağlı"
                            ConnectionState.CONNECTING -> "Bağlanıyor"
                            ConnectionState.DISCONNECTED -> "Bağlı değil"
                        },
                        when (connection) {
                            ConnectionState.CONNECTED -> InfoGood
                            ConnectionState.CONNECTING -> InfoWarn
                            ConnectionState.DISCONNECTED -> InfoBad
                        },
                    )
                    Spacer(Modifier.height(12.dp))
                    Section("Uygulama")
                    InfoRow("Sürüm", "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})")
                    InfoRow("Güncelleme", updateLabel(update))
                    InfoRow("Ortam", if (isDev) "Geliştirme" else "Canlı")
                    InfoRow("Açık Kalma Süresi", uptime)
                }
                Column(Modifier.weight(1f)) {
                    Section("Bu TV")
                    InfoRow("Ad", config.name)
                    InfoRow("Kimlik", config.tvId.take(8))
                    InfoRow("Mod", if (config.isOffice) "Ofis" else "Mağaza")
                    InfoRow("Ekran Akışı", flowLabel(flowMode))
                    InfoRow("Mesai", "${config.workStart} – ${config.workEnd}")
                    InfoRow("Mesai Dışı Karartma", if (config.dimOutside) "Açık" else "Kapalı")
                    Spacer(Modifier.height(12.dp))
                    Section("Cihaz")
                    InfoRow("Model", deviceModel())
                    InfoRow("Android", "${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
                    InfoRow("Ekran", "${metrics.widthPixels} × ${metrics.heightPixels}")
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("OK ya da Geri: kapat", style = TextStyle(fontFamily = Poppins, color = InfoTertiary, fontSize = TvCaption2))
        }
    }
}

@Composable
private fun Section(title: String) {
    Text(
        title.uppercase(turkish),
        style = TextStyle(fontFamily = Poppins, color = InfoTertiary, fontSize = TvCaption2, fontWeight = FontWeight.Medium),
    )
    Spacer(Modifier.height(4.dp))
}

@Composable
private fun InfoRow(label: String, value: String, dot: Color? = null) {
    Column {
        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            // Etiket hiç bölünmez; uzun değer (ör. model adı) sonda "…" ile kısalır.
            Text(label, style = TextStyle(fontFamily = Poppins, color = InfoSecondary, fontSize = TvCaption1), maxLines = 1, softWrap = false)
            Spacer(Modifier.width(12.dp))
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.End, verticalAlignment = Alignment.CenterVertically) {
                if (dot != null) {
                    Box(Modifier.size(7.dp).clip(CircleShape).background(dot))
                    Spacer(Modifier.width(6.dp))
                }
                Text(
                    value,
                    style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = TvCaption1, fontWeight = FontWeight.Medium),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(InfoSeparator))
    }
}
