package com.vitra.sitayapitv

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Bekleme ekranının VitrA ortam fotoğrafları — vitra.com.tr görsel site
 * haritasından ("Ambiance", "Bathroom/Banyo", "Scene"… adlı ~270 sahne
 * fotoğrafı) çalışırken alınır; uygulamaya gömülü birkaç fotoğraf
 * (assets/backgrounds) internet yokken yedektir. Liste günde bir yenilenir.
 * Beyaz zeminli ürün fotoğrafları (cut-out), detay ve teknik görseller elenir;
 * yüklendiğinde dikey çıkan fotoğraf da listeden düşürülür ([markPortrait]).
 */
object VitraBackgrounds {
    private const val SITEMAP_URL = "https://www.vitra.com.tr/sitemaps/sitemap-images.xml"
    private const val REFRESH_MS = 24 * 60 * 60 * 1_000L
    private const val WIDTH = 1920

    private val INCLUDE = Regex("ambian|bathroom|banyo|scene|lifestyle|mood|living|showroom", RegexOption.IGNORE_CASE)
    private val EXCLUDE = Regex("cut_?out|detail|sketch|technical|drawing|logo|vertical|dikey|portrait|icon|_tech", RegexOption.IGNORE_CASE)

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    private val mutex = Mutex()
    private var loadedAt = 0L
    private val portrait = java.util.Collections.synchronizedSet(mutableSetOf<String>())

    private val _urls = MutableStateFlow<List<String>>(emptyList())
    val urls: StateFlow<List<String>> = _urls

    /** Listeyi (gerekirse) siteden yükler; hata olursa eldeki listeyle devam edilir. */
    suspend fun refresh() = mutex.withLock {
        if (_urls.value.isNotEmpty() && System.currentTimeMillis() - loadedAt < REFRESH_MS) return@withLock
        val fresh = runCatching { fetch() }
            .onFailure { Log.w("SitaTv", "VitrA fotoğrafları alınamadı: ${it.message}") }
            .getOrDefault(emptyList())
        if (fresh.isNotEmpty()) {
            _urls.value = fresh.filterNot { it in portrait }
            loadedAt = System.currentTimeMillis()
        }
    }

    /** Yüklenince dikey çıkan fotoğraf — tam ekranda kırpılınca kötü görünür, bir daha gösterilmez. */
    fun markPortrait(url: String) {
        portrait += url
        _urls.value = _urls.value - url
    }

    private suspend fun fetch(): List<String> = withContext(Dispatchers.IO) {
        val request = Request.Builder().url(SITEMAP_URL).header("User-Agent", "Mozilla/5.0 (Android TV; SitaYapiTV)").build()
        val xml = client.newCall(request).execute().use { res ->
            if (!res.isSuccessful) error("HTTP ${res.code}")
            res.body?.string().orEmpty()
        }
        imageLocs(xml)
            .filter { url ->
                val file = url.substringAfterLast('/')
                INCLUDE.containsMatchIn(file) && !EXCLUDE.containsMatchIn(file)
            }
            .mapNotNull(::toScreenSize)
            .distinct()
            .toList()
    }

    // Site haritası ~4 MB. Android 9'da (Mi Box) Regex.findAll bu büyüklükte bir metinde
    // her eşleşmede metni yerel belleğe yeniden kopyalıyor: binlerce eşleşmede bellek
    // saniyeler içinde 1 GB'ı aşıp uygulama kapatılıyordu. Düz metin aramasıyla okunur.
    private fun imageLocs(xml: String): Sequence<String> = sequence {
        val open = "<image:loc>"
        val close = "</image:loc>"
        var from = 0
        while (true) {
            val start = xml.indexOf(open, from)
            if (start < 0) break
            val end = xml.indexOf(close, start + open.length)
            if (end < 0) break
            yield(xml.substring(start + open.length, end).trim())
            from = end + close.length
        }
    }

    // images.salsify.com/images/q_auto:low/<id>/<dosya> → mncdn üzerinden ekran
    // genişliğinde, iyi kalitede (oran korunur).
    private fun toScreenSize(url: String): String? {
        val path = Regex("/images/(?:q_auto(?::[a-z]+)?/)?(.+)$").find(url)?.groupValues?.get(1) ?: return null
        return "https://img-salsify.mncdn.com/mnresize/$WIDTH/$WIDTH/images/q_auto:good/$path"
    }
}
