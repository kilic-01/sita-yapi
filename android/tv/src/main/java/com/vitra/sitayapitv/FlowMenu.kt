package com.vitra.sitayapitv

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.layout.size
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Kumanda menüsünün bir satırı: ekran akışı seçimi ya da güncellemeyi kur. */
data class FlowMenuItem(val title: String, val subtitle: String, val mode: FlowMode? = null, val action: MenuAction = MenuAction.FLOW)

enum class MenuAction { FLOW, UPDATE, INFO }

fun flowMenuItems(update: UpdateState): List<FlowMenuItem> = buildList {
    add(FlowMenuItem("Normal", "Fotoğraflar, hava durumu ve videolar sırayla", FlowMode.NORMAL))
    add(FlowMenuItem("Hava durumu", "Sürekli hava durumu sayfası", FlowMode.WEATHER))
    add(FlowMenuItem("Video", "Sürekli VitrA videoları", FlowMode.VIDEO))
    when (update) {
        is UpdateState.Available -> add(FlowMenuItem("Güncellemeyi kur", "Yeni sürüm ${update.version}", action = MenuAction.UPDATE))
        is UpdateState.Failed -> add(FlowMenuItem("Güncellemeyi kur", "Yeniden dene — ${update.retry.version}", action = MenuAction.UPDATE))
        else -> Unit
    }
    add(FlowMenuItem("Bilgi", "Sürüm, bağlantı ve cihaz bilgileri", action = MenuAction.INFO))
}

private val MenuMaterial = Color(0xD91C1C1E)
private val MenuSecondary = Color(0x99FFFFFF)
private val MenuTertiary = Color(0x66FFFFFF)

/**
 * OK tuşuyla açılan menü (tvOS stili): ekran hafif karartılır, ortada koyu
 * materyal kart. Odaktaki satır beyaz zeminli, seçili akışın yanında ✓.
 * Yukarı/aşağı gezinme, OK seçim, Geri kapatır; 10 sn tuşa basılmazsa kapanır.
 */
@Composable
fun FlowMenu(items: List<FlowMenuItem>, focused: Int, active: FlowMode) {
    Box(Modifier.fillMaxSize().background(Color(0x66000000)), contentAlignment = Alignment.Center) {
        Column(
            Modifier
                .width(320.dp)
                .clip(RoundedCornerShape(22.dp))
                .background(MenuMaterial)
                .padding(horizontal = 12.dp, vertical = 14.dp),
        ) {
            Text(
                "Ekran akışı",
                style = TextStyle(fontFamily = Poppins, color = MenuSecondary, fontSize = TvCaption1, fontWeight = FontWeight.Medium),
                modifier = Modifier.padding(start = 10.dp, bottom = 8.dp),
            )
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items.forEachIndexed { i, item ->
                    val isFocused = i == focused
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(12.dp))
                            .background(if (isFocused) Color.White else Color.Transparent)
                            .padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(
                                item.title,
                                style = TextStyle(
                                    fontFamily = Poppins, fontSize = TvCallout, fontWeight = FontWeight.Medium,
                                    color = if (isFocused) Ink else Color.White,
                                ),
                            )
                            Text(
                                item.subtitle,
                                style = TextStyle(
                                    fontFamily = Poppins, fontSize = TvCaption2, fontWeight = FontWeight.Normal,
                                    color = if (isFocused) Muted else MenuSecondary,
                                ),
                            )
                        }
                        if (item.mode != null && item.mode == active) {
                            CheckMark(if (isFocused) Accent else Color.White)
                        }
                    }
                }
            }
            Spacer(Modifier.height(10.dp))
            Text(
                "OK: seç  ·  Geri: kapat",
                style = TextStyle(fontFamily = Poppins, color = MenuTertiary, fontSize = TvCaption2),
                modifier = Modifier.padding(start = 10.dp),
            )
        }
    }
}

/** Seçili akış işareti — yazı karakteri değil çizim (Poppins'te ✓ yok). */
@Composable
private fun CheckMark(color: Color) {
    Canvas(Modifier.size(14.dp)) {
        val w = size.width
        val path = Path().apply {
            moveTo(w * 0.12f, w * 0.52f)
            lineTo(w * 0.40f, w * 0.80f)
            lineTo(w * 0.90f, w * 0.22f)
        }
        drawPath(path, color, style = Stroke(width = w * 0.14f, cap = StrokeCap.Round, join = StrokeJoin.Round))
    }
}
