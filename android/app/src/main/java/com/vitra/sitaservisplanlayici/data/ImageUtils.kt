package com.vitra.sitaservisplanlayici.data

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64

/**
 * `AppUser.photo`/`Appointment` gibi alanlarda gelen "data:image/...;base64,..."
 * URL'lerini çözer. Coil'in `AsyncImage`'ı bu şemayı desteklemiyor (http/file/
 * content dışındaki URI'leri anlamıyor) — bu yüzden ekranlarda base64'ü
 * doğrudan burada Bitmap'e çeviriyoruz.
 */
fun decodeDataUrlBitmap(dataUrl: String?): Bitmap? {
    if (dataUrl.isNullOrBlank()) return null
    return try {
        val base64 = dataUrl.substringAfter("base64,", missingDelimiterValue = "")
        if (base64.isEmpty()) return null
        val bytes = Base64.decode(base64, Base64.DEFAULT)
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
    } catch (_: Exception) {
        null
    }
}
