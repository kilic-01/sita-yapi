package com.vitra.sitayapitv

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private val FlagRed = Color(0xFFE30A17)

/**
 * Türk bayrağı — resmi bayramlarda bekleme ekranındaki mesajın yanında.
 * Ölçüler Türk Bayrağı Kanunu tablosundan (G = en, boy 1,5G); Wikimedia'daki
 * Flag_of_Turkey.svg ile doğrulandı:
 *  • ay dış dairesi: merkezi direkten 1/2 G, çapı 1/2 G
 *  • ay iç dairesi: merkezler arası 1/16 G (merkez 0,5625 G), çapı 0,4 G
 *  • yıldız dairesi: çapı 1/4 G; sol kenarı ay iç dairesinin sol kenarından
 *    1/3 G uzakta (merkez 0,5625 − 0,2 + 1/3 + 0,125 = 0,8208 G); bir ucu aya bakar.
 */
@Composable
fun TurkishFlag(modifier: Modifier = Modifier) {
    Canvas(modifier.aspectRatio(1.5f)) {
        val g = size.height
        val cy = g / 2f
        drawRect(FlagRed)
        drawCircle(Color.White, radius = 0.25f * g, center = Offset(0.5f * g, cy))
        drawCircle(FlagRed, radius = 0.2f * g, center = Offset(0.5625f * g, cy))
        val starCx = (0.5625f - 0.2f + 1f / 3f + 0.125f) * g
        val outer = 0.125f * g
        // Düzgün beş köşeli yıldız: iç köşe yarıçapı = dış × 0,382.
        val inner = outer * 0.381966f
        val star = Path()
        for (i in 0 until 10) {
            // İlk uç sola (hilale) bakar.
            val angle = PI + i * PI / 5
            val r = if (i % 2 == 0) outer else inner
            val x = starCx + (r * cos(angle)).toFloat()
            val y = cy + (r * sin(angle)).toFloat()
            if (i == 0) star.moveTo(x, y) else star.lineTo(x, y)
        }
        star.close()
        drawPath(star, Color.White)
    }
}
