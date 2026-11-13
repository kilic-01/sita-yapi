package com.vitra.sitayapitv

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.time.LocalDate

/**
 * Özel gün mesajları ("Cumhuriyet Bayramınız kutlu olsun") — masaüstü,
 * tatil listesinden ve bilinen özel günlerden önümüzdeki bir yılın
 * mesajlarını "specialDays" yayınıyla gönderir; cihazda saklanır ki TV
 * masaüstü kapalıyken açılsa da o günün mesajını göstersin.
 */
@Serializable
data class SpecialDay(
    val date: String = "",
    val text: String = "",
    /** Resmi (milli) bayram — mesajın yanında Türk bayrağı gösterilir. */
    val flag: Boolean = false,
)

object SpecialDays {
    private val json = Json { ignoreUnknownKeys = true }
    private var prefs: SharedPreferences? = null
    private val _days = MutableStateFlow<List<SpecialDay>>(emptyList())
    val days: StateFlow<List<SpecialDay>> = _days

    fun init(context: Context) {
        if (prefs != null) return
        prefs = context.applicationContext.getSharedPreferences("sita-tv", Context.MODE_PRIVATE)
        _days.value = runCatching {
            json.decodeFromString<List<SpecialDay>>(prefs?.getString("specialDays", null) ?: "[]")
        }.getOrDefault(emptyList())
    }

    fun apply(list: List<SpecialDay>) {
        _days.value = list
        prefs?.edit()?.putString("specialDays", json.encodeToString(list))?.apply()
    }

    fun forDate(date: LocalDate, list: List<SpecialDay>): SpecialDay? =
        list.firstOrNull { it.date == date.toString() && it.text.isNotBlank() }
}
