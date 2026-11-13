package com.vitra.sitayapitv

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage

// Günlük özet panosu — yalnız ofis modundaki TV'lerde (kişisel veri yok ama
// iş yükü bilgisi müşteriye gösterilmez). Rotalar ekranıyla aynı dil: arka
// planda buzlu cam, üstünde düz yarı saydam beyaz kartlar. Masaüstü pano
// yayındayken veriyi dakikada bir tazeler.

private val DashSecondary = Color(0x990E2A3B)
private val DashTint = FrostTint
private val DashCard = Color(0x99FFFFFF)
private val DashTrack = Color(0x1F0E2A3B)
private val DashUrgent = Color(0xFFD9534F)

@Composable
fun DashboardScreen(d: TvDashboard, sentFrom: String = "") {
    val context = LocalContext.current
    val backdrop = remember(d) {
        runCatching { context.assets.list("backgrounds")?.filter { it.endsWith(".jpg") }?.randomOrNull() }.getOrNull()
            ?.let { "file:///android_asset/backgrounds/$it" }
    }
    Box(Modifier.fillMaxSize().background(Paper)) {
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().blur(40.dp, BlurredEdgeTreatment.Rectangle),
            )
        }
        Box(Modifier.fillMaxSize().background(DashTint))
        Column(Modifier.fillMaxSize().padding(horizontal = TvSafeSide, vertical = TvSafeVertical)) {
            Text(
                "Günlük Özet",
                style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = TvCaption1, fontWeight = FontWeight.SemiBold),
            )
            Text(
                formatRouteDate(d.date),
                style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 28.5.sp, lineHeight = 34.sp, fontWeight = FontWeight.Medium),
            )
            Spacer(Modifier.height(18.dp))
            // Üst sıra: büyük sayılar.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                StatCard("Bugünkü Servis", "${d.appointmentsToday}", "${d.completedToday} tamamlandı", Modifier.weight(1f))
                StatCard("Acil", "${d.urgentToday}", "bugün", Modifier.weight(1f), valueColor = if (d.urgentToday > 0) DashUrgent else Ink)
                StatCard("Atanmamış", "${d.unassignedToday}", "bugün", Modifier.weight(1f))
                StatCard("Yarın", "${d.appointmentsTomorrow}", "servis", Modifier.weight(1f))
                StatCard("Bekleyen Parça", "${d.pendingParts}", "${d.partsArrived} geldi", Modifier.weight(1f))
            }
            Spacer(Modifier.height(16.dp))
            // Alt: teknisyen başına ilerleme.
            Column(
                Modifier
                    .weight(1f)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(18.dp))
                    .background(DashCard)
                    .padding(horizontal = 18.dp, vertical = 14.dp),
            ) {
                Text(
                    "Teknisyenler",
                    style = TextStyle(fontFamily = Poppins, color = DashSecondary, fontSize = TvCaption1, fontWeight = FontWeight.Medium),
                )
                Spacer(Modifier.height(8.dp))
                val techs = d.technicians
                if (techs.isEmpty()) {
                    Text("Bugün atanmış servis yok.", style = TextStyle(fontFamily = Poppins, color = DashSecondary, fontSize = TvBody))
                } else {
                    // Çok teknisyende iki sütun.
                    val columns = if (techs.size > 6) 2 else 1
                    val perColumn = (techs.size + columns - 1) / columns
                    Row(Modifier.fillMaxSize(), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        techs.chunked(perColumn).forEach { chunk ->
                            Column(Modifier.weight(1f).fillMaxHeight(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                chunk.forEach { TechProgress(it) }
                            }
                        }
                    }
                }
            }
        }
        // Yayını yapan bilgisayar: alt güvenli alan boşluğunda, sağ kenara hizalı.
        SentFromTag(sentFrom, Modifier.align(Alignment.BottomEnd).padding(end = TvSafeSide).height(TvSafeVertical))
    }
}

@Composable
private fun StatCard(label: String, value: String, sub: String, modifier: Modifier, valueColor: Color = Ink) {
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(DashCard)
            .padding(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Text(label, style = TextStyle(fontFamily = Poppins, color = DashSecondary, fontSize = TvCaption1, fontWeight = FontWeight.Medium), maxLines = 1)
        Text(value, style = TextStyle(fontFamily = Poppins, color = valueColor, fontSize = 38.sp, lineHeight = 44.sp, fontWeight = FontWeight.SemiBold))
        Text(sub, style = TextStyle(fontFamily = Poppins, color = DashSecondary, fontSize = TvCaption2, fontWeight = FontWeight.Normal), maxLines = 1)
    }
}

@Composable
private fun TechProgress(t: TvDashboardTech) {
    val color = parseColor(t.color)
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(9.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(8.dp))
        Text(
            t.name,
            style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = TvBody, fontWeight = FontWeight.Medium),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(150.dp),
        )
        if (t.onLeave) {
            Text("İzinli", style = TextStyle(fontFamily = Poppins, color = DashSecondary, fontSize = TvCaption1))
        } else {
            val fraction = if (t.total > 0) t.completed.toFloat() / t.total else 0f
            Box(Modifier.weight(1f).height(8.dp).clip(RoundedCornerShape(999.dp)).background(DashTrack)) {
                Box(Modifier.fillMaxHeight().fillMaxWidth(fraction).clip(RoundedCornerShape(999.dp)).background(color))
            }
            Spacer(Modifier.width(12.dp))
            Text(
                "${t.completed}/${t.total}",
                style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = TvBody, fontWeight = FontWeight.SemiBold),
                modifier = Modifier.width(48.dp),
            )
        }
    }
}
