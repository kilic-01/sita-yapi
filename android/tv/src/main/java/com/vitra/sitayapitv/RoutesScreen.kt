package com.vitra.sitayapitv

import coil.compose.AsyncImage
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.runtime.setValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.LocalDate
import java.time.format.DateTimeFormatter

// Servis rotaları — masaüstündeki Rota Oluştur ekranından "TV'de Yayınla".
// Apple tvOS kuralları (bkz. ProductScreen.kt başındaki not): güvenli alan,
// tvOS yazı stilleri, Light/Thin yok, birincil/ikincil/üçüncül etiket renkleri.
// Liquid Glass/materyal kuralları (HIG Materials): Liquid Glass içerik
// katmanında kullanılmaz; tam ekran açık görünüm için tvOS'un önerdiği
// "ultra ince" standart materyal ARKA PLANDA: bekleme ekranı fotoğraflarından
// biri bütün ekranda bulanık ve açık tonlu (buzlu cam). Teknisyen sütunları bu
// zeminin üstünde düz, yarı saydam beyaz kartlar. Cam üstüne cam yok.
// Kişisel veri masaüstünde sınırlandırılır: kısaltılmış müşteri adı ve yalnız mahalle.

private val RouteLabelSecondary = Color(0x990E2A3B)
private val RouteLabelTertiary = Color(0x660E2A3B)
// Ultra ince materyal (açık görünüm): güçlü bulanıklık + açık ton.
private val RouteMaterialTint = FrostTint
private val RouteCardFill = Color(0x99FFFFFF)
private const val ROUTES_BACKDROP_DIR = "backgrounds"
private val RouteSeparator = Color(0x1F0E2A3B)
private val UrgentRed = Color(0xFFD9534F)

// Durak satırı yüksekliği durak sayısına göre kademeli: rahat (müşteri + semt
// iki satıra kadar), orta (müşteri + semt tek satır), sıkışık (tek satır).
// En sıkışığa da sığmayan duraklar için son satır "+N durak daha" olur.
private enum class StopDensity(val height: Dp) { ROOMY(60.dp), MEDIUM(42.dp), TIGHT(28.dp) }

private val stopNameStyle = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 14.5.sp, lineHeight = 18.sp, fontWeight = FontWeight.Medium)
private val stopAreaStyle = TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = 12.5.sp, lineHeight = 16.sp)

// Teknisyen adı tek satıra sığana kadar küçülür; en küçükte de sığmazsa iki satır.
private val TECH_NAME_SIZES = listOf(19f, 17f, 15.5f)

@Composable
fun RoutesScreen(routes: TvRoutes) {
    val context = LocalContext.current
    val techs = routes.technicians
    val totalStops = techs.sumOf { it.stops.size }
    val backdrop = remember(routes) {
        runCatching { context.assets.list(ROUTES_BACKDROP_DIR)?.filter { it.endsWith(".jpg") }?.randomOrNull() }.getOrNull()
            ?.let { "file:///android_asset/$ROUTES_BACKDROP_DIR/$it" }
    }
    Box(Modifier.fillMaxSize().background(Paper)) {
        // Arka plan: buzlu cam (bulanık fotoğraf + açık ton).
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().blur(40.dp, BlurredEdgeTreatment.Rectangle),
            )
        }
        Box(Modifier.fillMaxSize().background(RouteMaterialTint))
        Column(Modifier.fillMaxSize().padding(horizontal = TvSafeSide, vertical = TvSafeVertical)) {
            // Başlık: tarih (Title 2) + özet (ikincil renk)
            Row(verticalAlignment = Alignment.Bottom) {
                Column(Modifier.weight(1f)) {
                    Text(
                        "Servis Rotaları",
                        style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = TvCaption1, fontWeight = FontWeight.SemiBold),
                    )
                    Text(
                        formatRouteDate(routes.date),
                        style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 28.5.sp, lineHeight = 34.sp, fontWeight = FontWeight.Medium),
                    )
                }
                Text(
                    "${techs.size} teknisyen  ·  $totalStops durak",
                    style = TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = TvBody, fontWeight = FontWeight.Medium),
                )
            }
            Spacer(Modifier.height(18.dp))
            // 5+ teknisyende sütunlar daralır: aralık ve kart içi boşluk azaltılır ki adlara yer kalsın.
            val dense = techs.size >= 5
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(if (dense) 10.dp else 16.dp)) {
                techs.forEach { tech -> TechnicianColumn(tech, dense, Modifier.weight(1f).fillMaxHeight()) }
            }
        }
    }
}

@Composable
private fun TechnicianColumn(tech: TvRouteTechnician, dense: Boolean, modifier: Modifier) {
    val color = parseColor(tech.color)
    Column(
        modifier
            .clip(RoundedCornerShape(18.dp))
            .background(RouteCardFill)
            .padding(horizontal = if (dense) 10.dp else 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(8.dp))
            TechnicianName(tech.name, Modifier.weight(1f))
            if (tech.onLeave) {
                Text(
                    "İzinli",
                    style = TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = TvCaption2, fontWeight = FontWeight.Medium),
                    modifier = Modifier
                        .clip(RoundedCornerShape(999.dp))
                        .background(RouteSeparator)
                        .padding(horizontal = 8.dp, vertical = 2.dp),
                )
            }
        }
        Text(
            "${tech.stops.size} durak" + tech.stops.mapNotNull { it.minutes }.sum().takeIf { it > 0 }
                ?.let { "  ·  ~${formatMinutes(it)}" }.orEmpty(),
            style = TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = TvCaption1, fontWeight = FontWeight.Normal),
            modifier = Modifier.padding(start = 18.dp, top = 2.dp),
        )
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(RouteSeparator))
        Spacer(Modifier.height(4.dp))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            val n = tech.stops.size
            // Hepsinin sığdığı en rahat düzen; hiçbiri yetmezse en sıkışık + "+N durak daha".
            val density = StopDensity.entries.firstOrNull { it.height * n <= maxHeight } ?: StopDensity.TIGHT
            val fit = (maxHeight / density.height).toInt().coerceAtLeast(1)
            val shown = if (n <= fit) tech.stops else tech.stops.take(fit - 1)
            val hidden = n - shown.size
            Column {
                shown.forEach { stop -> StopRow(stop, color, density) }
                if (hidden > 0) {
                    Box(Modifier.height(density.height).fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                        Text(
                            "+$hidden durak daha",
                            style = TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = TvCaption1, fontWeight = FontWeight.Medium),
                        )
                    }
                }
            }
        }
    }
}

/** Teknisyen adı: tek satıra sığan en büyük boyut; en küçükte de sığmazsa iki satır — hiç kesilmez. */
@Composable
private fun TechnicianName(name: String, modifier: Modifier) {
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier) {
        val widthPx = constraints.maxWidth
        val size = remember(name, widthPx) {
            TECH_NAME_SIZES.firstOrNull { sz ->
                measurer.measure(name, techNameStyle(sz), maxLines = 1, softWrap = false).size.width <= widthPx
            }
        }
        Text(
            name,
            style = techNameStyle(size ?: TECH_NAME_SIZES.last()),
            maxLines = if (size == null) 2 else 1,
            softWrap = size == null,
        )
    }
}

private fun techNameStyle(size: Float) =
    TextStyle(fontFamily = Poppins, color = Ink, fontSize = size.sp, lineHeight = (size + 4f).sp, fontWeight = FontWeight.SemiBold)

@Composable
private fun StopRow(stop: TvRouteStop, color: Color, density: StopDensity) {
    val tight = density == StopDensity.TIGHT
    Row(
        Modifier.fillMaxWidth().height(density.height).alpha(if (stop.completed) 0.45f else 1f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        // Sıra numarası: teknisyen renginde daire; tamamlanan durakta onay işareti (çizim).
        Box(
            Modifier.size(if (tight) 18.dp else 22.dp).clip(CircleShape).background(color),
            contentAlignment = Alignment.Center,
        ) {
            if (stop.completed) {
                StopCheck(Modifier.size(if (tight) 10.dp else 12.dp))
            } else {
                Text(
                    stop.order.toString(),
                    style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = if (tight) 10.sp else 11.5.sp, fontWeight = FontWeight.SemiBold),
                    textAlign = TextAlign.Center,
                )
            }
        }
        Spacer(Modifier.width(8.dp))
        val area = listOfNotNull(stop.area.takeIf { it.isNotBlank() }, stop.minutes?.let { formatMinutes(it) }).joinToString("  ·  ")
        if (tight) {
            Text(
                stop.customer + if (stop.area.isNotBlank()) "  ·  ${stop.area}" else "",
                style = stopNameStyle.copy(fontSize = 12.5.sp, lineHeight = 16.sp),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        } else {
            Column(Modifier.weight(1f)) {
                Text(stop.customer, style = stopNameStyle, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (area.isNotBlank()) {
                    Text(
                        area,
                        style = stopAreaStyle,
                        // Rahat düzende semt iki satıra iner, kesilmez.
                        maxLines = if (density == StopDensity.ROOMY) 2 else 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (stop.urgent) {
            Spacer(Modifier.width(6.dp))
            Text(
                "Acil",
                style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = TvCaption2, fontWeight = FontWeight.SemiBold),
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(UrgentRed)
                    .padding(horizontal = 7.dp, vertical = 1.dp),
            )
        }
    }
}

/** Tamamlanan durak işareti — yazı karakteri değil çizim (Poppins'te ✓ yok). */
@Composable
private fun StopCheck(modifier: Modifier) {
    androidx.compose.foundation.Canvas(modifier) {
        val w = size.width
        val path = androidx.compose.ui.graphics.Path().apply {
            moveTo(w * 0.14f, w * 0.52f)
            lineTo(w * 0.40f, w * 0.78f)
            lineTo(w * 0.88f, w * 0.24f)
        }
        drawPath(
            path,
            Color.White,
            style = androidx.compose.ui.graphics.drawscope.Stroke(
                width = w * 0.16f,
                cap = androidx.compose.ui.graphics.StrokeCap.Round,
                join = androidx.compose.ui.graphics.StrokeJoin.Round,
            ),
        )
    }
}

internal fun parseColor(hex: String): Color =
    runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrDefault(RouteLabelTertiary)

private fun formatMinutes(total: Int): String =
    if (total < 60) "$total dk" else "${total / 60} sa" + (total % 60).takeIf { it > 0 }?.let { " $it dk" }.orEmpty()

internal fun formatRouteDate(iso: String): String = runCatching {
    val date = LocalDate.parse(iso)
    val day = date.format(DateTimeFormatter.ofPattern("d MMMM EEEE", turkish))
    when (date) {
        LocalDate.now() -> "Bugün, $day"
        LocalDate.now().plusDays(1) -> "Yarın, $day"
        else -> day
    }
}.getOrDefault(iso)
