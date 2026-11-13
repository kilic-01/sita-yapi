package com.vitra.sitayapitv

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import java.time.LocalTime
import java.util.UUID

/**
 * Bu TV'nin ayarları — masaüstündeki Ayarlar > TV Ekranları'ndan "config"
 * yayınıyla gelir, cihazda saklanır (TV yeniden açılsa da hatırlar).
 *  • tvId: ilk açılışta üretilen kalıcı kimlik; birden fazla TV'de yayın bu
 *    kimlikle hedeflenir.
 *  • mode: "customer" (mağaza) ya da "office" (ofis) — mağaza modunda
 *    kişisel veri içeren yayınlar (rotalar, pano) gösterilmez.
 *  • workStart/workEnd/dimOutside: mesai dışında ekran karartılır.
 */
@Serializable
data class TvConfig(
    val tvId: String = "",
    val name: String = "TV",
    val mode: String = MODE_CUSTOMER,
    val workStart: String = "08:30",
    val workEnd: String = "19:00",
    val dimOutside: Boolean = true,
) {
    val isOffice: Boolean get() = mode == MODE_OFFICE

    /** Şu an mesai saatleri dışında mı (ve karartma açık mı)? */
    fun isDimmedAt(now: LocalTime): Boolean {
        if (!dimOutside) return false
        val start = runCatching { LocalTime.parse(workStart) }.getOrNull() ?: return false
        val end = runCatching { LocalTime.parse(workEnd) }.getOrNull() ?: return false
        return if (start <= end) now < start || now >= end else now in end..start
    }

    companion object {
        const val MODE_CUSTOMER = "customer"
        const val MODE_OFFICE = "office"
        /** Kişisel veri içeren, sadece ofis modunda gösterilen yayın türleri. */
        val OFFICE_ONLY_KINDS = setOf("routes", "dashboard")
    }
}

/** Kumanda menüsünden seçilen ekran akışı (FlowMenu.kt) — cihazda saklanır. */
enum class FlowMode { NORMAL, WEATHER, VIDEO }

class TvSettings(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("sita-tv", Context.MODE_PRIVATE)

    private val _flowMode = MutableStateFlow(
        runCatching { FlowMode.valueOf(prefs.getString("flowMode", null) ?: "") }.getOrDefault(FlowMode.NORMAL),
    )
    val flowMode: StateFlow<FlowMode> = _flowMode

    fun setFlowMode(mode: FlowMode) {
        prefs.edit().putString("flowMode", mode.name).apply()
        _flowMode.value = mode
    }

    private val _config = MutableStateFlow(load())
    val config: StateFlow<TvConfig> = _config

    private fun load(): TvConfig {
        val id = prefs.getString("tvId", null) ?: UUID.randomUUID().toString().also {
            prefs.edit().putString("tvId", it).apply()
        }
        return TvConfig(
            tvId = id,
            name = prefs.getString("name", null) ?: "TV",
            mode = prefs.getString("mode", null) ?: TvConfig.MODE_CUSTOMER,
            workStart = prefs.getString("workStart", null) ?: "08:30",
            workEnd = prefs.getString("workEnd", null) ?: "19:00",
            dimOutside = prefs.getBoolean("dimOutside", true),
        )
    }

    /** Masaüstünden gelen ayarı uygular; kimlik (tvId) değişmez. */
    fun apply(incoming: TvConfig) {
        val merged = incoming.copy(tvId = _config.value.tvId)
        prefs.edit()
            .putString("name", merged.name)
            .putString("mode", merged.mode)
            .putString("workStart", merged.workStart)
            .putString("workEnd", merged.workEnd)
            .putBoolean("dimOutside", merged.dimOutside)
            .apply()
        _config.value = merged
    }
}
