package com.vitra.sitaservisplanlayici.data

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/**
 * assets/il-ilce-mahalle.json'u (masaüstündeki public/data/il-ilce-mahalle.json
 * ile birebir aynı dosya — src/lib/turkeyAddressData.js'in native karşılığı)
 * bir kez okuyup bellekte tutar. Şekil: { "İL": { "İLÇE": ["Mahalle 1", ...] } }.
 *
 * BU DOSYA VAR OLMA SEBEBİ: electron/geocodeQuery.js'teki buildGeocodeAttempts
 * il/ilçe/mahalle olmadan ("adres bilgisi (mahalle/ilçe) eksik") geocoding'i
 * hiç DENEMİYOR bile — düz metin "Adres" alanı tek başına yeterli değil.
 * Masaüstü zaten bu dropdown'ları kullanıyor; mobilde de aynısı olmazsa
 * mobilden oluşturulan randevular asla haritada konumlanamaz.
 */
object TurkeyAddressData {
    private val mutex = Mutex()
    private var cached: Map<String, Map<String, List<String>>>? = null

    suspend fun load(context: Context): Map<String, Map<String, List<String>>> {
        cached?.let { return it }
        return mutex.withLock {
            cached?.let { return@withLock it }
            val result = withContext(Dispatchers.IO) {
                val text = context.assets.open("il-ilce-mahalle.json").bufferedReader().use { it.readText() }
                val root = Json.parseToJsonElement(text).jsonObject
                root.entries.associate { (il, ilceler) ->
                    il to (ilceler as JsonObject).entries.associate { (ilce, mahalleler) ->
                        ilce to (mahalleler as JsonArray).map { it.jsonPrimitive.content }
                    }
                }
            }
            cached = result
            result
        }
    }
}

/**
 * src/lib/turkeyAddressData.js'teki composeAddress ile birebir aynı mantık —
 * backend'e giden `address` düz metni her zaman bundan üretilir, elle
 * yazılmaz (aksi halde il/ilçe/mahalle ile tutarsız bir adres satırı oluşur).
 */
fun composeAddress(detail: AddressDetail): String {
    val parts = mutableListOf<String>()
    if (!detail.street.isNullOrBlank()) parts.add(detail.street)
    if (!detail.buildingName.isNullOrBlank()) parts.add(detail.buildingName)
    if (!detail.apartmentNo.isNullOrBlank()) parts.add("Daire ${detail.apartmentNo}")
    if (!detail.mahalle.isNullOrBlank()) parts.add("${detail.mahalle} Mahallesi")
    val cityLine = listOfNotNull(detail.ilce?.takeIf { it.isNotBlank() }, detail.il?.takeIf { it.isNotBlank() }).joinToString("/")
    if (cityLine.isNotBlank()) parts.add(cityLine)
    return parts.joinToString(", ")
}
