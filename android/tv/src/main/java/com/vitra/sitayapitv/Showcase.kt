package com.vitra.sitayapitv

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Bekleme ekranının vitrin sayfaları — masaüstündeki Ayarlar > TV Vitrin
 * Sayfaları'ndan "showcase" yayınıyla gelir (haftanın ürünü, koleksiyon
 * tanıtımları, hizmetlerimiz); cihazda saklanır ki masaüstü kapalıyken de
 * gösterilsin. Fiyat yok.
 */
@Serializable
data class TvShowcase(
    val featured: TvProduct? = null,
    val collections: List<TvCollection> = emptyList(),
    val services: TvServices? = null,
)

@Serializable
data class TvCollection(
    val slug: String = "",
    val name: String = "",
    val description: String = "",
    val images: List<String> = emptyList(),
    val products: List<String> = emptyList(),
)

@Serializable
data class TvServiceItem(
    val title: String = "",
    val text: String = "",
    /** Lucide ikon adı (ServiceIcons); boş ya da "auto" ise başlıktan seçilir. */
    val icon: String = "",
)

@Serializable
data class TvServices(
    val items: List<TvServiceItem> = emptyList(),
    val phone: String = "",
    val whatsapp: String = "",
    val address: String = "",
    val web: String = "",
)

object ShowcaseStore {
    private val json = Json { ignoreUnknownKeys = true }
    private var prefs: SharedPreferences? = null
    private val _showcase = MutableStateFlow(TvShowcase())
    val showcase: StateFlow<TvShowcase> = _showcase

    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.applicationContext.getSharedPreferences("sita-tv", Context.MODE_PRIVATE)
        _showcase.value = runCatching {
            json.decodeFromString<TvShowcase>(prefs?.getString("showcase", null) ?: "{}")
        }.getOrDefault(TvShowcase())
    }

    fun apply(value: TvShowcase) {
        _showcase.value = value
        prefs?.edit()?.putString("showcase", json.encodeToString(value))?.apply()
    }
}
