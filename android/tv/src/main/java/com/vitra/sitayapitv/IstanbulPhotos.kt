package com.vitra.sitayapitv

import android.content.Context
import coil.imageLoader
import coil.request.ImageRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

data class IstanbulPhoto(val url: String, val artist: String, val license: String, val source: String = "Wikimedia Commons") {
    /** Fotoğrafın altındaki künye: "Fotoğraf: X · CC BY-SA 4.0 · Wikimedia Commons" / "Fotoğraf: X · Unsplash". */
    val credit: String get() = listOf("Fotoğraf: $artist", license, source).filter { it.isNotBlank() }.joinToString(" · ")
}

/**
 * Hava durumu sayfasının arkasında dönen İstanbul fotoğrafları — çalışırken
 * üç kaynaktan çekilip karışık sıralanır (yüzlerce fotoğraf):
 *  • Wikimedia Commons: öne çıkan/kaliteli/değerli İstanbul fotoğrafları,
 *    silüetler, gece Boğaz
 *  • Unsplash ve Pexels: "İstanbul", "Boğaz", "Galata"… aramaları (yalnız
 *    tv/photo-api.properties'te API anahtarı varsa; yoksa atlanır)
 * Kaynaklardan biri hata verirse (ör. Commons'ın istek sınırı) diğerleriyle
 * devam edilir. Liste günde bir yenilenir; hiçbirine ulaşılamazsa uygulamadaki
 * birkaç fotoğraf (assets/istanbul) yedek olarak kullanılır.
 *
 * Sıra uygulama boyunca korunur: hava durumu sayfası her açıldığında kaldığı
 * fotoğraftan devam eder, aynı fotoğraf ancak liste bitince tekrar gelir.
 */
object IstanbulPhotos {
    // Wikimedia API ve dosya sunucusu, kendini tanıtan bir User-Agent istiyor.
    const val USER_AGENT = "SitaYapiTV/1.0 (Android TV vitrin uygulamasi)"

    private val CATEGORIES = listOf(
        "Category:Featured_pictures_of_Istanbul",
        "Category:Quality_images_of_Istanbul",
        "Category:Valued_images_of_Istanbul",
        "Category:Skylines_of_Istanbul",
        "Category:Bosphorus_at_night",
        // "Views_of_Istanbul" (472 dosya) bilerek yok: seçilmemiş kareler (önü park
        // etmiş araba dolu cadde, sur duvarı…) vitrine uygun değil.
    )
    // Unsplash/Pexels aramaları: çeşitli manzaralar (her biri tek sayfa).
    private val STOCK_QUERIES = listOf(
        "istanbul skyline", "bosphorus istanbul", "galata tower", "istanbul sunset",
        "istanbul mosque view", "maiden's tower istanbul", "istanbul night", "ortakoy mosque",
    )
    // Stok sitelerinde kişi/iç mekân/yemek odaklı karelerin elenmesi (açıklamaya göre).
    private val STOCK_EXCLUDE = Regex(
        "\\b(man|woman|men|women|girl|boy|person|people|portrait|selfie|couple|child|cat|dog|food|tea|coffee|" +
            "interior|inside|indoor|bazaar|shop|market|street art|car)\\b",
        RegexOption.IGNORE_CASE,
    )
    private const val THUMB_WIDTH = 1920
    private const val REFRESH_MS = 24 * 60 * 60 * 1_000L

    // Seçim, dosya adına değil fotoğrafın Commons KATEGORİLERİNE göre yapılır
    // (dosya adları çoğu zaman genel: "Hagia Sophia 2022 13"). Önce olumlu
    // seçim: manzara, siluet, Boğaz/Haliç, köprü, kıyı, yalı, saray/cami dış
    // cephesi, gün batımı/gece görüntüsü gibi kategorilerden en az biri olmalı.
    // Sonra iç mekân, müze eseri, detay/süsleme, heykel, hayvan, inşaat, askerî
    // gemi gibi kategorilerdeki fotoğraflar elenir.
    private val INCLUDE = Regex(
        "exterior|panoram|skyline|cityscape|views? of|bosphorus|bosporus|boğaz|golden horn|haliç|bridge|köprü|" +
            "sunset|sunrise|blue hour|at night|night in|waterfront|ships on|ferr(y|ies)|tower|kulesi|yalı|yali|" +
            "water reflections|galata|maiden|aerial|coast|shore|harbo|pier|iskele|streets? (in|of)|squares? (in|of)|" +
            "mosques in|palace",
        RegexOption.IGNORE_CASE,
    )
    private val EXCLUDE = Regex(
        "interior|imperial hall|harem|museum|exhibition|weapon|armou?ry|panoplia|statue|sculpture|portrait|people|" +
            "food|\\bcats?\\b|dogs?|birds?|animals|detail|ceiling|dome|mosaic|tile|calligraph|manuscript|textile|" +
            "costume|coin|object|tomb|türbe|grave|cemeter|cistern|lamp|chandelier|mihrab|minbar|window|door|" +
            "stained glass|inscription|relief|clock|construction|derrick|crane|landing ship|warship|naval|navy|military|" +
            "vehicle|\\bbus\\b|\\bcars?\\b|train|tram",
        RegexOption.IGNORE_CASE,
    )

    private fun isCityView(title: String, categories: String): Boolean {
        val text = "$title | $categories"
        return INCLUDE.containsMatchIn(text) && !EXCLUDE.containsMatchIn(text)
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()
    private val mutex = Mutex()
    private var photos: List<IstanbulPhoto> = emptyList()
    private var loadedAt = 0L
    private var cursor = 0

    /** Sıradaki fotoğrafı verir ve imleci ilerletir. */
    suspend fun next(context: Context): IstanbulPhoto? = mutex.withLock {
        val list = ensureLoaded(context)
        if (list.isEmpty()) return@withLock null
        val photo = list[cursor % list.size]
        cursor = (cursor + 1) % list.size
        photo
    }

    /**
     * Uygulama açılırken çağrılır: listeyi çeker ve ilk fotoğrafı önbelleğe
     * indirir — hava durumu sayfası ilk kez geldiğinde arka plan boş kalmasın.
     */
    suspend fun warmUp(context: Context) {
        val first = peek(context) ?: return
        context.imageLoader.execute(
            ImageRequest.Builder(context).data(first.url).addHeader("User-Agent", USER_AGENT).build()
        )
    }

    /** İmleci ilerletmeden sıradaki fotoğraf — önceden indirmek için. */
    suspend fun peek(context: Context): IstanbulPhoto? = mutex.withLock {
        val list = ensureLoaded(context)
        list.getOrNull(cursor % list.size.coerceAtLeast(1))
    }

    private suspend fun ensureLoaded(context: Context): List<IstanbulPhoto> {
        val stale = System.currentTimeMillis() - loadedAt > REFRESH_MS
        if (photos.isEmpty() || stale) {
            val fresh = fetchAll()
            when {
                fresh.isNotEmpty() -> {
                    photos = fresh.shuffled()
                    cursor = 0
                    loadedAt = System.currentTimeMillis()
                }
                // Commons'a ulaşılamadı: eldeki listeyle devam, yoksa yedek.
                // Bir saat sonra yeniden denensin diye loadedAt ileri alınır.
                photos.isEmpty() -> {
                    photos = bundled(context).shuffled()
                    cursor = 0
                    loadedAt = System.currentTimeMillis() - REFRESH_MS + 60 * 60 * 1_000L
                }
            }
        }
        return photos
    }

    private suspend fun fetchFromCommons(): List<IstanbulPhoto> = withContext(Dispatchers.IO) {
        val result = LinkedHashMap<String, IstanbulPhoto>()
        for (category in CATEGORIES) runCatching {
            var cont: Map<String, String> = emptyMap()
            while (true) {
                val url = "https://commons.wikimedia.org/w/api.php".toHttpUrl().newBuilder().apply {
                    addQueryParameter("action", "query")
                    addQueryParameter("format", "json")
                    addQueryParameter("generator", "categorymembers")
                    addQueryParameter("gcmtitle", category)
                    addQueryParameter("gcmtype", "file")
                    addQueryParameter("gcmlimit", "200")
                    addQueryParameter("prop", "imageinfo")
                    addQueryParameter("iiprop", "url|size|extmetadata")
                    addQueryParameter("iiextmetadatafilter", "Artist|LicenseShortName|Categories")
                    addQueryParameter("iiurlwidth", THUMB_WIDTH.toString())
                    cont.forEach { (k, v) -> addQueryParameter(k, v) }
                }.build()
                val body = client.newCall(Request.Builder().url(url).header("User-Agent", USER_AGENT).build())
                    .execute().use { resp ->
                        check(resp.isSuccessful) { "Commons yanıtı: ${resp.code}" }
                        resp.body!!.string()
                    }
                val root = Json.parseToJsonElement(body).jsonObject
                val pages = (root["query"] as? JsonObject)?.get("pages") as? JsonObject
                pages?.values?.forEach { page ->
                    val p = page.jsonObject
                    val title = p["title"]?.jsonPrimitive?.content ?: return@forEach
                    val info = (p["imageinfo"]?.jsonArray?.firstOrNull() as? JsonObject) ?: return@forEach
                    val w = info["width"]?.jsonPrimitive?.int ?: return@forEach
                    val h = info["height"]?.jsonPrimitive?.int ?: return@forEach
                    val thumb = info["thumburl"]?.jsonPrimitive?.content ?: return@forEach
                    val ratio = w.toFloat() / h
                    if (w < THUMB_WIDTH || ratio < 1.45f || ratio > 2.2f) return@forEach
                    val meta = info["extmetadata"] as? JsonObject
                    fun metaValue(key: String) =
                        ((meta?.get(key) as? JsonObject)?.get("value")?.jsonPrimitive?.content).orEmpty()
                    if (!isCityView(title, metaValue("Categories"))) return@forEach
                    val artist = shortArtist(metaValue("Artist"))
                    result[title] = IstanbulPhoto(thumb, artist.ifBlank { "Bilinmiyor" }, metaValue("LicenseShortName"))
                }
                val next = root["continue"] as? JsonObject ?: break
                cont = next.mapValues { it.value.jsonPrimitive.content }
                kotlinx.coroutines.delay(500) // Commons'ın istek sınırına takılmamak için
            }
        }.onFailure { android.util.Log.w("SitaTv", "Commons $category: ${it.message}") }
        result.values.toList()
    }

    /** Üç kaynak paralel değil sırayla; her biri kendi içinde karıştırılıp dönüşümlü birleştirilir. */
    private suspend fun fetchAll(): List<IstanbulPhoto> {
        val sources = listOf(
            runCatching { fetchFromCommons() }.getOrDefault(emptyList()),
            runCatching { fetchUnsplash() }.onFailure { android.util.Log.w("SitaTv", "Unsplash: ${it.message}") }.getOrDefault(emptyList()),
            runCatching { fetchPexels() }.onFailure { android.util.Log.w("SitaTv", "Pexels: ${it.message}") }.getOrDefault(emptyList()),
        ).map { it.distinctBy { p -> p.url }.shuffled() }
        // Dönüşümlü: Commons, Unsplash, Pexels, Commons… — aynı kaynaktan art arda gelmesin.
        val mixed = mutableListOf<IstanbulPhoto>()
        val max = sources.maxOf { it.size }
        for (i in 0 until max) sources.forEach { list -> list.getOrNull(i)?.let(mixed::add) }
        return mixed
    }

    private fun getJson(url: String, vararg headers: Pair<String, String>): JsonObject {
        val req = Request.Builder().url(url).apply { headers.forEach { (k, v) -> header(k, v) } }.build()
        return client.newCall(req).execute().use { resp ->
            check(resp.isSuccessful) { "HTTP ${resp.code}" }
            Json.parseToJsonElement(resp.body!!.string()).jsonObject
        }
    }

    // Unsplash: görsel Unsplash'in sunucusundan (hotlink) yüklenir, künyede
    // "Fotoğraf: <ad> · Unsplash" — Unsplash API kuralları.
    private suspend fun fetchUnsplash(): List<IstanbulPhoto> = withContext(Dispatchers.IO) {
        val key = BuildConfig.UNSPLASH_KEY
        if (key.isBlank()) return@withContext emptyList()
        STOCK_QUERIES.flatMap { q ->
            val url = "https://api.unsplash.com/search/photos".toHttpUrl().newBuilder()
                .addQueryParameter("query", q).addQueryParameter("orientation", "landscape")
                .addQueryParameter("per_page", "30").addQueryParameter("content_filter", "high").build().toString()
            val root = runCatching { getJson(url, "Authorization" to "Client-ID $key", "Accept-Version" to "v1") }.getOrNull()
                ?: return@flatMap emptyList()
            root["results"]?.jsonArray.orEmpty().mapNotNull { el ->
                val o = el.jsonObject
                val w = o["width"]?.jsonPrimitive?.int ?: return@mapNotNull null
                val h = o["height"]?.jsonPrimitive?.int ?: return@mapNotNull null
                if (w < THUMB_WIDTH || w.toFloat() / h !in 1.3f..2.4f) return@mapNotNull null
                val desc = listOf("alt_description", "description").joinToString(" ") { k -> o[k]?.jsonPrimitive?.contentOrNullSafe().orEmpty() }
                if (STOCK_EXCLUDE.containsMatchIn(desc)) return@mapNotNull null
                val raw = o["urls"]?.jsonObject?.get("raw")?.jsonPrimitive?.content ?: return@mapNotNull null
                val name = o["user"]?.jsonObject?.get("name")?.jsonPrimitive?.content.orEmpty()
                IstanbulPhoto("$raw&w=$THUMB_WIDTH&q=80&fm=jpg&fit=max", shortArtist(name), "", "Unsplash")
            }
        }
    }

    // Pexels: künyede "Fotoğraf: <ad> · Pexels".
    private suspend fun fetchPexels(): List<IstanbulPhoto> = withContext(Dispatchers.IO) {
        val key = BuildConfig.PEXELS_KEY
        if (key.isBlank()) return@withContext emptyList()
        STOCK_QUERIES.flatMap { q ->
            val url = "https://api.pexels.com/v1/search".toHttpUrl().newBuilder()
                .addQueryParameter("query", q).addQueryParameter("orientation", "landscape")
                .addQueryParameter("per_page", "40").build().toString()
            val root = runCatching { getJson(url, "Authorization" to key) }.getOrNull() ?: return@flatMap emptyList()
            root["photos"]?.jsonArray.orEmpty().mapNotNull { el ->
                val o = el.jsonObject
                val w = o["width"]?.jsonPrimitive?.int ?: return@mapNotNull null
                val h = o["height"]?.jsonPrimitive?.int ?: return@mapNotNull null
                if (w < THUMB_WIDTH || w.toFloat() / h !in 1.3f..2.4f) return@mapNotNull null
                if (STOCK_EXCLUDE.containsMatchIn(o["alt"]?.jsonPrimitive?.contentOrNullSafe().orEmpty())) return@mapNotNull null
                val original = o["src"]?.jsonObject?.get("original")?.jsonPrimitive?.content ?: return@mapNotNull null
                val name = o["photographer"]?.jsonPrimitive?.content.orEmpty()
                IstanbulPhoto("$original?auto=compress&cs=tinysrgb&w=$THUMB_WIDTH", shortArtist(name), "", "Pexels")
            }
        }
    }

    private fun kotlinx.serialization.json.JsonPrimitive.contentOrNullSafe(): String? = if (isString) content else null

    private fun bundled(context: Context): List<IstanbulPhoto> = runCatching {
        val text = context.assets.open("istanbul/credits.json").bufferedReader().use { it.readText() }
        Json.parseToJsonElement(text).jsonArray.map {
            val o = it.jsonObject
            IstanbulPhoto(
                url = "file:///android_asset/istanbul/" + o["file"]!!.jsonPrimitive.content,
                artist = shortArtist(o["artist"]?.jsonPrimitive?.content.orEmpty()),
                license = o["license"]?.jsonPrimitive?.content.orEmpty(),
            )
        }
    }.getOrDefault(emptyList())
}

/**
 * Commons'taki "Artist" alanı bazen paragraf: "This Photo was taken by Wolfgang
 * Moroder. Feel free to use my photos…". Künyede yalnız ad gösterilir:
 * "taken/photographed by X" kalıbından X, yoksa ilk cümle; en fazla 40 karakter.
 */
internal fun shortArtist(raw: String): String {
    val text = raw.replace(Regex("<[^>]+>"), " ")
        .replace("&amp;", "&").replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", "\"")
        .replace(" (Flickr)", "")
        .replace(Regex("\\s+"), " ").trim()
    val by = Regex("(?:taken|photographed|photo|made) by ([^.,;:(|]+)", RegexOption.IGNORE_CASE).find(text)?.groupValues?.get(1)?.trim()
    val name = by ?: text.split(Regex("[.;|\\n]")).first().trim()
    return if (name.length <= 40) name else name.take(39).trimEnd() + "…"
}

