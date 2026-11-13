package com.vitra.sitayapitv

import android.view.KeyEvent
import kotlin.math.roundToInt
import androidx.compose.ui.layout.FirstBaseline
import kotlinx.coroutines.launch
import androidx.lifecycle.lifecycleScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.getValue
import android.net.ConnectivityManager
import android.net.Network
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.Crossfade
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
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
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import coil.compose.SubcomposeAsyncImage
import coil.compose.AsyncImage
import coil.request.ImageRequest
import coil.imageLoader
import kotlinx.coroutines.delay
import java.text.NumberFormat
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

// Açık, sade vitrin teması: ürün fotoğrafları çoğunlukla beyaz zeminli katalog
// görselleri — zemin de beyaz olunca fotoğraf bir kutu içinde değil, doğrudan
// ekranda duruyormuş gibi görünür. Renkler logo.svg'deki laciverte/turkuaza dayanır.
internal val Paper = Color(0xFFFFFFFF)
internal val Ink = Color(0xFF0E2A3B)
internal val Muted = Color(0xFF7A8C95)
internal val Hairline = Color(0xFFE7ECEE)
internal val Accent = Color(0xFF3EACA7)
internal val Warning = Color(0xFFE0A030)
internal val Danger = Color(0xFFD9534F)

internal val turkish = Locale.forLanguageTag("tr-TR")

// Apple İnsan Arayüzü Yönergeleri (tvOS) — Apple TV 1920x1080 noktalık tuval
// kullanır, bizim tuvalimiz 960x540 dp (bkz. FixedCanvas): değerler yarıya
// çevrildi. Güvenli alan üst/alt 60 pt, yanlar 80 pt; en küçük yazı 23 pt
// (Caption 2); Light/Thin kalınlıklar kullanılmaz.
internal val TvSafeSide = 40.dp
internal val TvSafeVertical = 30.dp
internal val TvCaption1 = 12.5.sp  // 25 pt
internal val TvCaption2 = 11.5.sp  // 23 pt — en küçük
internal val TvBody = 14.5.sp      // 29 pt
internal val TvCallout = 15.5.sp

// Bekleme ekranı saati ve Poppins'te rakam yüksekliğinin yazı boyutuna oranı
// (logo, rakamların dikey ortasına hizalanır).
private val CLOCK_SIZE = 52.sp
private const val POPPINS_DIGIT_HEIGHT = 0.70f

// Buzlu cam zemini: bulanık fotoğraf + açık ton. Modifier.blur yalnız Android
// 12+ (API 31) çalışır; daha eski cihazlarda (ör. eski Mi Box) fotoğraf keskin
// kalacağından ton koyulaştırılır ki yazılar okunur kalsın.
internal val FrostTint: Color =
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) Color(0x8CF5F7F8) else Color(0xE6F5F7F8)   // 31 pt

// Uygulamadaki tüm yazılar Poppins (Google Fonts, OFL — android/tv/FONT-LICENSE-Poppins-OFL.txt).
internal val Poppins = FontFamily(
    Font(R.font.poppins_thin, FontWeight.Thin),
    Font(R.font.poppins_light, FontWeight.Light),
    // Gerçek italik (bayram mesajı) — yoksa Android düz harfleri eğerek sahte italik çizer.
    Font(R.font.poppins_light_italic, FontWeight.Light, FontStyle.Italic),
    Font(R.font.poppins_regular, FontWeight.Normal),
    Font(R.font.poppins_medium, FontWeight.Medium),
    Font(R.font.poppins_semibold, FontWeight.SemiBold),
    Font(R.font.poppins_bold, FontWeight.Bold),
)

// Bekleme ekranında bu kadar kalınınca VitrA video döngüsüne geçilir (bkz.
// VideoScreen.kt). Test için: adb shell am start -S -n
// com.vitra.sitayapitv/.MainActivity --ei idleSeconds 10
// Hava durumu sayfasını sabit göstermek (tasarım kontrolü) için: --ez pinWeather true
private const val DEFAULT_IDLE_SECONDS = 5 * 60
// Videolar bu kadar oynadıktan sonra bekleme ekranına dönülür; böylece
// yayın yokken 5 dk bekleme ekranı / 25 dk video şeklinde döngü olur.
// Test için: --ei videoSeconds 20
private const val DEFAULT_VIDEO_SECONDS = 25 * 60

private object VideoMode
private object NightMode

class MainActivity : ComponentActivity() {
    private val tvSettings by lazy { TvSettings(this) }
    private val channel: TvChannel? by lazy {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_KEY.isBlank()) null
        else TvChannel(BuildConfig.SUPABASE_URL, BuildConfig.SUPABASE_KEY, tvSettings)
    }

    // Kumanda kısayolları (bkz. RemoteKeys); diğer tuşlar (geri, ana sayfa) sisteme bırakılır.
    override fun dispatchKeyEvent(event: KeyEvent): Boolean =
        RemoteKeys.handle(event) || super.dispatchKeyEvent(event)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        AppUptime.startedAt = android.os.SystemClock.elapsedRealtime()
        SpecialDays.init(this)
        // Vitrin ekranı: TV hiç uyku moduna/ekran koruyucuya geçmesin, sistem
        // çubukları görünmesin.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
        // Hava durumu sayfasının İstanbul fotoğraflarını şimdiden hazırla (bkz. IstanbulPhotos).
        lifecycleScope.launch { IstanbulPhotos.warmUp(applicationContext) }
        setContent {
            val ch = channel
            if (intent.getBooleanExtra("screenTest", false)) {
                // Kurulumda TV'nin görüntüyü kırpıp kırpmadığını görmek için (ScreenFitTest.kt).
                FixedCanvas { ScreenFitTest() }
            } else if (ch == null) {
                MissingConfigScreen()
            } else {
                TvApp(
                    ch,
                    tvSettings,
                    idleSeconds = intent.getIntExtra("idleSeconds", DEFAULT_IDLE_SECONDS),
                    videoSeconds = intent.getIntExtra("videoSeconds", DEFAULT_VIDEO_SECONDS),
                    pinWeather = intent.getBooleanExtra("pinWeather", false),
                )
            }
        }
    }

    // Wi-Fi koptuğunda/geri geldiğinde 5 sn'lik yeniden deneme beklenmeden bağlanılsın.
    private val networkCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            channel?.reconnectIfNeeded()
        }
    }

    override fun onStart() {
        super.onStart()
        channel?.start()
        getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(networkCallback)
    }

    override fun onStop() {
        runCatching { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(networkCallback) }
        channel?.stop()
        super.onStop()
    }
}

@Composable
private fun TvApp(channel: TvChannel, tvSettings: TvSettings, idleSeconds: Int, videoSeconds: Int, pinWeather: Boolean = false) {
    val current by channel.current.collectAsState()
    val connection by channel.connection.collectAsState()
    val config by tvSettings.config.collectAsState()
    // Kumanda menüsünden seçilen akış (Normal / Hava durumu / Video) — cihazda saklanır.
    val flowMode by tvSettings.flowMode.collectAsState()
    var showVideo by remember { mutableStateOf(false) }
    // Video akışında videolar açılamazsa (internet yok) bir süre bekleme ekranı gösterilir.
    var videoFailed by remember { mutableStateOf(false) }
    // Mesai dışı karartma (Ayarlar > TV Ekranları): dakikada bir kontrol edilir.
    // Mesai dışında bir yayın gelirse yine gösterilir.
    val now = rememberNow()
    val dimmed = config.isDimmedAt(now.toLocalTime())

    // Normal akış: bekleme ekranı idleSeconds → videolar videoSeconds → bekleme ekranı…
    // Ürün/teklif yayınlanınca video kapanır; yayın bitip bekleme ekranına
    // dönülünce döngü bekleme ekranından baştan başlar. Hava durumu / Video
    // akışlarında döngü yok: seçilen sayfa sürekli kalır.
    LaunchedEffect(current, showVideo, dimmed, flowMode) {
        if (dimmed || current != null || flowMode != FlowMode.NORMAL) {
            showVideo = false
        } else if (!showVideo) {
            delay(idleSeconds * 1_000L)
            showVideo = true
        } else {
            delay(videoSeconds * 1_000L)
            showVideo = false
        }
    }

    LaunchedEffect(videoFailed) {
        if (videoFailed) {
            delay(60_000L)
            videoFailed = false
        }
    }

    // "Geri": ürün ya da (normal akışta) video gösterilirken bekleme ekranına
    // dön. Bekleme ekranındayken varsayılan davranış (uygulamadan çıkış) korunur.
    BackHandler(enabled = current != null || showVideo) {
        if (current != null) channel.dismissLocally() else showVideo = false
    }

    val videoActive = showVideo || (flowMode == FlowMode.VIDEO && !videoFailed)
    val screen: Any? = current ?: if (dimmed) NightMode else if (videoActive) VideoMode else null
    val weatherPinned = pinWeather || flowMode == FlowMode.WEATHER

    // Uzaktan güncelleme: açılışta ve 6 saatte bir GitHub'a bakılır; yeni sürüm
    // varsa bekleme ekranında kumandanın OK tuşuyla kurulur (Updater.kt).
    val update by Updater.state.collectAsState()
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        while (true) {
            Updater.check()
            delay(6 * 60 * 60 * 1_000L)
        }
    }

    // Kumanda menüsü (FlowMenu.kt): yayın yokken ve mesai içindeyken OK ile açılır.
    val menuAllowed = current == null && !dimmed
    var menuOpen by remember { mutableStateOf(false) }
    var infoOpen by remember { mutableStateOf(false) }
    var menuFocus by remember { mutableStateOf(0) }
    var menuTouch by remember { mutableStateOf(0) }  // her tuşta artar → 10 sn sayaç baştan
    val menuItems = flowMenuItems(update)
    val scope = rememberCoroutineScope()
    SideEffect { RemoteKeys.menuOpen = menuOpen || infoOpen }
    LaunchedEffect(menuAllowed) {
        if (!menuAllowed) {
            menuOpen = false
            infoOpen = false
            return@LaunchedEffect
        }
        RemoteKeys.events.collect { key ->
            val items = flowMenuItems(Updater.state.value)
            if (infoOpen) {
                if (key == RemoteKey.SELECT) infoOpen = false
                return@collect
            }
            if (!menuOpen) {
                if (key == RemoteKey.SELECT) {
                    menuFocus = items.indexOfFirst { it.mode == tvSettings.flowMode.value }.coerceAtLeast(0)
                    menuOpen = true
                    menuTouch++
                }
                return@collect
            }
            menuTouch++
            when (key) {
                RemoteKey.UP -> menuFocus = (menuFocus - 1 + items.size) % items.size
                RemoteKey.DOWN -> menuFocus = (menuFocus + 1) % items.size
                RemoteKey.SELECT -> {
                    val item = items.getOrNull(menuFocus)
                    menuOpen = false
                    when (item?.action) {
                        MenuAction.FLOW -> item.mode?.let {
                            tvSettings.setFlowMode(it)
                            showVideo = false
                            videoFailed = false
                        }
                        MenuAction.UPDATE -> scope.launch { Updater.install(context) }
                        MenuAction.INFO -> infoOpen = true
                        null -> Unit
                    }
                }
                else -> Unit
            }
        }
    }
    LaunchedEffect(menuOpen, menuTouch) {
        if (menuOpen) {
            delay(10_000L)
            menuOpen = false
        }
    }
    // Bilgi penceresi okunacak çok satır içerdiği için 30 sn açık kalır.
    LaunchedEffect(infoOpen) {
        if (infoOpen) {
            delay(30_000L)
            infoOpen = false
        }
    }
    BackHandler(enabled = menuOpen) { menuOpen = false }
    BackHandler(enabled = infoOpen) { infoOpen = false }

    FixedCanvas {
        Box(Modifier.fillMaxSize()) {
            AnimatedContent(
                targetState = screen,
                transitionSpec = {
                    (fadeIn(tween(600)) + scaleIn(tween(600), initialScale = 0.985f)) togetherWith fadeOut(tween(250))
                },
                contentKey = {
                    when (it) {
                        is TvPayload -> "${it.kind}-${it.sentAt}"
                        VideoMode -> "video"
                        NightMode -> "night"
                        else -> if (weatherPinned) "weather" else "idle"
                    }
                },
                label = "tv-content",
            ) { state ->
                when (state) {
                    is TvPayload -> when {
                        state.quote != null -> QuoteScreen(state.quote)
                        state.routes != null -> RoutesScreen(state.routes)
                        state.dashboard != null -> DashboardScreen(state.dashboard)
                        state.product != null -> ProductScreen(state.product)
                        else -> IdleScreen(weatherPinned)
                    }
                    NightMode -> NightScreen()
                    VideoMode -> Box(Modifier.fillMaxSize()) {
                        VideoScreen(onFailed = {
                            showVideo = false
                            if (flowMode == FlowMode.VIDEO) videoFailed = true
                        })
                        // Videonun üstünde de marka görünsün (zeminsiz beyaz logo). Boşluksuz
                        // sürüm: görünen logo güvenli alanın köşesine tam oturur.
                        Image(
                            painter = painterResource(R.drawable.logo_white_tight),
                            contentDescription = "Sita Yapı",
                            modifier = Modifier
                                .align(Alignment.BottomEnd)
                                .padding(end = TvSafeSide, bottom = TvSafeVertical)
                                .width(139.dp),
                        )
                    }
                    else -> IdleScreen(weatherPinned)
                }
            }
            if (BuildConfig.SUPABASE_KEY.startsWith("sb_secret_")) {
                // Üst kenardan TV'lerin kırptığı şeridin (%2–3) dışında dursun.
                StatusPill("Geliştirme anahtarı", Danger, Modifier.align(Alignment.TopCenter).padding(top = 20.dp))
            }
            if (screen == null) {
                val text = when (val u = update) {
                    is UpdateState.Available -> "Yeni sürüm ${u.version} hazır — OK menüsünden kurabilirsiniz"
                    is UpdateState.Downloading -> "Yeni sürüm ${u.version} indiriliyor…"
                    is UpdateState.Confirming -> "Yeni sürüm ${u.version}: ekrandaki \"Güncelle\"yi seçip OK'e basın"
                    is UpdateState.Failed -> "${u.message} — OK menüsünden yeniden deneyin"
                    UpdateState.None -> null
                }
                if (text != null) {
                    StatusPill(text, if (update is UpdateState.Failed) Danger else Accent, Modifier.align(Alignment.TopCenter).padding(top = 54.dp))
                }
            }
            AnimatedVisibility(visible = menuOpen, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
                FlowMenu(menuItems, menuFocus, flowMode)
            }
            AnimatedVisibility(visible = infoOpen, enter = fadeIn(tween(200)), exit = fadeOut(tween(200))) {
                InfoPanel(connection, config, flowMode, update)
            }
            if (connection != ConnectionState.CONNECTED) {
                StatusPill(
                    if (connection == ConnectionState.CONNECTING) "Bağlanıyor" else "Bağlantı yok",
                    if (connection == ConnectionState.CONNECTING) Warning else Danger,
                    Modifier.align(Alignment.TopEnd).padding(top = 20.dp, end = TvSafeSide),
                )
            }
        }
    }
}

/**
 * Ekran 960x540 dp'lik sabit bir tuval gibi tasarlandı; gerçek ekranın
 * yoğunluğu ne olursa olsun (1080p/4K TV, emülatör) tuval ekrana sığacak
 * şekilde ölçeklenir — yazılar/fotoğraf her TV'de aynı oranda görünür.
 */
@Composable
private fun FixedCanvas(content: @Composable () -> Unit) {
    BoxWithConstraints(Modifier.fillMaxSize().background(Paper), contentAlignment = Alignment.Center) {
        val scale = minOf(constraints.maxWidth / 960f, constraints.maxHeight / 540f)
        CompositionLocalProvider(LocalDensity provides Density(scale, fontScale = 1f)) {
            ProvideTextStyle(TextStyle(fontFamily = Poppins)) {
                Box(Modifier.size(960.dp, 540.dp)) { content() }
            }
        }
    }
}

/** Mesai dışı: siyah zeminde soluk saat (ekranı ve elektriği yormaz). */
@Composable
private fun NightScreen() {
    val now = rememberNow()
    Box(Modifier.fillMaxSize().background(Color.Black), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                now.format(DateTimeFormatter.ofPattern("HH:mm", turkish)),
                style = TextStyle(fontFamily = Poppins, color = Color(0x40FFFFFF), fontSize = 48.sp, fontWeight = FontWeight.Normal),
            )
            // Bekleme ekranındaki tarih biçimi (soluk).
            Text(
                now.format(DateTimeFormatter.ofPattern("d MMMM yyyy  ·  EEEE", turkish)).uppercase(turkish),
                style = TextStyle(fontFamily = Poppins, color = Color(0x40FFFFFF), fontSize = TvCaption1, fontWeight = FontWeight.Normal, letterSpacing = 1.5.sp),
            )
            Spacer(Modifier.height(10.dp))
            Text(
                "Mesai dışı",
                style = TextStyle(fontFamily = Poppins, color = Color(0x26FFFFFF), fontSize = TvCaption1, fontWeight = FontWeight.Normal),
            )
        }
    }
}

@Composable
private fun rememberNow(): LocalDateTime {
    var now by remember { mutableStateOf(LocalDateTime.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = LocalDateTime.now()
            delay(1_000L * (60 - now.second).coerceAtLeast(1))
        }
    }
    return now
}

// Bekleme ekranı arka planları: vitra.com.tr/v-/koleksiyonlar sayfasındaki
// yazısız koleksiyon kapak fotoğrafları (1376x800). İnternet olmadan da
// çalışsın, sitede dosya adları değişince bozulmasın diye uygulamaya gömülü
// (src/main/assets/backgrounds). Yeni fotoğraf eklemek için o klasöre .jpg
// koymak yeterli.
private const val BACKGROUND_DIR = "backgrounds"
private const val BACKGROUND_SECONDS = 12
// Her bu kadar fotoğraftan sonra haftalık hava durumu sayfası gösterilir.
private const val WEATHER_EVERY = 4
private const val WEATHER_SECONDS = 24

@Composable
private fun IdleScreen(pinWeather: Boolean = false) {
    val now = rememberNow()
    val weather = rememberWeather()
    val context = LocalContext.current
    // Döngü: fotoğraflar, her WEATHER_EVERY fotoğrafta bir araya giren
    // haftalık hava durumu sayfası (listede null). Hava durumu henüz
    // alınamadıysa o sayfa atlanır. Fotoğraflar: uygulamadaki VitrA
    // fotoğrafları + vitra.com.tr'den gelen ortam fotoğrafları (VitraBackgrounds), karışık.
    val remote by VitraBackgrounds.urls.collectAsState()
    LaunchedEffect(Unit) { VitraBackgrounds.refresh() }
    val slides: List<String?> = remember(remote.isNotEmpty()) {
        val bundled = runCatching { context.assets.list(BACKGROUND_DIR)?.filter { it.endsWith(".jpg") } }
            .getOrNull().orEmpty().map { "file:///android_asset/$BACKGROUND_DIR/$it" }
        val photos = (bundled + VitraBackgrounds.urls.value).shuffled()
        buildList {
            photos.forEachIndexed { i, photo ->
                add(photo)
                if ((i + 1) % WEATHER_EVERY == 0) add(null)
            }
            if (photos.isEmpty()) add(null)
        }
    }
    var index by remember { mutableStateOf(0) }
    // Döngü bir kez başlatılıyor; hava durumu sonradan geldiğinde güncel
    // değeri görsün diye (yoksa ilk anki null'ı hatırlayıp sayfayı hep atlardı).
    val latestWeather by rememberUpdatedState(weather)
    LaunchedEffect(slides) {
        if (slides.size < 2) return@LaunchedEffect
        while (true) {
            // Hava durumu sayfası daha uzun kalır: arkasında birkaç İstanbul fotoğrafı dönebilsin.
            delay((if (slides[index] == null) WEATHER_SECONDS else BACKGROUND_SECONDS) * 1_000L)
            var next = (index + 1) % slides.size
            if (slides[next] == null && latestWeather == null) next = (next + 1) % slides.size
            index = next
            // Sıradaki uzak fotoğrafı önceden indir: geçişte boş kare görünmesin.
            slides.getOrNull((index + 1) % slides.size)?.let { context.imageLoader.enqueue(ImageRequest.Builder(context).data(it).build()) }
        }
    }
    if (pinWeather && weather != null) {
        WeatherSlide(weather)
        return
    }
    val slide = slides.getOrNull(index)
    val showWeather = slide == null && weather != null

    Box(Modifier.fillMaxSize().background(Ink)) {
        Crossfade(targetState = index, animationSpec = tween(1_500), label = "idle-background") { i ->
            val photo = slides.getOrNull(i)
            if (photo == null) {
                if (weather != null) WeatherSlide(weather) else Box(Modifier.fillMaxSize().background(Paper))
                return@Crossfade
            }
            // Ken Burns: fotoğraf ekranda kaldığı süre boyunca çok yavaş
            // yakınlaşır — durağan fotoğrafa hafif bir canlılık katar.
            val zoom = remember(i) { Animatable(1f) }
            LaunchedEffect(i) {
                zoom.animateTo(1.08f, tween((BACKGROUND_SECONDS + 2) * 1_000, easing = LinearEasing))
            }
            AsyncImage(
                model = photo,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                // Dikey fotoğraf tam ekranda kötü kırpılır: listeden düşür, hemen sıradakine geç.
                onSuccess = { state ->
                    val d = state.result.drawable
                    if (!photo.startsWith("file:") && d.intrinsicHeight > d.intrinsicWidth) {
                        VitraBackgrounds.markPortrait(photo)
                        if (index == i) index = (i + 1) % slides.size
                    }
                },
                modifier = Modifier.fillMaxSize().graphicsLayer {
                    scaleX = zoom.value
                    scaleY = zoom.value
                },
            )
        }
        // Fotoğrafların üstündeki logo + saat; hava durumu sayfasının kendi
        // düzeni olduğu için orada gizlenir.
        AnimatedVisibility(
            visible = !showWeather,
            enter = fadeIn(tween(1_500)),
            exit = fadeOut(tween(800)),
            modifier = Modifier.fillMaxSize(),
        ) {
            Box(Modifier.fillMaxSize()) {
                // Özel gün mesajı (bayram, öğretmenler günü…) — sol üstte, üstten hafif karartmayla.
                val specialDays by SpecialDays.days.collectAsState()
                val greeting = SpecialDays.forDate(now.toLocalDate(), specialDays)
                if (greeting != null) {
                    Box(
                        Modifier
                            .fillMaxWidth()
                            .fillMaxHeight(0.35f)
                            .background(Brush.verticalGradient(listOf(Color(0x99000000), Color.Transparent))),
                    )
                    Row(
                        Modifier.align(Alignment.TopStart).padding(horizontal = TvSafeSide, vertical = TvSafeVertical).fillMaxWidth(0.75f),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        // Resmi bayramlarda mesajın önünde Türk bayrağı (yazıyla dikeyde ortalı).
                        if (greeting.flag) {
                            TurkishFlag(
                                Modifier
                                    .height(28.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                            )
                            Spacer(Modifier.width(12.dp))
                        }
                        Text(
                            greeting.text,
                            style = TextStyle(
                                // İnce, italik, sakin bir kutlama satırı.
                                fontFamily = Poppins, color = Color.White, fontSize = 20.sp, lineHeight = 28.sp,
                                fontWeight = FontWeight.Light, fontStyle = FontStyle.Italic,
                                shadow = androidx.compose.ui.graphics.Shadow(Color(0x66000000), androidx.compose.ui.geometry.Offset(0f, 2f), 12f),
                            ),
                        )
                    }
                }
                // Alttan yukarı hafif karartma: logo ve saat her fotoğrafta okunsun.
                Box(
                    Modifier
                        .fillMaxWidth()
                        .fillMaxHeight(0.45f)
                        .align(Alignment.BottomCenter)
                        .background(Brush.verticalGradient(listOf(Color.Transparent, Color(0x99000000)))),
                )
                // Alt satır: solda logo, sağda saat + tarih. Logo boşluksuz sürüm,
                // sol güvenli alan çizgisinde; dikey ortası saat rakamlarının dikey
                // ortasında (saatin taban çizgisi − rakam yüksekliğinin yarısı).
                val density = LocalDensity.current
                val clockDigitTop = with(density) { (CLOCK_SIZE * POPPINS_DIGIT_HEIGHT).toPx() }.roundToInt()
                Row(
                    Modifier.align(Alignment.BottomStart).fillMaxWidth().padding(horizontal = TvSafeSide, vertical = TvSafeVertical),
                    verticalAlignment = Alignment.Bottom,
                ) {
                Image(
                    painter = painterResource(R.drawable.logo_white_tight),
                    contentDescription = "Sita Yapı",
                    modifier = Modifier.width(220.dp).alignBy { it.measuredHeight / 2 + clockDigitTop / 2 },
                )
                Spacer(Modifier.weight(1f))
                Column(
                    Modifier.alignBy(FirstBaseline),
                    horizontalAlignment = Alignment.End,
                ) {
                    Text(
                        now.format(DateTimeFormatter.ofPattern("HH:mm", turkish)),
                        style = TextStyle(fontFamily = Poppins, color = Color.White, fontSize = CLOCK_SIZE, fontWeight = FontWeight.Light, letterSpacing = 1.sp),
                    )
                    val date = now.format(DateTimeFormatter.ofPattern("d MMMM yyyy  ·  EEEE", turkish))
                    Text(
                        date.uppercase(turkish),
                        style = TextStyle(fontFamily = Poppins, color = Color(0xD9FFFFFF), fontSize = TvCaption1, fontWeight = FontWeight.Light, letterSpacing = 1.5.sp),
                    )
                }
                }
            }
        }
    }
}

@Composable
private fun StatusPill(text: String, color: Color, modifier: Modifier = Modifier) {
    Row(
        modifier
            .clip(RoundedCornerShape(999.dp))
            .background(Color(0xFFF3F6F7))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(6.dp).clip(CircleShape).background(color))
        Spacer(Modifier.width(8.dp))
        Text(text, style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = TvCaption2, fontWeight = FontWeight.Medium))
    }
}

@Composable
private fun MissingConfigScreen() {
    FixedCanvas {
        Column(
            Modifier.fillMaxSize().padding(64.dp),
            verticalArrangement = Arrangement.Center,
        ) {
            Text("Kurulum eksik", style = TextStyle(fontFamily = Poppins, color = Ink, fontSize = 32.sp, fontWeight = FontWeight.Medium))
            Spacer(Modifier.height(12.dp))
            Text(
                "android/tv/supabase.properties dosyasına Supabase adresi ve publishable anahtar yazılıp uygulama yeniden derlenmeli.",
                style = TextStyle(fontFamily = Poppins, color = Muted, fontSize = 15.sp, lineHeight = 22.sp),
            )
        }
    }
}
