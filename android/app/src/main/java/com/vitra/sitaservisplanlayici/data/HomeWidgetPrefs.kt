package com.vitra.sitaservisplanlayici.data

import android.content.Context
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue

enum class HomeWidgetId(val title: String) {
    PROGRAM("Haftalık Program"),
    TODAY("Bugünün Randevuları"),
    TOMORROW("Yarının Randevuları"),
    LOW_STOCK("Az Stoklu Ürünler"),
    QUOTES("Fiyat Teklifleri"),
    OUTSTANDING_CHECKOUTS("Mutabakatı Bekleyen Zimmetler")
}

// iOS/masaüstü ile aynı varsayılan sıra — src/components/homeWidgets.jsx'teki
// HOME_WIDGETS önem sırasıyla birebir (gün sonu özeti ve izin hatırlatması
// hariç, onlar bu mobil sürümde yok).
private val DEFAULT_ORDER = listOf(
    HomeWidgetId.PROGRAM,
    HomeWidgetId.TODAY,
    HomeWidgetId.TOMORROW,
    HomeWidgetId.LOW_STOCK,
    HomeWidgetId.QUOTES,
    HomeWidgetId.OUTSTANDING_CHECKOUTS
)

/**
 * iOS'taki Ana Sayfa "Düzenle" modunun karşılığı — widget'ların
 * görünür/gizli listesini SharedPreferences'ta saklar. Gizlenen widget
 * "Widget Ekle" ile aynen iOS'ta olduğu gibi listenin SONUNA eklenerek
 * geri getirilir.
 */
class HomeWidgetPrefs(context: Context) {
    private val prefs = context.getSharedPreferences("sita-yapi-home-widgets", Context.MODE_PRIVATE)

    var visibleIds by mutableStateOf(load())
        private set

    private fun load(): List<HomeWidgetId> {
        val raw = prefs.getString("visible_ids", null) ?: return DEFAULT_ORDER
        val saved = raw.split(",").filter { it.isNotBlank() }.mapNotNull { name ->
            try { HomeWidgetId.valueOf(name) } catch (_: Exception) { null }
        }
        // Daha sonra eklenen yeni widget türleri, kaydedilmiş eski listede
        // yoksa sona eklenir (masaüstündeki "missing" mantığıyla aynı).
        val missing = DEFAULT_ORDER.filter { it !in saved }
        return saved + missing
    }

    private fun persist(ids: List<HomeWidgetId>) {
        visibleIds = ids
        prefs.edit().putString("visible_ids", ids.joinToString(",") { it.name }).apply()
    }

    val hiddenIds: List<HomeWidgetId>
        get() = DEFAULT_ORDER.filter { it !in visibleIds }

    fun remove(id: HomeWidgetId) {
        persist(visibleIds.filterNot { it == id })
    }

    fun add(id: HomeWidgetId) {
        if (id in visibleIds) return
        persist(visibleIds + id)
    }
}
