package com.vitra.sitayapitv

import androidx.compose.foundation.layout.offset
import androidx.compose.ui.layout.LastBaseline
import coil.request.SuccessResult
import coil.request.ImageRequest
import coil.imageLoader
import com.airbnb.lottie.compose.rememberLottieComposition
import com.airbnb.lottie.compose.LottieConstants
import com.airbnb.lottie.compose.LottieCompositionSpec
import com.airbnb.lottie.compose.LottieAnimation
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request

// Dükkân konumu — electron/config.js'teki SHOP_LOCATION ile aynı.
private const val SHOP_LAT = 41.0860
private const val SHOP_LNG = 29.0266
private const val LOCATION_NAME = "İstanbul"
private const val HOURS = 13 // şimdi + sonraki 12 saat
private const val REFRESH_MS = 15 * 60 * 1_000L
private const val RETRY_MS = 60 * 1_000L

data class DailyWeather(val date: LocalDate, val code: Int, val max: Int, val min: Int, val rainChance: Int?)

data class HourlyWeather(val time: LocalDateTime, val code: Int, val isDay: Boolean, val temperature: Int)

data class Weather(
    val temperature: Int,
    val code: Int,
    val isDay: Boolean,
    val label: String,
    val feelsLike: Int?,
    val humidity: Int?,
    val pressure: Int?,
    val hours: List<HourlyWeather>,
    val days: List<DailyWeather>,
)

private val client = OkHttpClient.Builder()
    .connectTimeout(10, TimeUnit.SECONDS)
    .readTimeout(10, TimeUnit.SECONDS)
    .build()

/**
 * Open-Meteo (open-meteo.com) — anahtar/kayıt gerektirmeyen ücretsiz hava
 * durumu servisi. Anlık durum (bekleme ekranındaki tarih satırı), saatlik ve
 * 7 günlük tahmin (hava durumu sayfası) tek istekte alınır.
 */
private suspend fun fetchWeather(): Weather = withContext(Dispatchers.IO) {
    val url = "https://api.open-meteo.com/v1/forecast?latitude=$SHOP_LAT&longitude=$SHOP_LNG" +
        "&current=temperature_2m,weather_code,is_day,apparent_temperature,relative_humidity_2m,pressure_msl" +
        "&hourly=temperature_2m,weather_code,is_day&forecast_hours=$HOURS" +
        "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=7" +
        "&timezone=Europe%2FIstanbul"
    client.newCall(Request.Builder().url(url).build()).execute().use { resp ->
        check(resp.isSuccessful) { "Hava durumu alınamadı (${resp.code})" }
        val root = Json.parseToJsonElement(resp.body!!.string()).jsonObject
        val current = root["current"]!!.jsonObject
        val code = current["weather_code"]!!.jsonPrimitive.int
        Weather(
            temperature = current["temperature_2m"]!!.jsonPrimitive.double.roundToInt(),
            code = code,
            isDay = current["is_day"]?.jsonPrimitive?.int != 0,
            label = weatherLabel(code),
            feelsLike = current["apparent_temperature"]?.jsonPrimitive?.doubleOrNull?.roundToInt(),
            humidity = current["relative_humidity_2m"]?.jsonPrimitive?.doubleOrNull?.roundToInt(),
            pressure = current["pressure_msl"]?.jsonPrimitive?.doubleOrNull?.roundToInt(),
            hours = parseHourly(root["hourly"] as? JsonObject),
            days = parseDaily(root["daily"] as? JsonObject),
        )
    }
}

private fun parseHourly(hourly: JsonObject?): List<HourlyWeather> {
    if (hourly == null) return emptyList()
    val times = hourly["time"]!!.jsonArray
    val temps = hourly["temperature_2m"]!!.jsonArray
    val codes = hourly["weather_code"]!!.jsonArray
    val days = hourly["is_day"]!!.jsonArray
    return times.indices.map { i ->
        HourlyWeather(
            time = LocalDateTime.parse(times[i].jsonPrimitive.content),
            code = codes[i].jsonPrimitive.int,
            isDay = days[i].jsonPrimitive.int != 0,
            temperature = temps[i].jsonPrimitive.double.roundToInt(),
        )
    }
}

private fun parseDaily(daily: JsonObject?): List<DailyWeather> {
    if (daily == null) return emptyList()
    val dates = daily["time"]!!.jsonArray
    val codes = daily["weather_code"]!!.jsonArray
    val maxes = daily["temperature_2m_max"]!!.jsonArray
    val mins = daily["temperature_2m_min"]!!.jsonArray
    val rain = daily["precipitation_probability_max"]?.jsonArray
    return dates.indices.map { i ->
        DailyWeather(
            date = LocalDate.parse(dates[i].jsonPrimitive.content),
            code = codes[i].jsonPrimitive.int,
            max = maxes[i].jsonPrimitive.double.roundToInt(),
            min = mins[i].jsonPrimitive.double.roundToInt(),
            rainChance = rain?.getOrNull(i)?.jsonPrimitive?.intOrNull
                ?: rain?.getOrNull(i)?.jsonPrimitive?.doubleOrNull?.roundToInt(),
        )
    }
}

/** Hava durumu; ilk veri gelene kadar ya da hiç alınamazsa null (ilgili alanlar gizlenir). */
@Composable
fun rememberWeather(): Weather? {
    var weather by remember { mutableStateOf<Weather?>(null) }
    LaunchedEffect(Unit) {
        while (true) {
            val ok = runCatching { fetchWeather() }.onSuccess { weather = it }.isSuccess
            delay(if (ok) REFRESH_MS else RETRY_MS)
        }
    }
    return weather
}

// WMO hava durumu kodları — https://open-meteo.com/en/docs ("WMO Weather interpretation codes")
fun weatherLabel(code: Int): String = when (code) {
    0 -> "Açık"
    1 -> "Az bulutlu"
    2 -> "Parçalı bulutlu"
    3 -> "Kapalı"
    45, 48 -> "Sisli"
    51, 53, 55, 56, 57 -> "Çisenti"
    61 -> "Hafif yağmurlu"
    63 -> "Yağmurlu"
    65 -> "Şiddetli yağmur"
    66, 67 -> "Dondurucu yağmur"
    71 -> "Hafif karlı"
    73, 75, 77 -> "Karlı"
    80, 81 -> "Sağanak"
    82 -> "Şiddetli sağanak"
    85, 86 -> "Kar sağanağı"
    95, 96, 99 -> "Gök gürültülü"
    else -> ""
}

// ---------- Hava durumu sayfası ----------
// Arkada dönen İstanbul fotoğrafları (koyu perdeyle), solda büyük beyaz
// sıcaklık, sağ üstte büyük hava durumu ikonu, sağda hissedilen/nem/basınç,
// altta önümüzdeki 5 gün için yarı saydam kartlar.

private const val PHOTO_SECONDS = 8

private val White = Color.White
private val White80 = Color(0xCCFFFFFF)
private val White50 = Color(0x80FFFFFF)

private fun photoRequest(context: android.content.Context, photo: IstanbulPhoto) =
    ImageRequest.Builder(context)
        .data(photo.url)
        .addHeader("User-Agent", IstanbulPhotos.USER_AGENT)
        .build()

/** Bekleme ekranındaki fotoğrafların arasına giren hava durumu sayfası. */
@Composable
fun WeatherSlide(weather: Weather) {
    val context = LocalContext.current
    // Arkadaki İstanbul fotoğrafı (bkz. IstanbulPhotos — Commons'tan anlık).
    // Fotoğraf ancak indirilip önbelleğe alındıktan sonra ekrana geçer; geçişte
    // boş/yarım yüklenmiş kare görünmez. İndirilemeyen fotoğraf atlanır.
    var photo by remember { mutableStateOf<IstanbulPhoto?>(null) }
    LaunchedEffect(Unit) {
        while (true) {
            val candidate = IstanbulPhotos.next(context) ?: break
            val loaded = context.imageLoader.execute(photoRequest(context, candidate)) is SuccessResult
            if (!loaded) continue
            photo = candidate
            // Bir sonrakini şimdiden indir.
            IstanbulPhotos.peek(context)?.let { context.imageLoader.enqueue(photoRequest(context, it)) }
            delay(PHOTO_SECONDS * 1_000L)
        }
    }

    Box(Modifier.fillMaxSize().background(Color(0xFF111418))) {
        Crossfade(targetState = photo, animationSpec = tween(1_500), label = "istanbul-photo") { shown ->
            if (shown == null) return@Crossfade
            val zoom = remember(shown) { Animatable(1f) }
            LaunchedEffect(shown) { zoom.animateTo(1.06f, tween((PHOTO_SECONDS + 2) * 1_000, easing = LinearEasing)) }
            AsyncImage(
                model = photoRequest(context, shown),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().graphicsLayer { scaleX = zoom.value; scaleY = zoom.value },
            )
        }
        // Koyu perde: üstte hafif, altta (kartların olduğu yerde) daha yoğun.
        Box(
            Modifier.fillMaxSize().background(
                Brush.verticalGradient(listOf(Color(0x66000000), Color(0x4D000000), Color(0xA6000000)))
            )
        )

        Column(Modifier.fillMaxSize().padding(start = TvSafeSide, end = TvSafeSide, top = TvSafeVertical, bottom = 68.dp)) {
            // Üst: konum | büyük ikon — ikon, konum bloğunun dikey ortasına hizalı.
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text("Şu an", style = TextStyle(fontFamily = Poppins, color = White80, fontSize = 19.sp, fontWeight = FontWeight.Normal))
                    Text(LOCATION_NAME, style = TextStyle(fontFamily = Poppins, color = White, fontSize = 36.sp, fontWeight = FontWeight.Medium))
                }
                // Animasyonlu ikonun çiziminin etrafında kendi boşluğu var; görünen
                // bulutun sağ kenarı güvenli alan çizgisine (kartlarla aynı) otursun diye kaydırılır.
                Box(Modifier.offset(x = 10.dp)) {
                    FlatWeatherIcon(weather.code, 130.dp, night = !weather.isDay)
                }
            }

            Spacer(Modifier.weight(1f))

            // Orta: sıcaklık | hissedilen, nem, basınç — hepsi aynı yazı taban
            // çizgisine (son satırın baseline'ı) hizalı.
            Row {
                Column(Modifier.weight(1f).alignBy(LastBaseline)) {
                    Text(
                        "${weather.temperature}°C",
                        style = TextStyle(fontFamily = Poppins, color = White, fontSize = 88.sp, lineHeight = 92.sp, fontWeight = FontWeight.Normal, letterSpacing = (-2).sp),
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(36.dp), modifier = Modifier.alignBy(LastBaseline)) {
                    weather.feelsLike?.let { Stat("HİSSEDİLEN", "$it°C") }
                    weather.humidity?.let { Stat("NEM", "%$it") }
                    weather.pressure?.let { Stat("BASINÇ", "$it hPa") }
                }
            }

            Spacer(Modifier.height(24.dp))

            // Alt: önümüzdeki 5 gün
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                weather.days.drop(1).take(5).forEachIndexed { i, day ->
                    DayCard(dayName(i + 1, day.date), day, Modifier.weight(1f))
                }
            }
        }

        // Alt satır: solda fotoğraf künyesi, sağda logo. Logo boşluksuz kesilmiş
        // sürüm (logo_white_tight), 95 dp; alt kenarı künyenin taban çizgisine hizalı.
        Row(
            Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(start = TvSafeSide, end = TvSafeSide, bottom = TvSafeVertical),
            verticalAlignment = Alignment.Bottom,
        ) {
            photo?.let {
                Text(
                    // Künye bilerek tvOS'un en küçük yazı boyutunun altında: istenen
                    // görünüm silik ve küçük; lisansın şart koştuğu atıf yine okunabilir.
                    "Fotoğraf: ${it.artist} · ${it.license} · Wikimedia Commons",
                    style = TextStyle(fontFamily = Poppins, color = White50, fontSize = 6.sp, letterSpacing = 0.3.sp),
                    // Her durumda tek satır: uzun künye gün kartlarının üstüne taşmasın.
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    // Kalan genişliğin tamamı künyenin: logo, künyenin uzunluğundan
                    // bağımsız olarak hep sağ kenarda kalır.
                    modifier = Modifier.alignByBaseline().weight(1f).padding(end = 16.dp),
                )
            } ?: Spacer(Modifier.weight(1f))
            Image(
                painter = painterResource(R.drawable.logo_white_tight),
                contentDescription = "Sita Yapı",
                modifier = Modifier.width(95.dp).alignBy { it.measuredHeight },
            )
        }
    }
}

@Composable
private fun Stat(label: String, value: String) {
    Column {
        Text(label, style = TextStyle(fontFamily = Poppins, color = White, fontSize = TvCaption1, fontWeight = FontWeight.SemiBold, letterSpacing = 0.5.sp))
        Text(value, style = TextStyle(fontFamily = Poppins, color = White, fontSize = 36.sp, fontWeight = FontWeight.Normal))
    }
}

/** Gün kartı: beyaz saydam zemin. */
@Composable
private fun DayCard(name: String, day: DailyWeather, modifier: Modifier) {
    Column(
        modifier
            .clip(RoundedCornerShape(10.dp))
            .background(Color(0x26FFFFFF))
            .padding(horizontal = 14.dp, vertical = 12.dp),
    ) {
        Text(name, style = TextStyle(fontFamily = Poppins, color = White, fontSize = TvBody, fontWeight = FontWeight.Normal))
        Spacer(Modifier.height(6.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("↑ ${day.max}°C", style = TextStyle(fontFamily = Poppins, color = White, fontSize = 19.sp, fontWeight = FontWeight.SemiBold))
                Text("↓ ${day.min}°C", style = TextStyle(fontFamily = Poppins, color = White80, fontSize = TvBody, fontWeight = FontWeight.Normal))
            }
            FlatWeatherIcon(day.code, 44.dp)
        }
    }
}

private fun dayName(index: Int, date: LocalDate): String = when (index) {
    0 -> "Bugün"
    1 -> "Yarın"
    else -> date.format(DateTimeFormatter.ofPattern("EEEE", turkish)).replaceFirstChar { it.titlecase(turkish) }
}

// ---------- İkonlar ----------
// Meteocons (Bas Milius, MIT lisansı — android/tv/ICONS-LICENSE-Meteocons-MIT.txt)
// "fill" setinin animasyonlu sürümü, Lottie biçiminde (assets/meteocons/*.json).
// SVG+WebView yerine Lottie: animasyonlar Android'in kendi çizim sistemiyle
// oynar — Mi Stick gibi zayıf cihazlarda hafif, eski WebView sürümlerinden bağımsız.

/** WMO hava durumu kodu → Meteocons ikon dosyası. Gece için ay'lı varyantlar. */
private fun weatherIconFile(code: Int, night: Boolean): String = when (code) {
    0 -> if (night) "clear-night" else "clear-day"
    1, 2 -> if (night) "partly-cloudy-night" else "partly-cloudy-day"
    3 -> if (night) "overcast-night" else "overcast-day"
    45, 48 -> if (night) "fog-night" else "fog-day"
    51, 53, 55, 56, 57 -> "drizzle"
    66, 67 -> "sleet"
    61, 63, 65 -> "rain"
    80, 81, 82 -> if (night) "rain" else "partly-cloudy-day-rain"
    71, 73, 75, 77, 85, 86 -> "snow"
    95, 96, 99 -> if (night) "thunderstorms-rain" else "thunderstorms-day-rain"
    else -> "cloudy"
} + ".json"

@Composable
fun FlatWeatherIcon(code: Int, iconSize: Dp, night: Boolean = false) {
    val composition by rememberLottieComposition(LottieCompositionSpec.Asset("meteocons/${weatherIconFile(code, night)}"))
    LottieAnimation(
        composition = composition,
        iterations = LottieConstants.IterateForever,
        modifier = Modifier.size(iconSize),
    )
}
