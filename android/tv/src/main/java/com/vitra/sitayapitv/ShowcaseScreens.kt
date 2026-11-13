package com.vitra.sitayapitv

import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.ColorUtils
import coil.compose.AsyncImage
import coil.request.ImageRequest

// Bekleme ekranının vitrin sayfaları (bkz. Showcase.kt). Diğer ekranlarla aynı
// dil: güvenli alan, Poppins, tvOS yazı boyutları; koleksiyon sayfası bekleme
// fotoğrafları gibi tam ekran görsel, hizmetler sayfası rotalar gibi buzlu cam.

private val White85 = Color(0xD9FFFFFF)
private val White70 = Color(0xB3FFFFFF)

/** Koleksiyon tanıtımı: VitrA'nın tanıtım görseli tam ekran, solda ad + açıklama + birkaç ürün. */
@Composable
fun CollectionSlide(collection: TvCollection, seconds: Int) {
    val context = LocalContext.current
    val image = remember(collection) { collection.images.randomOrNull() }
    // Zemin ve geçiş rengi görselin baskın renginden türetilir (koyulaştırılmış);
    // görsel yüklenene kadar nötr koyu renk.
    var tint by remember(collection) { mutableStateOf(CollectionInk) }
    val ink by animateColorAsState(tint, tween(900), label = "collection-ink")
    val zoom = remember(collection) { Animatable(1f) }
    LaunchedEffect(collection) { zoom.animateTo(1.06f, tween((seconds + 2) * 1_000, easing = LinearEasing)) }
    // Netflix tarzı: görsel sağa yaslı, sol kenarı koyu zemine doğru erir.
    // VitrA çekimlerinde ürün kadrajın ortasında; görsel sağa kayınca ürün
    // yazıların ve küçük resimlerin altında kalmıyor.
    Box(Modifier.fillMaxSize().background(ink)) {
        Box(Modifier.align(Alignment.CenterEnd).fillMaxHeight().fillMaxWidth(0.8f).clip(RectangleShape)) {
            AsyncImage(
                // Pikselleri okuyabilmek için donanım bitmap'i kullanılmaz.
                model = remember(image) { ImageRequest.Builder(context).data(image).allowHardware(false).build() },
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onSuccess = { state -> (state.result.drawable as? BitmapDrawable)?.bitmap?.let { tint = dominantInk(it) } },
                modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = zoom.value; scaleY = zoom.value },
            )
            Box(
                Modifier.fillMaxSize().background(
                    Brush.horizontalGradient(0f to ink, 0.12f to ink.copy(alpha = 0.85f), 0.45f to Color.Transparent),
                ),
            )
            // Altta hafif karartma: sağ alttaki logo açık görsellerde de okunsun.
            Box(
                Modifier.fillMaxSize().background(
                    Brush.verticalGradient(0.7f to Color.Transparent, 1f to ink.copy(alpha = 0.55f)),
                ),
            )
        }
        // Ürünler 3 satırı dolduruyorsa son satır silikleşir ve blok alta yaslanır
        // (liste aşağıda devam ediyormuş gibi); yetmiyorsa metin ve ürünler
        // bir bütün olarak dikeyde ortalanır, efekt kullanılmaz.
        val rows = remember(collection) { collection.products.take(12).chunked(4) }
        val scrollLook = rows.size == 3
        Column(
            if (scrollLook) {
                Modifier.align(Alignment.BottomStart).padding(start = TvSafeSide, end = TvSafeSide, bottom = TileGap)
            } else {
                Modifier.align(Alignment.CenterStart).padding(horizontal = TvSafeSide)
            }.fillMaxWidth(0.5f),
        ) {
            Text(
                "VitrA Koleksiyonu",
                style = TextStyle(fontFamily = Poppins, color = White70, fontSize = TvCaption1, fontWeight = FontWeight.Medium, letterSpacing = 0.5.sp),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                collection.name,
                style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = 34.sp, lineHeight = 40.sp, fontWeight = FontWeight.Medium),
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            if (collection.description.isNotBlank()) {
                Spacer(Modifier.height(12.dp))
                Text(
                    collection.description,
                    style = TextStyle(fontFamily = Poppins, color = White85, fontSize = TvCallout, lineHeight = 23.sp, fontWeight = FontWeight.Light),
                    maxLines = 5,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (collection.products.isNotEmpty()) {
                Spacer(Modifier.height(20.dp))
                // En fazla 3 satır × 4 ürün; silik son satır "koleksiyonda sadece
                // bu kadar ürün mü var" izlenimi vermesin diye.
                Column(verticalArrangement = Arrangement.spacedBy(TileGap)) {
                    rows.forEachIndexed { r, row ->
                        val fade = scrollLook && r == rows.lastIndex
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(TileGap),
                            modifier = if (fade) Modifier.fadeDown() else Modifier,
                        ) {
                            row.forEach { url ->
                                Box(
                                    Modifier.size(78.dp).clip(RoundedCornerShape(14.dp)).background(Color.White).padding(6.dp),
                                    contentAlignment = Alignment.Center,
                                ) {
                                    AsyncImage(model = url, contentDescription = null, contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize())
                                }
                            }
                        }
                    }
                }
            }
        }
        Image(
            painter = painterResource(R.drawable.logo_white_tight),
            contentDescription = "Sita Yapı",
            modifier = Modifier.align(Alignment.BottomEnd).padding(end = TvSafeSide, bottom = TvSafeVertical).width(95.dp),
        )
    }
}

private val CollectionInk = Color(0xFF0C0E11)

// Ürün kutuları arası boşluk; 3 satırlık blok alt kenara da bu kadar uzak durur.
private val TileGap = 10.dp

/**
 * Görselin en baskın rengi: küçültülmüş görselde renkler kabaca gruplanır,
 * en kalabalık grubun ortalaması alınır. Beyaz yazı okunsun diye ton korunup
 * koyulaştırılır, aşırı doygunluk kırpılır.
 */
private fun dominantInk(bitmap: Bitmap): Color {
    val small = Bitmap.createScaledBitmap(bitmap, 48, 27, true)
    val buckets = HashMap<Int, IntArray>()
    for (y in 0 until small.height) for (x in 0 until small.width) {
        val c = small.getPixel(x, y)
        val r = (c shr 16) and 0xFF; val g = (c shr 8) and 0xFF; val b = c and 0xFF
        val key = (r shr 5 shl 6) or (g shr 5 shl 3) or (b shr 5)
        val acc = buckets.getOrPut(key) { IntArray(4) }
        acc[0]++; acc[1] += r; acc[2] += g; acc[3] += b
    }
    if (small !== bitmap) small.recycle()
    val top = buckets.values.maxByOrNull { it[0] } ?: return CollectionInk
    val hsl = FloatArray(3)
    ColorUtils.RGBToHSL(top[1] / top[0], top[2] / top[0], top[3] / top[0], hsl)
    hsl[1] = hsl[1].coerceAtMost(0.45f)
    hsl[2] = 0.14f
    return Color(ColorUtils.HSLToColor(hsl))
}

/** İçeriği yukarıdan aşağıya saydamlaştırır (üstte tam görünür, altta görünmez). */
private fun Modifier.fadeDown() = graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }
    .drawWithContent {
        drawContent()
        drawRect(Brush.verticalGradient(0f to Color.Black, 1f to Color.Transparent), blendMode = BlendMode.DstIn)
    }

/**
 * Hizmetlerimiz — dergi sayfası düzeni: solda tam yükseklik VitrA ortam
 * fotoğrafı (yavaş yakınlaşma), sağda açık zeminde ince büyük başlık ve
 * numaralı, saç çizgisiyle ayrılmış hizmet listesi; sağ altta logo.
 * Vurgu rengi yalnız numara, ikon ve başlık altındaki çizgide.
 */
@Composable
fun ServicesSlide(services: TvServices) {
    val context = LocalContext.current
    val photo = remember(services) {
        VitraBackgrounds.urls.value.randomOrNull()
            ?: runCatching { context.assets.list("backgrounds")?.filter { it.endsWith(".jpg") }?.randomOrNull() }.getOrNull()
                ?.let { "file:///android_asset/backgrounds/$it" }
    }
    val zoom = remember(services) { Animatable(1f) }
    LaunchedEffect(services) { zoom.animateTo(1.06f, tween(20_000, easing = LinearEasing)) }
    Row(Modifier.fillMaxSize().background(ServicesPaper)) {
        Box(Modifier.weight(0.42f).fillMaxHeight().clip(androidx.compose.ui.graphics.RectangleShape)) {
            AsyncImage(
                model = photo,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = zoom.value; scaleY = zoom.value },
            )
            // Sağ kenarda kâğıda doğru çok hafif geçiş: iki yarı birbirine yumuşakça bağlansın.
            Box(
                Modifier.fillMaxSize().background(
                    Brush.horizontalGradient(0.82f to Color.Transparent, 1f to ServicesPaper.copy(alpha = 0.35f)),
                ),
            )
        }
        Column(
            Modifier
                .weight(0.58f)
                .fillMaxHeight()
                .padding(start = 44.dp, end = TvSafeSide, top = TvSafeVertical + 8.dp, bottom = TvSafeVertical),
        ) {
            Text(
                "Hizmetlerimiz",
                style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 40.sp, lineHeight = 46.sp, fontWeight = FontWeight.Light),
            )
            Spacer(Modifier.height(12.dp))
            Box(Modifier.width(36.dp).height(2.dp).background(Accent))

            val items = services.items.take(6)
            val twoColumns = items.size > 4
            // Liste, başlık ile logo arasında dikeyde ortalı: üstte ve altta eşit boşluk.
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.CenterStart) {
                if (twoColumns) {
                    val half = (items.size + 1) / 2
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(28.dp)) {
                        Column(Modifier.weight(1f)) { items.take(half).forEachIndexed { i, it -> ServiceRow(i + 1, it, compact = true, last = i == half - 1) } }
                        Column(Modifier.weight(1f)) { items.drop(half).forEachIndexed { i, it -> ServiceRow(half + i + 1, it, compact = true, last = i == items.size - half - 1) } }
                    }
                } else {
                    Column(Modifier.fillMaxWidth()) {
                        items.forEachIndexed { i, it -> ServiceRow(i + 1, it, compact = false, last = i == items.lastIndex) }
                    }
                }
            }

            // Müşteri bu ekranı mağazada görüyor: iletişim bilgisi yok, yalnız logo.
            Image(
                painter = painterResource(R.drawable.logo_color_tight),
                contentDescription = "Sita Yapı",
                modifier = Modifier.align(Alignment.End).width(95.dp),
            )
        }
    }
}

private val ServicesPaper = Color(0xFFF7F6F3)      // sıcak, kâğıt beyazı
private val ServicesMuted = Color(0x8C0E2A3B)
private val ServicesHairline = Color(0x1A0E2A3B)

/** Numaralı hizmet satırı: "01" · ince çerçeveli ikon · başlık + açıklama; altında saç çizgisi. */
@Composable
private fun ServiceRow(number: Int, item: TvServiceItem, compact: Boolean, last: Boolean) {
    Column {
        // Numara, ikon ve metin bloğu satırın dikey ortasında (açıklama iki satır olsa da).
        Row(Modifier.padding(vertical = if (compact) 9.dp else 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                number.toString().padStart(2, '0'),
                style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = 13.sp, fontWeight = FontWeight.Light, letterSpacing = 1.sp),
                modifier = Modifier.width(30.dp),
            )
            Box(
                Modifier
                    .size(36.dp)
                    .border(1.dp, Accent.copy(alpha = 0.35f), androidx.compose.foundation.shape.CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(ServiceIcons.forService(item), contentDescription = null, tint = Accent, modifier = Modifier.size(17.dp))
            }
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    item.title,
                    style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = if (compact) 16.sp else 18.sp, lineHeight = 24.sp, fontWeight = FontWeight.Medium),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.text.isNotBlank()) {
                    Text(
                        item.text,
                        style = TextStyle(fontFamily = Poppins, color = ServicesMuted, fontSize = if (compact) 12.5.sp else 13.5.sp, lineHeight = 18.sp, fontWeight = FontWeight.Light),
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        if (!last) Box(Modifier.fillMaxWidth().height(1.dp).background(ServicesHairline))
    }
}
