package com.vitra.sitayapitv

import android.graphics.Bitmap
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.BlurredEdgeTreatment
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import coil.compose.SubcomposeAsyncImage
import coil.imageLoader
import coil.request.ImageRequest
import coil.size.Size
import coil.transform.Transformation
import kotlinx.coroutines.delay
import java.text.NumberFormat

// Birden fazla fotoğraflı üründe slider geçiş süresi.
private const val SLIDE_SECONDS = 5
private const val SPEC_LIMIT = 8
// Bekleme ekranındaki VitrA koleksiyon fotoğrafları (bkz. MainActivity IdleScreen).
private const val BACKDROP_DIR = "backgrounds"

// Apple İnsan Arayüzü Yönergeleri (HIG) — tvOS ölçüleri. Apple TV 1920x1080
// noktalık tuval kullanır, bizim tuvalimiz 960x540 dp: tüm değerler yarıya
// çevrildi (bkz. MainActivity FixedCanvas).
//  • Güvenli alan: üst/alt 60 pt, yanlar 80 pt  → 30 / 40 dp
//  • İki sütun ızgara: 860 pt sütun, 40 pt aralık → 430 / 20 dp
//  • Yazı stilleri (tvOS): Title 2 57 pt, Headline 38, Callout 31, Body 29,
//    Caption 1 25, Caption 2 23 (en küçük) → 28.5 / 19 / 15.5 / 14.5 / 12.5 / 11.5 sp
//  • Light/Thin kalınlık yok: Regular, Medium, Semibold
//  • Liquid Glass içerik katmanında kullanılmaz; tam ekran açık görünüm için
//    "ultra ince" standart materyal (bulanık arka plan + açık ton). Yazılar,
//    materyal üstünde birincil/ikincil/üçüncül (vibrant) etiket renkleriyle.
private val SafeTop = 30.dp
private val SafeSide = 40.dp
private val ColumnGap = 20.dp
private val PanelCorner = 16.dp

private val LabelPrimary = Ink
private val LabelSecondary = Color(0x990E2A3B)   // ~%60
private val LabelTertiary = Color(0x4D0E2A3B)    // ~%30
private val Separator = Color(0x290E2A3B)
private val SecondaryFill = Color(0x1F0E2A3B)

// Ultra ince materyal: arka plan güçlü bulanıklık + açık ton.
private val MaterialTint = Color(0x8CF5F7F8)

private fun captionStyle(color: Color = LabelSecondary) =
    TextStyle(fontFamily = Poppins, color = color, fontSize = 12.5.sp, lineHeight = 16.sp, fontWeight = FontWeight.Medium)

/** Masaüstündeki Stok sayfasından ya da VitrA kartından "TV'de Yayınla" ile gönderilen ürün. */
@Composable
fun ProductScreen(product: TvProduct) {
    val context = LocalContext.current
    // Her ürün için bekleme ekranı fotoğraflarından biri arka plan olur.
    val backdrop = remember(product) {
        runCatching { context.assets.list(BACKDROP_DIR)?.filter { it.endsWith(".jpg") }?.randomOrNull() }.getOrNull()
            ?.let { "file:///android_asset/$BACKDROP_DIR/$it" }
    }
    val images = remember(product) { product.images.ifEmpty { listOf(product.imageUrl) }.filter { it.isNotBlank() } }
    // Sıra: fotoğraflar → ürün videosu (varsa). VitrA'nın sitedeki fotoğrafları
    // arasında teknik çizim de var, ayrıca çizim slaytı gerekmiyor.
    val hasVideo = product.videoId.isNotBlank()
    val slideCount = images.size + (if (hasVideo) 1 else 0)
    var index by remember(product) { mutableStateOf(0) }
    var loadTick by remember(product) { mutableStateOf(0) }
    val isVideoSlide = hasVideo && index == images.size
    // Otomatik geçiş; kumandayla elle geçilince süre baştan başlar (index anahtar).
    // Video slaytında süre yok — video bitince sıradakine geçilir.
    LaunchedEffect(slideCount, index) {
        if (slideCount < 2 || isVideoSlide) return@LaunchedEffect
        // Sıradakini önceden indir ki geçişte boş kare görünmesin.
        val next = (index + 1) % slideCount
        images.getOrNull(next)?.let { context.imageLoader.enqueue(productImageRequest(context, it)) }
        delay(SLIDE_SECONDS * 1_000L)
        index = next
    }
    // Kumanda: sağ/sol ile fotoğraflar ve çizimler arasında gezinme.
    LaunchedEffect(slideCount) {
        RemoteKeys.events.collect { key ->
            if (slideCount < 2) return@collect
            when (key) {
                RemoteKey.LEFT -> index = (index - 1 + slideCount) % slideCount
                RemoteKey.RIGHT -> index = (index + 1) % slideCount
                else -> Unit
            }
        }
    }

    Box(Modifier.fillMaxSize().background(Paper)) {
        // Tam ekran ultra ince materyal.
        if (backdrop != null) {
            AsyncImage(
                model = backdrop,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().blur(40.dp, BlurredEdgeTreatment.Rectangle),
            )
        }
        Box(Modifier.fillMaxSize().background(MaterialTint))

        Row(
            Modifier.fillMaxSize().padding(horizontal = SafeSide, vertical = SafeTop),
            horizontalArrangement = Arrangement.spacedBy(ColumnGap),
        ) {
            // Sol sütun: ürün fotoğrafı (katalog görselleri beyaz zeminli).
            Box(
                Modifier
                    .weight(1f)
                    .fillMaxHeight()
                    .clip(RoundedCornerShape(PanelCorner))
                    .background(Paper),
                contentAlignment = Alignment.Center,
            ) {
                if (slideCount == 0) {
                    NoProductImage()
                } else {
                    Crossfade(targetState = index.coerceIn(0, slideCount - 1), animationSpec = tween(900), label = "product-slide") { i ->
                        when {
                            i < images.size -> ProductImage(images[i], product.name, onLoaded = { loadTick++ })
                            else -> ProductVideo(
                                product.videoId,
                                onEnded = {
                                    // Bitti, açılamadı ya da 5 dakikadan uzun: sıradakine geç.
                                    if (index == images.size) index = (index + 1) % slideCount
                                },
                                modifier = Modifier.fillMaxSize(),
                            )
                        }
                    }
                    if (slideCount > 1) {
                        // Fotoğraf yüklenince (loadTick) beyaz zeminli mi olduğu belli olur.
                        val onLight = remember(index, loadTick) {
                            images.getOrNull(index)?.let { TrimWhitespace.wasCutout(it) } ?: false
                        }
                        SlideDots(slideCount, index, onLight, Modifier.align(Alignment.BottomCenter).padding(bottom = 14.dp))
                    }
                }
            }
            // Sağ sütun: bilgiler — önem sırasına göre yukarıdan aşağıya. Özellik
            // maddeleri, başlık/kod/logodan kalan yüksekliğe göre yerleşir (FeatureArea).
            BoxWithConstraints(Modifier.weight(1f).fillMaxHeight().padding(start = 12.dp)) {
                val density = LocalDensity.current
                val columnWidth = maxWidth
                val columnHeight = maxHeight
                var headerHeight by remember(product) { mutableStateOf<Dp?>(null) }
                var logoHeight by remember { mutableStateOf<Dp?>(null) }
                Column(Modifier.fillMaxSize()) {
                    Spacer(Modifier.weight(1f))
                    ProductInfo(product, Modifier.onSizeChanged { headerHeight = with(density) { it.height.toDp() } })
                    val header = headerHeight
                    val logo = logoHeight
                    if (product.features.isNotEmpty() && header != null && logo != null) {
                        Spacer(Modifier.height(FeatureGap))
                        FeatureArea(
                            features = product.features,
                            width = columnWidth,
                            // Üstte ve altta en az FeatureMargin boşluk kalsın.
                            budget = columnHeight - header - logo - FeatureGap - FeatureMargin * 2,
                        )
                    }
                    Spacer(Modifier.weight(1f))
                    // Boşluksuz logo: sağ ve alt güvenli alan çizgisine (fotoğraf panelinin alt kenarı) oturur.
                    Image(
                        painter = painterResource(R.drawable.logo_color_tight),
                        contentDescription = null,
                        modifier = Modifier
                            .align(Alignment.End)
                            .width(59.dp)
                            .onSizeChanged { logoHeight = with(density) { it.height.toDp() } },
                    )
                }
            }
        }
    }
}

@Composable
private fun ProductInfo(product: TvProduct, modifier: Modifier = Modifier) {
    val (title, specs) = remember(product.name) { splitProductName(product.name.ifBlank { product.code }) }
    Column(modifier) {
        if (product.category.isNotBlank()) {
            Text(product.category, style = captionStyle(), maxLines = 1, overflow = TextOverflow.Ellipsis)
            Spacer(Modifier.height(6.dp))
        }
        AutoFitTitle(title)
        if (specs.isNotEmpty()) {
            Spacer(Modifier.height(16.dp))
            SpecChips(specs)
        }
        Spacer(Modifier.height(20.dp))
        if (product.code.isNotBlank()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Separator))
            InfoRow("Ürün kodu", product.code, bold = true)
        }
        // vitra.com.tr'den gelen vitrin ürünlerinde birim/fiyat gönderilmiyor.
        if (product.unit.isNotBlank()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Separator))
            InfoRow("Birim", product.unit.replaceFirstChar { it.titlecase(turkish) })
        }
        if (product.code.isNotBlank() || product.unit.isNotBlank()) {
            Box(Modifier.fillMaxWidth().height(1.dp).background(Separator))
        }
        product.priceIncVat?.let { price ->
            Spacer(Modifier.height(16.dp))
            Text(
                formatProductPrice(price),
                style = TextStyle(fontFamily = Poppins, color = LabelPrimary, fontSize = 28.5.sp, fontWeight = FontWeight.SemiBold),
            )
            Text("KDV dahil", style = captionStyle())
        }
    }
}

// ---------- Özellik maddeleri (vitra.com.tr) ----------
// Sayfa başına FEATURES_PER_PAGE madde; fazlası sayfalara bölünüp
// FEATURE_PAGE_SECONDS'ta bir yumuşak geçişle döner ("1 / 2"). Yazı boyutu,
// sütunda kalan yüksekliğe [budget] bir sayfa sığacak en büyük adım
// (FEATURE_SIZES) seçilir — uzun ürün adı ya da iki satırlık maddelerde küçülür.
private const val FEATURES_PER_PAGE = 6
private const val FEATURE_PAGE_SECONDS = 8
private val FeatureGap = 18.dp
private val FeatureMargin = 24.dp
private val FeatureBullet = 4.dp
private val FeatureBulletGap = 10.dp
private val FeaturePagerHeight = 26.dp // "1 / 2" satırı + üstündeki boşluk

/** Yazı boyutu adımları: (yazı, satır yüksekliği, maddeler arası boşluk). */
private data class FeatureSize(val font: Float, val line: Float, val spacing: Dp)

private val FEATURE_SIZES = listOf(
    FeatureSize(16f, 22f, 10.dp),
    FeatureSize(15f, 21f, 9.dp),
    FeatureSize(14.5f, 20f, 8.dp),
    FeatureSize(13.5f, 18f, 6.dp),
)

private fun featureStyle(size: FeatureSize) = TextStyle(
    fontFamily = Poppins, color = LabelSecondary,
    fontSize = size.font.sp, lineHeight = size.line.sp, fontWeight = FontWeight.Normal,
)

private data class FeatureLayout(val pages: List<List<String>>, val size: FeatureSize, val pageHeight: Dp)

@Composable
private fun FeatureArea(features: List<String>, width: Dp, budget: Dp) {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val layout = remember(features, width, budget) {
        val pages = features.chunked(FEATURES_PER_PAGE)
        val pager = if (pages.size > 1) FeaturePagerHeight else 0.dp
        val textWidth = with(density) { (width - FeatureBullet - FeatureBulletGap).roundToPx() }.coerceAtLeast(1)
        fun pageHeight(page: List<String>, size: FeatureSize): Dp {
            val style = featureStyle(size)
            val items = page.fold(0.dp) { acc, feature ->
                val h = measurer.measure(
                    feature,
                    style = style,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    constraints = Constraints(maxWidth = textWidth),
                ).size.height
                acc + with(density) { h.toDp() }
            }
            return items + size.spacing * (page.size - 1)
        }
        // Bir sayfa (göstergesiyle) sığana kadar yazı küçülür; en küçük adımda kalınır.
        val chosen = FEATURE_SIZES.firstOrNull { size -> pages.all { pageHeight(it, size) + pager <= budget } }
            ?: FEATURE_SIZES.last()
        // Sayfa değişirken logo/başlık kıpırdamasın: alan en uzun sayfa kadar sabit.
        FeatureLayout(pages, chosen, pages.maxOf { pageHeight(it, chosen) })
    }
    var page by remember(layout) { mutableStateOf(0) }
    LaunchedEffect(layout) {
        if (layout.pages.size < 2) return@LaunchedEffect
        while (true) {
            delay(FEATURE_PAGE_SECONDS * 1_000L)
            page = (page + 1) % layout.pages.size
        }
    }
    Column {
        Crossfade(
            targetState = page.coerceIn(0, layout.pages.lastIndex),
            animationSpec = tween(600),
            label = "feature-page",
            modifier = Modifier.height(layout.pageHeight),
        ) { p ->
            FeatureList(layout.pages[p], layout.size)
        }
        if (layout.pages.size > 1) {
            Spacer(Modifier.height(10.dp))
            Text("${page + 1} / ${layout.pages.size}", style = captionStyle(LabelTertiary))
        }
    }
}

/** Madde imli liste: ikincil renkte; uzun madde en fazla iki satır. */
@Composable
private fun FeatureList(features: List<String>, size: FeatureSize) {
    val style = featureStyle(size)
    // Madde imi ilk satırın dikey ortasında.
    val bulletTop = ((size.line / 2f).dp - FeatureBullet / 2)
    Column(verticalArrangement = Arrangement.spacedBy(size.spacing)) {
        features.forEach { feature ->
            Row {
                Box(
                    Modifier
                        .padding(top = bulletTop)
                        .size(FeatureBullet)
                        .clip(CircleShape)
                        .background(LabelSecondary),
                )
                Spacer(Modifier.width(FeatureBulletGap))
                Text(feature, style = style, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

/**
 * Sayfa göstergesi: zeminsiz noktalar doğrudan fotoğrafın üstünde. Renk o
 * anki slayta göre: beyaz zeminli katalog fotoğrafında koyu, ortam
 * fotoğrafında/videoda beyaz ([onLight]). Seçili nokta tam, diğerleri soluk.
 */
@Composable
private fun SlideDots(count: Int, active: Int, onLight: Boolean, modifier: Modifier) {
    val on = if (onLight) LabelPrimary else Color.White
    val off = if (onLight) LabelTertiary else Color(0x73FFFFFF)
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        repeat(count) { i ->
            Box(
                Modifier
                    .size(7.dp)
                    .clip(CircleShape)
                    .background(if (i == active) on else off)
                    .align(Alignment.CenterVertically),
            )
        }
    }
}

@Composable
private fun ProductImage(url: String, name: String, onLoaded: () -> Unit = {}) {
    val context = LocalContext.current
    // Beyaz zeminli katalog görseli (kenarları kırpılabildi) panelde boşluklu
    // ve sığdırılarak, ortam fotoğrafı ise paneli kenardan kenara doldurarak gösterilir.
    var cutout by remember(url) { mutableStateOf(TrimWhitespace.wasCutout(url)) }
    SubcomposeAsyncImage(
        model = productImageRequest(context, url),
        contentDescription = name,
        contentScale = if (cutout) ContentScale.Fit else ContentScale.Crop,
        onSuccess = {
            cutout = TrimWhitespace.wasCutout(url)
            onLoaded()
        },
        modifier = Modifier.fillMaxSize().padding(if (cutout) 40.dp else 0.dp),
        error = { NoProductImage() },
    )
}

private fun productImageRequest(context: android.content.Context, url: String) =
    ImageRequest.Builder(context)
        .data(url)
        // Kırpma, görsel ekran boyutuna küçültüldükten SONRA yapılırsa küçük
        // kalan ürün yeniden büyütülüp bulanıklaşıyor; önce yüksek çözünürlükte
        // açılır, kırpılır, sonra panele sığdırılır.
        .size(1600, 1600)
        .transformations(TrimWhitespace(url))
        .build()

/**
 * Stoktaki ürün adları çoğunlukla teknik açıklama: "Metropole Round Yerden
 * bide,duvara tam dayalı, 56 cm,…, mat taş gri (Mat Taş Gri)". İlk virgüle
 * kadarki kısım başlık, kalanlar küçük özellik etiketleri olur; tekrarlananlar
 * (sondaki parantez içindeki renk gibi) bir kez gösterilir. vitra.com.tr'den
 * gelen kısa adlar (virgülsüz) olduğu gibi başlık kalır.
 */
private fun splitProductName(name: String): Pair<String, List<String>> {
    var text = name.trim()
    val extras = mutableListOf<String>()
    Regex("\\(([^)]+)\\)\\s*$").find(text)?.let {
        extras += it.groupValues[1]
        text = text.removeRange(it.range).trim()
    }
    val parts = text.split(',').map { it.trim() }.filter { it.isNotEmpty() }
    val title = parts.firstOrNull() ?: name
    val seen = HashSet<String>()
    val specs = (parts.drop(1) + extras)
        .filter { seen.add(it.lowercase(turkish)) }
        .map { spec -> spec.replaceFirstChar { it.titlecase(turkish) } }
    return title to specs
}

/**
 * Başlık: tvOS Title 2 (57 pt → 28.5 sp, Medium). Uzun başlıklarda alana
 * (en fazla 3 satır) sığana kadar Title 3 / Headline boyutlarına küçülür;
 * "…" ile kesilmez.
 */
@Composable
private fun AutoFitTitle(title: String) {
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val widthPx = constraints.maxWidth
        val style = remember(title, widthPx) {
            // Title 2, Title 3, Headline (57 / 48 / 38 pt) ve aralarındaki ara boyutlar.
            listOf(28.5f, 26f, 24f, 21.5f, 19f).map { size ->
                TextStyle(fontFamily = Poppins, color = LabelPrimary, fontSize = size.sp, lineHeight = (size * 1.2f).sp, fontWeight = FontWeight.Medium)
            }.firstOrNull { st ->
                !measurer.measure(title, st, maxLines = 3, constraints = Constraints(maxWidth = widthPx)).hasVisualOverflow
            } ?: TextStyle(fontFamily = Poppins, color = LabelPrimary, fontSize = 19.sp, lineHeight = 23.sp, fontWeight = FontWeight.Medium)
        }
        Text(title, style = style, maxLines = 4, overflow = TextOverflow.Ellipsis)
    }
}

/** Özellikler: ikincil dolgu üstünde Caption 1 (25 pt → 12.5 sp); ilk SPEC_LIMIT tanesi. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun SpecChips(specs: List<String>) {
    FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        specs.take(SPEC_LIMIT).forEach { spec ->
            Text(
                spec,
                style = captionStyle(LabelPrimary),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier
                    .clip(RoundedCornerShape(999.dp))
                    .background(SecondaryFill)
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
    }
}

/** Bilgi satırı: etiket Body ikincil renk, değer Callout birincil renk. */
@Composable
private fun InfoRow(label: String, value: String, bold: Boolean = false) {
    Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(
            label,
            style = TextStyle(fontFamily = Poppins, color = LabelSecondary, fontSize = 14.5.sp, fontWeight = FontWeight.Normal),
            modifier = Modifier.weight(1f),
        )
        Text(
            value,
            style = TextStyle(
                fontFamily = Poppins,
                color = LabelPrimary,
                fontSize = 15.5.sp,
                fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Medium,
            ),
        )
    }
}

@Composable
private fun NoProductImage() {
    Image(
        painter = painterResource(R.drawable.logo_color),
        contentDescription = null,
        modifier = Modifier.fillMaxWidth(0.5f),
        alpha = 0.15f,
    )
}

private fun formatProductPrice(value: Double): String =
    NumberFormat.getCurrencyInstance(turkish).apply {
        maximumFractionDigits = if (value % 1.0 == 0.0) 0 else 2
        minimumFractionDigits = if (value % 1.0 == 0.0) 0 else 2
    }.format(value)

/**
 * Katalog görsellerinin çevresindeki beyaz/şeffaf boşluğu kırpar (çoğu ürün
 * fotoğrafında ürün, karenin ortasında küçük kalıyor). Biraz pay bırakılır.
 */
private class TrimWhitespace(private val url: String) : Transformation {
    override val cacheKey = "trim-whitespace-v1"

    companion object {
        // Görselin köşeleri beyaz/şeffaf mıydı (katalog "cut-out" görseli)? Ekran,
        // görseli sığdırarak mı (cut-out) yoksa paneli doldurarak mı (ortam
        // fotoğrafı) göstereceğine buna göre karar verir. Önbellekten gelen
        // görselde transform tekrar çalışmadığı için sonuç burada saklanır.
        private val cutouts = java.util.concurrent.ConcurrentHashMap<String, Boolean>()

        fun wasCutout(url: String): Boolean = cutouts[url] ?: true
    }

    override suspend fun transform(input: Bitmap, size: Size): Bitmap {
        val w = input.width
        val h = input.height
        val pixels = IntArray(w * h)
        input.getPixels(pixels, 0, w, 0, 0, w, h)
        fun isBackground(c: Int): Boolean {
            val a = c ushr 24
            if (a < 16) return true
            val r = (c shr 16) and 0xFF
            val g = (c shr 8) and 0xFF
            val b = c and 0xFF
            return r > 240 && g > 240 && b > 240
        }
        cutouts[url] = isBackground(pixels[0]) && isBackground(pixels[w - 1]) &&
            isBackground(pixels[(h - 1) * w]) && isBackground(pixels[h * w - 1])
        var left = w; var top = h; var right = -1; var bottom = -1
        for (y in 0 until h) {
            val row = y * w
            for (x in 0 until w) {
                if (!isBackground(pixels[row + x])) {
                    if (x < left) left = x
                    if (x > right) right = x
                    if (y < top) top = y
                    if (y > bottom) bottom = y
                }
            }
        }
        if (right < 0) return input
        val pad = (maxOf(right - left, bottom - top) * 0.04f).toInt()
        left = (left - pad).coerceAtLeast(0)
        top = (top - pad).coerceAtLeast(0)
        right = (right + pad).coerceAtMost(w - 1)
        bottom = (bottom + pad).coerceAtMost(h - 1)
        if (left == 0 && top == 0 && right == w - 1 && bottom == h - 1) return input
        return Bitmap.createBitmap(input, left, top, right - left + 1, bottom - top + 1)
    }
}
