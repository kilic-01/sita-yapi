package com.vitra.sitayapitv

import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.runtime.SideEffect
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Currency

// Bir sayfada gösterilen kalem sayısı; fazlası sayfalara bölünüp
// Kalemler mümkünse TEK sayfada gösterilir: satır yüksekliği kalem sayısına
// göre küçülür (en fazla MAX_ROW, en az MIN_ROW). MIN_ROW'un altına inmek
// gerekecek kadar uzun tekliflerde (≈13+ kalem) sayfalara bölünüp
// PAGE_SECONDS'ta bir otomatik döner (TV'de kaydırma yok).
private val MAX_ROW = 54.dp
private val MIN_ROW = 30.dp
// Bu yüksekliğin altında satırlar sıkışık düzene geçer (tek satır ad, küçük yazı).
private val COMPACT_ROW = 44.dp
private const val PAGE_SECONDS = 8

/** Masaüstündeki Teklifler sayfasından "TV'de Yayınla" ile gönderilen fiyat teklifi. */
@Composable
fun QuoteScreen(quote: TvQuote) {
    val money = remember(quote.currency) { moneyFormat(quote.currency) }
    var page by remember(quote) { mutableStateOf(0) }
    // Sayfa sayısı kalem listesinin yüksekliği ölçülünce belli olur (aşağıda);
    // sağdaki "SAYFA x / y" göstergesi için buraya taşınır.
    var pageCount by remember(quote) { mutableStateOf(1) }
    // Teklifteki hiçbir kalemin stokta fotoğrafı yoksa boş kutular yerine sütun hiç gösterilmez.
    val showImages = remember(quote) { quote.items.any { it.imageUrl.isNotBlank() } }
    LaunchedEffect(pageCount) { page = 0 }
    // Otomatik sayfa geçişi; kumandayla elle geçilince süre baştan başlar.
    LaunchedEffect(pageCount, page) {
        if (pageCount < 2) return@LaunchedEffect
        delay(PAGE_SECONDS * 1_000L)
        page = (page + 1) % pageCount
    }
    // Kumanda: sağ/sol ile sayfalar arasında gezinme.
    LaunchedEffect(pageCount) {
        RemoteKeys.events.collect { key ->
            if (pageCount < 2) return@collect
            when (key) {
                RemoteKey.LEFT -> page = (page - 1 + pageCount) % pageCount
                RemoteKey.RIGHT -> page = (page + 1) % pageCount
                else -> Unit
            }
        }
    }

    Column(Modifier.fillMaxSize().padding(start = TvSafeSide, end = TvSafeSide, top = TvSafeVertical, bottom = TvSafeVertical)) {
        // Başlık: teklif no + müşteri | tarih + geçerlilik
        Row(verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.width(20.dp).height(2.dp).background(Accent))
                    Spacer(Modifier.width(10.dp))
                    Text(
                        "FİYAT TEKLİFİ  ·  ${quote.quoteNo}",
                        style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = TvCaption1, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp),
                    )
                }
                if (quote.customerName.isNotBlank()) {
                    Spacer(Modifier.height(10.dp))
                    Text(
                        "Sayın ${quote.customerName}",
                        style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 26.sp, fontWeight = FontWeight.Normal, letterSpacing = (-0.3).sp),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                formatQuoteDate(quote.quoteDate)?.let {
                    Text(it, style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = TvBody))
                }
                quote.validityDays?.takeIf { it > 0 }?.let {
                    Text("$it gün geçerlidir", style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvCaption1))
                }
            }
        }
        Spacer(Modifier.height(20.dp))
        Box(Modifier.fillMaxWidth().height(1.dp).background(Hairline))

        Row(Modifier.weight(1f).fillMaxWidth()) {
            // Kalemler
            Column(Modifier.weight(2.8f).fillMaxHeight().padding(top = 10.dp, end = 28.dp)) {
                QuoteTableHeader(showImages)
                Box(Modifier.fillMaxWidth().height(1.dp).background(Hairline))
                BoxWithConstraints(Modifier.weight(1f).fillMaxWidth()) {
                    val n = quote.items.size.coerceAtLeast(1)
                    val fit = (maxHeight / MIN_ROW).toInt().coerceAtLeast(1)
                    val perPage = if (n <= fit) n else fit
                    val pages = remember(quote, perPage) { quote.items.chunked(perPage).ifEmpty { listOf(emptyList()) } }
                    SideEffect { pageCount = pages.size }
                    val rowHeight = minOf(maxHeight / perPage, MAX_ROW)
                    AnimatedContent(
                        targetState = page.coerceIn(0, pages.size - 1),
                        transitionSpec = { fadeIn(tween(500)) togetherWith fadeOut(tween(300)) },
                        label = "quote-page",
                    ) { p ->
                        Column {
                            pages.getOrElse(p) { emptyList() }.forEachIndexed { i, item ->
                                if (i > 0) Box(Modifier.fillMaxWidth().height(1.dp).background(Hairline))
                                QuoteItemRow(item, money, showImages, rowHeight - 1.dp, compact = rowHeight < COMPACT_ROW)
                            }
                        }
                    }
                }
            }
            Box(Modifier.padding(vertical = 24.dp).width(1.dp).fillMaxHeight().background(Hairline))
            // Toplamlar
            Column(
                Modifier.weight(1f).fillMaxHeight().padding(start = 28.dp, top = 24.dp),
            ) {
                Text(
                    buildString {
                        append("${quote.items.size} KALEM")
                        if (pageCount > 1) append("  ·  SAYFA ${page + 1} / $pageCount")
                    },
                    style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvCaption1, fontWeight = FontWeight.Medium, letterSpacing = 1.sp),
                )
                Spacer(Modifier.weight(1f))
                // İskonto varsa önce iskontosuz tutar, altında düşülen iskonto
                // gösterilir; müşteri indirimi açıkça görsün.
                TotalRow(
                    if (quote.totals.discount > 0.005) "Tutar" else "Ara toplam",
                    money.format(quote.totals.subtotal + quote.totals.discount),
                )
                if (quote.totals.discount > 0.005) {
                    TotalRow("İskonto", "− " + money.format(quote.totals.discount), Accent)
                }
                TotalRow("KDV", money.format(quote.totals.vat))
                Spacer(Modifier.height(14.dp))
                Box(Modifier.fillMaxWidth().height(1.dp).background(Hairline))
                Spacer(Modifier.height(16.dp))
                Text(
                    "GENEL TOPLAM",
                    style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = TvCaption1, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp),
                )
                Spacer(Modifier.height(4.dp))
                Text(
                    money.format(quote.totals.total),
                    style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 30.sp, fontWeight = FontWeight.Normal, letterSpacing = (-0.5).sp),
                    maxLines = 1,
                )
                Text("KDV dahil", style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvCaption1))
                Spacer(Modifier.height(28.dp))
                // Boşluksuz logo: sağ ve alt güvenli alan çizgisine oturur.
                Image(
                    painter = painterResource(R.drawable.logo_color_tight),
                    contentDescription = null,
                    modifier = Modifier.align(Alignment.End).width(62.dp),
                )
            }
        }
    }
}

// Tablo sütun genişlikleri — başlık ve satırlar aynı ölçüleri kullanır.
// Ürün kodu ve adet müşteri için en önemli bilgiler: kendi sütunlarında,
// koyu ve kalın.
private val ColImage = 40.dp
private val ColCode = 122.dp
private val ColQty = 60.dp
private val ColUnitPrice = 86.dp
private val ColTotal = 96.dp

@Composable
private fun QuoteTableHeader(showImage: Boolean) {
    val style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvCaption2, fontWeight = FontWeight.SemiBold, letterSpacing = 1.sp)
    Row(Modifier.fillMaxWidth().padding(bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        if (showImage) Spacer(Modifier.width(ColImage + 12.dp))
        Text("KOD", style = style, modifier = Modifier.width(ColCode))
        Text("ÜRÜN", style = style, modifier = Modifier.weight(1f))
        Text("ADET", style = style, textAlign = TextAlign.Center, modifier = Modifier.width(ColQty))
        Text("BİRİM FİYAT", style = style, textAlign = TextAlign.End, modifier = Modifier.width(ColUnitPrice))
        Text("TUTAR", style = style, textAlign = TextAlign.End, modifier = Modifier.width(ColTotal))
    }
}

@Composable
private fun QuoteItemRow(item: TvQuoteItem, money: NumberFormat, showImage: Boolean, height: Dp, compact: Boolean) {
    val textSize = if (compact) TvCaption1 else TvBody
    Row(Modifier.fillMaxWidth().height(height), verticalAlignment = Alignment.CenterVertically) {
        if (showImage) {
            Box(
                Modifier
                    .size(minOf(ColImage, height - 6.dp))
                    .clip(RoundedCornerShape(6.dp))
                    .border(1.dp, Hairline, RoundedCornerShape(6.dp)),
                contentAlignment = Alignment.Center,
            ) {
                if (item.imageUrl.isNotBlank()) {
                    AsyncImage(
                        model = item.imageUrl,
                        contentDescription = null,
                        contentScale = ContentScale.Fit,
                        modifier = Modifier.fillMaxSize().padding(3.dp),
                    )
                }
            }
            Spacer(Modifier.width(ColImage - minOf(ColImage, height - 6.dp) + 12.dp))
        }
        Text(
            item.code.ifBlank { "—" },
            style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = textSize, fontWeight = FontWeight.SemiBold),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.width(ColCode).padding(end = 10.dp),
        )
        if (compact) {
            // Sıkışık düzen: ad tek satır; iskonto birim fiyatın altında.
            Text(
                item.description.ifBlank { item.code },
                style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = textSize),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f).padding(end = 10.dp),
            )
            Text(
                buildAnnotatedString {
                    withStyle(SpanStyle(fontSize = 15.sp, fontWeight = FontWeight.SemiBold)) { append(formatQty(item.qty)) }
                    withStyle(SpanStyle(fontSize = TvCaption2, color = Muted)) { append(" ${item.unit}") }
                },
                style = TextStyle(fontFamily = Poppins, color = Ink),
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.width(ColQty),
            )
        } else {
            Column(Modifier.weight(1f).padding(end = 10.dp)) {
                Text(
                    item.description.ifBlank { item.code },
                    style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = textSize),
                    maxLines = if (item.discountRate > 0) 1 else 2,
                    overflow = TextOverflow.Ellipsis,
                )
                if (item.discountRate > 0) {
                    Text(
                        "%${formatQty(item.discountRate)} iskonto",
                        style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = TvCaption2, fontWeight = FontWeight.Medium),
                    )
                }
            }
            Column(Modifier.width(ColQty), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(formatQty(item.qty), style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold))
                Text(item.unit, style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvCaption2))
            }
        }
        Column(Modifier.width(ColUnitPrice), horizontalAlignment = Alignment.End) {
            Text(
                money.format(item.unitPrice),
                style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = if (compact) TvCaption2 else TvCaption1),
            )
            if (compact && item.discountRate > 0) {
                Text(
                    "%${formatQty(item.discountRate)} iskonto",
                    style = TextStyle(fontFamily = Poppins, color = Accent, fontSize = TvCaption2, fontWeight = FontWeight.Medium, lineHeight = 13.sp),
                )
            }
        }
        Text(
            money.format(item.lineTotal),
            style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = textSize, fontWeight = FontWeight.Medium),
            textAlign = TextAlign.End,
            modifier = Modifier.width(ColTotal),
        )
    }
}

@Composable
private fun TotalRow(label: String, value: String, valueColor: androidx.compose.ui.graphics.Color = Ink) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(label, style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvBody), modifier = Modifier.weight(1f))
        Text(value, style = TextStyle(fontFamily = Poppins, color = valueColor, fontSize = TvCallout))
    }
}

private fun moneyFormat(currency: String): NumberFormat =
    NumberFormat.getCurrencyInstance(turkish).apply {
        runCatching { this.currency = Currency.getInstance(currency) }
        minimumFractionDigits = 2
        maximumFractionDigits = 2
    }

private fun formatQty(value: Double): String =
    if (value % 1.0 == 0.0) value.toLong().toString() else value.toString().replace('.', ',')

private fun formatQuoteDate(iso: String): String? =
    runCatching { LocalDate.parse(iso).format(DateTimeFormatter.ofPattern("d MMMM yyyy", turkish)) }.getOrNull()
