package com.vitra.sitayapitv

import coil.compose.AsyncImage
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import kotlinx.coroutines.delay
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
import androidx.compose.foundation.layout.offset
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
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.unit.Density
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
// iki satıra kadar), orta ve sıkışık (müşteri + altında tek satır semt; semt
// sığana kadar küçülür). En sıkışığa da sığmayan duraklar için son satır "+N durak daha" olur.
private enum class StopDensity(val height: Dp) { ROOMY(60.dp), MEDIUM(42.dp), TIGHT(32.dp) }

// Satır yükseklikleri Poppins'in alt uzantılarına (ğ, y, ş, ç) yer bırakır: "…" ile kesilen
// yazılar satır sınırına kırpıldığı için dar satır yüksekliği harflerin altını keser.
private val stopNameStyle = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 14.5.sp, lineHeight = 20.sp, fontWeight = FontWeight.Medium)
private val stopAreaStyle = TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = 12.5.sp, lineHeight = 17.5.sp)

// Teknisyen adı ve altındaki "N durak" satırı tek satıra sığana kadar
// küçülür (en küçükte de sığmazsa sonu "…"). Satır yükseklikleri sabit: her
// sütunun başlığı aynı yükseklikte, listeler aynı çizgiden başlar.
private const val ROUTE_PAGE_SECONDS = 10
// Bu genişlikte (4 teknisyen) kart tam boyutta; daha dar kartlar orantılı küçülür.
private val ROUTE_COLUMN_REF_WIDTH = 200.dp
private const val ROUTE_MIN_SCALE = 0.5f
// Tek sayfaya sığdırmak için en fazla bu orana kadar ek küçülme (%80); daha fazlası gerekirse sayfalanır.
private const val ROUTE_FIT_SHRINK = 0.8f
// Kartın durak listesi dışındaki yüksekliği: iç boşluk, ad, "N durak", ayırıcı (+ küçük pay).
private val ROUTE_CARD_CHROME = 90.dp
private val TECH_NAME_SIZES = listOf(19f, 17f, 15.5f, 14f, 13f, 12f)
private val TECH_META_SIZES = listOf(12.5f, 11.5f, 10.5f, 9.5f)
// Semt (müşteri adının altında): orta ve sıkışık düzende sığana kadar küçülür.
private val AREA_SIZES_MEDIUM = listOf(12.5f, 11.5f, 10.5f, 9.5f)
private val AREA_SIZES_TIGHT = listOf(11f, 10f, 9f)

@Composable
fun RoutesScreen(routes: TvRoutes, sentFrom: String = "") {
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
                        "Randevu Rotaları",
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
            // 5+ teknisyende sütunlar daralır: aralık azalır, kart içeriği orantılı küçülür (TechnicianColumn).
            val dense = techs.size >= 5
            Row(Modifier.weight(1f).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(if (dense) 10.dp else 16.dp)) {
                techs.forEach { tech -> TechnicianColumn(tech, Modifier.weight(1f).fillMaxHeight()) }
            }
        }
        // Yayını yapan bilgisayar: alt güvenli alan boşluğunda, sağ kenara hizalı.
        SentFromTag(sentFrom, Modifier.align(Alignment.BottomEnd).padding(end = TvSafeSide).height(TvSafeVertical))
    }
}

@Composable
private fun TechnicianColumn(tech: TvRouteTechnician, modifier: Modifier) {
    val color = parseColor(tech.color)
    // Orantılı küçülme: kart ROUTE_COLUMN_REF_WIDTH'ten darsa içindeki her şey
    // (yazılar, daireler, boşluklar, satır yükseklikleri) aynı oranda küçülür —
    // 6–8 teknisyende de kart, 4 teknisyendeki kartın küçültülmüş hali gibi görünür.
    BoxWithConstraints(modifier) {
        val widthScale = (maxWidth / ROUTE_COLUMN_REF_WIDTH).coerceIn(ROUTE_MIN_SCALE, 1f)
        // Sayfaya az durak taşıyorsa (biraz daha küçültmek yetiyorsa) ikinci sayfa
        // açmak yerine hepsi tek sayfaya sığacak kadar küçülür; fark büyükse sayfalanır.
        val done = tech.stops.count { it.completed }
        val rowsNeeded = if (done > 0) tech.stops.size - done + 1 else tech.stops.size
        val fitScale = maxHeight / (ROUTE_CARD_CHROME + StopDensity.TIGHT.height * rowsNeeded)
        val scale = if (fitScale < widthScale && fitScale >= widthScale * ROUTE_FIT_SHRINK && fitScale >= ROUTE_MIN_SCALE) fitScale else widthScale
        val base = LocalDensity.current
        CompositionLocalProvider(LocalDensity provides Density(base.density * scale, base.fontScale)) {
            TechnicianCard(tech, color)
        }
    }
}

@Composable
private fun TechnicianCard(tech: TvRouteTechnician, color: Color) {
    Column(
        Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(18.dp))
            .background(RouteCardFill)
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(10.dp).clip(CircleShape).background(color))
            Spacer(Modifier.width(8.dp))
            FitLine(tech.name, TECH_NAME_SIZES, ::techNameStyle, Modifier.weight(1f))
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
        FitLine(
            "${tech.stops.size} durak",
            TECH_META_SIZES,
            ::techMetaStyle,
            Modifier.fillMaxWidth().padding(start = 18.dp, top = 2.dp),
        )
        Spacer(Modifier.height(10.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(RouteSeparator))
        Spacer(Modifier.height(4.dp))
        BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
            // Yoğun gün: duraklar en sıkışık düzende bile sığmıyorsa tamamlananlar
            // tek satırda toplanır ("✓ 3 tamamlandı"), yer sıradaki işlere kalır.
            val done = tech.stops.count { it.completed }
            val collapse = done > 0 && StopDensity.TIGHT.height * tech.stops.size > maxHeight
            val stops = if (collapse) tech.stops.filterNot { it.completed } else tech.stops
            val extra = if (collapse) 1 else 0
            // Hepsinin sığdığı en rahat düzen; hiçbiri yetmezse en sıkışık düzende
            // sayfalara bölünür ve ROUTE_PAGE_SECONDS'ta bir döner. Sayfa göstergesi
            // ("1 / 2") satır kaplamaz: kartın sağ alt köşesinde, alt boşlukta, küçük.
            val density = StopDensity.entries.firstOrNull { it.height * (stops.size + extra) <= maxHeight } ?: StopDensity.TIGHT
            val rows = (maxHeight / density.height).toInt()
            val perPage = (rows - extra).coerceAtLeast(1)
            val pages = stops.chunked(perPage).ifEmpty { listOf(emptyList()) }
            var page by remember(tech, perPage) { mutableStateOf(0) }
            LaunchedEffect(tech, pages.size) {
                if (pages.size < 2) return@LaunchedEffect
                while (true) {
                    delay(ROUTE_PAGE_SECONDS * 1_000L)
                    page = (page + 1) % pages.size
                }
            }
            Column(Modifier.fillMaxSize()) {
                if (collapse) DoneSummaryRow(done, color, density)
                Crossfade(targetState = page.coerceIn(0, pages.lastIndex), animationSpec = tween(500), label = "route-page") { p ->
                    Column { pages[p].forEach { stop -> StopRow(stop, color, density) } }
                }
            }
            if (pages.size > 1) {
                Text(
                    "${page + 1} / ${pages.size}",
                    style = TextStyle(fontFamily = Poppins, color = RouteLabelTertiary, fontSize = 9.5.sp, lineHeight = 11.sp, fontWeight = FontWeight.Medium),
                    modifier = Modifier.align(Alignment.BottomEnd).offset(y = 9.dp),
                )
            }
        }
    }
}

/**
 * Tek satır: sığan en büyük boyut; en küçükte de sığmazsa sonu "…". Yükseklik
 * en büyük boyuta göre sabit — boyut küçülse de satır (ve altındakiler) kaymaz.
 */
@Composable
private fun FitLine(text: String, sizes: List<Float>, style: (Float) -> TextStyle, modifier: Modifier) {
    val measurer = rememberTextMeasurer()
    val lineHeight = with(LocalDensity.current) { style(sizes.first()).lineHeight.toDp() }
    BoxWithConstraints(modifier.height(lineHeight), contentAlignment = Alignment.CenterStart) {
        val widthPx = constraints.maxWidth
        val size = remember(text, widthPx) {
            sizes.firstOrNull { sz -> measurer.measure(text, style(sz), maxLines = 1, softWrap = false).size.width <= widthPx }
        }
        Text(text, style = style(size ?: sizes.last()), maxLines = 1, softWrap = false, overflow = TextOverflow.Ellipsis)
    }
}

private fun techNameStyle(size: Float) =
    TextStyle(fontFamily = Poppins, color = Ink, fontSize = size.sp, lineHeight = (size * 1.35f).sp, fontWeight = FontWeight.SemiBold)

private fun stopAreaSized(size: Float) = stopAreaStyle.copy(fontSize = size.sp, lineHeight = (size * 1.4f).sp)

private fun techMetaStyle(size: Float) =
    TextStyle(fontFamily = Poppins, color = RouteLabelSecondary, fontSize = size.sp, lineHeight = (size * 1.4f).sp, fontWeight = FontWeight.Normal)

/** Yoğun günde tamamlanan durakların yerine tek satır: onay işareti + "N tamamlandı" (soluk). */
@Composable
private fun DoneSummaryRow(count: Int, color: Color, density: StopDensity) {
    val tight = density == StopDensity.TIGHT
    Row(
        Modifier.fillMaxWidth().height(density.height).alpha(0.45f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(if (tight) 18.dp else 22.dp).clip(CircleShape).background(color),
            contentAlignment = Alignment.Center,
        ) {
            StopCheck(Modifier.size(if (tight) 10.dp else 12.dp))
        }
        Spacer(Modifier.width(8.dp))
        Text(
            "$count tamamlandı",
            style = if (tight) stopNameStyle.copy(fontSize = 12.5.sp, lineHeight = 17.sp) else stopNameStyle,
            maxLines = 1,
        )
    }
}

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
        val area = stop.area
        Column(Modifier.weight(1f)) {
            Text(
                stop.customer,
                style = if (tight) stopNameStyle.copy(fontSize = 12.5.sp, lineHeight = 17.sp) else stopNameStyle,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (area.isNotBlank()) {
                if (density == StopDensity.ROOMY) {
                    // Rahat düzende semt iki satıra iner, kesilmez.
                    Text(area, style = stopAreaStyle, maxLines = 2, overflow = TextOverflow.Ellipsis)
                } else {
                    FitLine(
                        area,
                        if (tight) AREA_SIZES_TIGHT else AREA_SIZES_MEDIUM,
                        ::stopAreaSized,
                        Modifier.fillMaxWidth(),
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

internal fun formatRouteDate(iso: String): String = runCatching {
    val date = LocalDate.parse(iso)
    val day = date.format(DateTimeFormatter.ofPattern("d MMMM EEEE", turkish))
    when (date) {
        LocalDate.now() -> "Bugün, $day"
        LocalDate.now().plusDays(1) -> "Yarın, $day"
        else -> day
    }
}.getOrDefault(iso)
