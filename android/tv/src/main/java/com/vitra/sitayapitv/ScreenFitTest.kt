package com.vitra.sitayapitv

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Ekrana sığma testi (kurulumda TV'nin görüntü boyutu ayarını kontrol etmek
 * için): beyaz çerçeve ekranın tam kenarında, kırmızı %2,5 içeride (TV'lerin
 * tipik kırpma payı), yeşil uygulamanın güvenli alanı. Beyaz çerçevenin dört
 * kenarı da görünmüyorsa TV görüntüyü kırpıyor demektir.
 * Açmak için: adb shell am start -S -n com.vitra.sitayapitv/.MainActivity --ez screenTest true
 */
@Composable
fun ScreenFitTest() {
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        Canvas(Modifier.fillMaxSize()) {
            val px = 1.dp.toPx()
            // Beyaz: ekranın tam kenarı (2 piksel kalınlık, içe doğru).
            drawRect(Color.White, topLeft = Offset(px, px), size = Size(size.width - 2 * px, size.height - 2 * px), style = Stroke(2 * px))
            // Kırmızı: %2,5 içeride.
            val ix = size.width * 0.025f
            val iy = size.height * 0.025f
            drawRect(Color(0xFFFF453A), topLeft = Offset(ix, iy), size = Size(size.width - 2 * ix, size.height - 2 * iy), style = Stroke(px))
            // Yeşil: uygulamanın güvenli alanı (yanlarda 40, üst/altta 30 birim).
            val sx = TvSafeSide.toPx()
            val sy = TvSafeVertical.toPx()
            drawRect(Color(0xFF30D158), topLeft = Offset(sx, sy), size = Size(size.width - 2 * sx, size.height - 2 * sy), style = Stroke(px))
            // Köşelerde kısa çapraz işaretler: köşenin gerçekten görünüp görünmediği.
            val c = 24 * px
            listOf(Offset(0f, 0f), Offset(size.width, 0f), Offset(0f, size.height), Offset(size.width, size.height)).forEach { o ->
                val dx = if (o.x == 0f) c else -c
                val dy = if (o.y == 0f) c else -c
                drawLine(Color.White, o, Offset(o.x + dx, o.y + dy), strokeWidth = 3 * px)
            }
        }
        Column(Modifier.align(Alignment.Center).padding(40.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            val style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = 18.sp, lineHeight = 26.sp, fontWeight = FontWeight.Medium, textAlign = TextAlign.Center)
            Text("Ekrana sığma testi", style = style.copy(fontSize = 26.sp, fontWeight = FontWeight.SemiBold))
            Text(
                "Beyaz çerçevenin dört kenarı ve köşelerdeki beyaz çizgiler görünmeli.\n" +
                    "Görünmüyorsa TV görüntüyü kırpıyor: TV'nin Görüntü > Ekran boyutu ayarını\n" +
                    "\"Tam piksel\", \"Ekrana sığdır\", \"Just Scan\" ya da \"Orijinal\" yapın.\n\n" +
                    "Kırmızı çerçeve: kenardan %2,5 içeride  ·  Yeşil çerçeve: uygulamanın güvenli alanı",
                style = style.copy(fontSize = 15.sp, lineHeight = 24.sp, color = Color(0xCCFFFFFF)),
            )
        }
    }
}
