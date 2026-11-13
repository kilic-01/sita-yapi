package com.vitra.sitayapitv

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Hizmetlerimiz sayfasının ikonları — masaüstündeki Lucide ikonlarının
 * (ISC lisansı) vektör yolları; TV'ye ikon kütüphanesi eklemeden çizilir.
 * Çizgi tabanlı, 24×24, kalınlık 2, yuvarlak uçlar (Lucide ile aynı).
 */
object ServiceIcons {
    private val PATHS: Map<String, List<String>> = mapOf(
        "bath" to listOf(
            "M10 4 8 6", "M17 19v2", "M2 12h20", "M7 19v2",
            "M9 5 7.621 3.621A2.121 2.121 0 0 0 4 5v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5",
        ),
        "wrench" to listOf(
            "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z",
        ),
        "package" to listOf(
            "M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z",
            "M12 22V12", "m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7", "m7.5 4.27 9 5.15",
        ),
        "shield" to listOf(
            "M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z",
            "m9 12 2 2 4-4",
        ),
        "truck" to listOf(
            "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2", "M15 18H9",
            "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14",
            "M19 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0", "M9 18a2 2 0 1 1-4 0a2 2 0 1 1 4 0",
        ),
        "ruler" to listOf(
            "M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z",
            "m14.5 12.5 2-2", "m11.5 9.5 2-2", "m8.5 6.5 2-2", "m17.5 15.5 2-2",
        ),
        "house" to listOf(
            "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8",
            "M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
        ),
        "message" to listOf("M7.9 20A9 9 0 1 0 4 16.1L2 22Z"),
        "droplet" to listOf(
            "M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
        ),
        "check" to listOf("M21.801 10A10 10 0 1 1 17 3.335", "m9 11 3 3L22 4"),
        // İletişim satırı
        "phone" to listOf(
            "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z",
        ),
        "globe" to listOf(
            "M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20", "M2 12h20",
        ),
        // Ürün ekranında yayını yapan bilgisayarın adının yanında.
        "airplay" to listOf("M5 17H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1", "m12 15 5 6H7Z"),
        "pin" to listOf(
            "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0",
            "M15 10a3 3 0 1 1-6 0a3 3 0 1 1 6 0",
        ),
    )

    // Hizmet başlığından ikon (masaüstünde "Otomatik" seçiliyse).
    private val AUTO = listOf(
        Regex("montaj|kurulum|banyo", RegexOption.IGNORE_CASE) to "bath",
        Regex("servis|bakım|arıza|tamir", RegexOption.IGNORE_CASE) to "wrench",
        Regex("parça|ürün|stok|malzeme", RegexOption.IGNORE_CASE) to "package",
        Regex("garanti|güvence", RegexOption.IGNORE_CASE) to "shield",
        Regex("teslimat|nakliye|kargo|sevkiyat", RegexOption.IGNORE_CASE) to "truck",
        Regex("keşif|ölçü|ölçüm|proje", RegexOption.IGNORE_CASE) to "ruler",
        Regex("tadilat|yenileme|anahtar teslim", RegexOption.IGNORE_CASE) to "house",
        Regex("danış|destek|iletişim|tasarım", RegexOption.IGNORE_CASE) to "message",
        Regex("tesisat|su |sıhhi|kaçak", RegexOption.IGNORE_CASE) to "droplet",
    )

    fun forService(item: TvServiceItem): ImageVector =
        get(item.icon.takeIf { it.isNotBlank() && it != "auto" } ?: AUTO.firstOrNull { it.first.containsMatchIn(item.title) }?.second ?: "check")

    private val cache = mutableMapOf<String, ImageVector>()

    fun get(name: String): ImageVector = cache.getOrPut(name) {
        val paths = PATHS[name] ?: PATHS.getValue("check")
        ImageVector.Builder(name = name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
            .apply {
                paths.forEach { d ->
                    addPath(
                        pathData = addPathNodes(d),
                        fill = null,
                        stroke = SolidColor(Color.Black),
                        strokeLineWidth = 2f,
                        strokeLineCap = StrokeCap.Round,
                        strokeLineJoin = StrokeJoin.Round,
                    )
                }
            }
            .build()
    }
}
