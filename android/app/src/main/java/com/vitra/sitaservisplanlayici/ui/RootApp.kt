package com.vitra.sitaservisplanlayici.ui

import android.content.ContextWrapper
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.Alignment
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import com.vitra.sitaservisplanlayici.R
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Chat
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.delay
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.sp
import androidx.compose.material3.MaterialTheme
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.ui.zIndex
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Cast
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.vitra.sitaservisplanlayici.data.AppLockState
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Repository
import androidx.compose.runtime.rememberCoroutineScope
import kotlinx.coroutines.launch
import com.vitra.sitaservisplanlayici.ui.more.AktiviteScreen
import com.vitra.sitaservisplanlayici.ui.more.BekleyenParcalarScreen
import com.vitra.sitaservisplanlayici.ui.more.DepolarScreen
import com.vitra.sitaservisplanlayici.ui.more.GelenSiparislerScreen
import com.vitra.sitaservisplanlayici.ui.more.MoreScreen
import com.vitra.sitaservisplanlayici.ui.more.ProfileScreen
import com.vitra.sitaservisplanlayici.ui.more.TekliflerScreen
import com.vitra.sitaservisplanlayici.ui.more.QuoteCreateScreen
import com.vitra.sitaservisplanlayici.ui.more.UcretTakipScreen
import com.vitra.sitaservisplanlayici.ui.more.ZimmetScreen

private object Tab {
    const val HOME = "home"
    const val APPOINTMENTS = "appointments"
    const val STOCK = "stock"
    const val MESSAGES = "messages"
    const val MORE = "more"
}

// Alt sekmelerin route'ları — başka ekranlardan (ör. Ana Sayfa'daki
// "Tümünü Gör") programatik olarak bu sekmelere atlayabilmek için public.
const val ROUTE_STOCK = Tab.STOCK
const val ROUTE_APPOINTMENTS = Tab.APPOINTMENTS

private object Route {
    const val CHAT = "chat/{userId}/{name}"
    const val ZIMMET = "zimmet"
    const val TEKLIFLER = "teklifler"
    const val BEKLEYEN_PARCALAR = "bekleyen-parcalar"
    const val GELEN_SIPARISLER = "gelen-siparisler"
    const val DEPOLAR = "depolar"
    const val AKTIVITE = "aktivite"
    const val PROFILE = "profil"
    const val APPOINTMENT_CREATE = "appointment-create"
    const val QUICK_SALE = "quick-sale"
    const val APPOINTMENT_DETAIL = "appointment-detail/{id}/{date}"
    const val APPOINTMENT_EDIT = "appointment-edit/{id}/{date}"
    const val CUSTOMER_HISTORY = "customer-history/{name}"
    const val MAP = "harita"
    const val ROUTE_BUILDER = "rota-olustur"
    const val QUOTE_PRINT = "quote-print/{id}"
    const val QUOTE_DETAIL = "quote/{id}"
    const val UCRET_TAKIP = "ucret-takip"
}

tailrec fun android.content.Context.findActivity(): FragmentActivity? = when (this) {
    is FragmentActivity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

@Composable
fun RootApp(appState: AppState) {
    // Android 12+'ta sistemin kendi SplashScreen API'si sadece KÜÇÜK bir ikon
    // alanı destekliyor — "SİTA YAPI" yazısıyla birlikte TAM logoyu orada
    // göstermenin bir yolu yok (android:background'ı tamamen görmezden
    // geliyor, bkz. styles.xml'deki not). Bu yüzden kısa süreliğine, tam
    // kontrolümüzde olan bu Compose ekranını gösteriyoruz — sistemin kendi
    // (kaçınılmaz, çok kısa) ikon yanıp sönmesinden hemen sonra kullanıcı
    // asıl markayı (sembol + yazı) burada görüyor.
    var showBrandSplash by remember { mutableStateOf(true) }
    LaunchedEffect(Unit) {
        delay(900)
        showBrandSplash = false
    }
    if (showBrandSplash) {
        Box(Modifier.fillMaxSize().background(Color.White), contentAlignment = Alignment.Center) {
            Image(
                painter = painterResource(id = R.drawable.logo_full),
                contentDescription = "Sita Yapı",
                modifier = Modifier.fillMaxWidth(0.68f),
                contentScale = ContentScale.FillWidth
            )
        }
        return
    }

    val user = appState.currentUser
    if (user == null) {
        LoginScreen(onLoggedIn = { appState.login(it) })
        return
    }

    val context = LocalContext.current
    val appLockState = remember { AppLockState(context) }

    // iOS'taki RootView.swift'teki gibi: uygulama arka plana her gittiğinde
    // (ON_STOP) kilidi tekrar devreye sokuyoruz — ön plana dönünce yeniden
    // kimlik doğrulaması istenir.
    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_STOP) appLockState.lock()
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    if (appLockState.isEnabled && !appLockState.isUnlocked) {
        val activity = context.findActivity()
        LaunchedEffect(Unit) {
            if (activity != null) appLockState.authenticate(activity) { }
        }
        LockScreenView(onUnlockTapped = {
            if (activity != null) appLockState.authenticate(activity) { }
        })
        return
    }

    AuthenticatedApp(appState = appState, appLockState = appLockState)
}

@Composable
private fun AuthenticatedApp(appState: AppState, appLockState: AppLockState) {
    val user = appState.currentUser ?: return

    // iOS'taki RootTabView.swift'teki aynı "oturum hâlâ geçerli mi?" düzeltmesi:
    // kullanıcı sunucuda silinmişse (ör. dev veritabanı sıfırlandığında), her
    // yazma işleminde çiğ bir hata göstermek yerine sessizce çıkış yaptırıyoruz.
    LaunchedEffect(user.id) {
        try {
            val users = Repository.listUsers()
            if (users.none { it.id == user.id }) appState.logout()
        } catch (_: Exception) {
            // Ağ hatası oturumu sonlandırmaz, sadece geçici bir bağlantı sorunudur.
        }
    }

    // iOS'taki HomeView.swift'teki UNUserNotificationCenter.requestAuthorization
    // ile aynı görev — reddedilirse sessizce hiçbir şey olmaz. API 33 altında
    // bildirim izni zaten sistem tarafından otomatik verilir.
    val notificationPermissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { }
    LaunchedEffect(user.id) {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            notificationPermissionLauncher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    // FcmService.onNewToken genelde ilk kurulumda, kullanıcı henüz giriş
    // yapmadan tetikleniyor (SessionHolder.userId o an null) ve bir daha
    // çağrılmıyor — token sunucuya hiç ulaşmıyordu. iOS'taki girişten sonra
    // registerForRemoteNotifications çağrısının karşılığı olarak mevcut token'ı
    // her girişte açıkça alıp kaydediyoruz. google-services.json yokken
    // FirebaseApp başlatılmadığı için getInstance() fırlatır — yutuyoruz.
    val scope = rememberCoroutineScope()
    LaunchedEffect(user.id) {
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().token
                .addOnSuccessListener { token ->
                    scope.launch {
                        try {
                            Repository.registerDeviceToken(user.id, token, "android", user.id)
                        } catch (_: Exception) { }
                    }
                }
        } catch (_: IllegalStateException) { }
    }

    // Mesajlar sekmesindeki gerçek zamanlı bağlantı olmadığından (bkz.
    // MessagesScreen'deki aynı not), rozet sayısını da periyodik olarak
    // sessizce yeniliyoruz.
    LaunchedEffect(user.id) {
        while (true) {
            appState.refreshUnreadMessageCount()
            kotlinx.coroutines.delay(8000)
        }
    }

    val navController = rememberNavController()
    val tabs = listOf(
        Triple(Tab.HOME, "Ana Sayfa", Icons.Filled.Home),
        Triple(Tab.APPOINTMENTS, "Randevular", Icons.Filled.DateRange),
        Triple(Tab.STOCK, "Stok", Icons.Filled.Inventory2),
        Triple(Tab.MESSAGES, "Mesajlar", Icons.Filled.Chat),
        Triple(Tab.MORE, "Daha Fazla", Icons.Filled.MoreHoriz)
    )

    Scaffold(
        bottomBar = {
            val backStackEntry by navController.currentBackStackEntryAsState()
            val currentDestination = backStackEntry?.destination
            // Sekme adları tek satırda kalsın: dar ekranlarda ya da büyük yazı tipi
            // ayarında ("Daha Fazla" Oppo'da 2. satıra geçiyordu) hepsi AYNI oranda küçülür.
            val labelStyle = MaterialTheme.typography.labelMedium
            val measurer = androidx.compose.ui.text.rememberTextMeasurer()
            val density = androidx.compose.ui.platform.LocalDensity.current
            val screenWidthDp = androidx.compose.ui.platform.LocalConfiguration.current.screenWidthDp
            val labelFontSize = remember(screenWidthDp, density.fontScale, labelStyle) {
                // NavigationBar: yanlarda 8dp boşluk, öğeler arasında 8dp; etiket kenarlarından 2dp pay.
                val slotPx = with(density) { ((screenWidthDp - 16 - 8 * (tabs.size - 1)) / tabs.size.toFloat() - 4).dp.toPx() }
                var size = labelStyle.fontSize.value
                while (size > 8f && tabs.any { (_, label, _) ->
                        measurer.measure(label, labelStyle.copy(fontSize = size.sp), maxLines = 1, softWrap = false).size.width > slotPx
                    }) size -= 0.5f
                size.sp
            }
            NavigationBar {
                tabs.forEach { (route, label, icon) ->
                    val selected = currentDestination?.hierarchy?.any { it.route == route } == true
                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            // NOT: saveState/restoreState BİLEREK kullanılmıyor — bu uygulamada
                            // sekmeler ayrı iç içe (nested) grafikler değil, tüm ekranlar
                            // (randevu detayı, müşteri geçmişi vb. dahil) TEK düz NavHost'ta.
                            // saveState=true + restoreState=true kombinasyonu (Google'ın
                            // sekme-başına-ayrı-grafik senaryosu için önerdiği desen) bu düz
                            // yapıda, bir detay ekranından sekmeye basıldığında yanlış/eski
                            // bir geri yığını durumunu geri yüklüyor ve kullanıcı sekmeler
                            // arası geçiş yapamıyormuş gibi takılı kalıyordu. Basit popUpTo
                            // ile her sekme geçişinde o sekmenin köküne temiz dönüyoruz.
                            navController.navigate(route) {
                                popUpTo(navController.graph.findStartDestination().id)
                                launchSingleTop = true
                            }
                        },
                        icon = {
                            if (route == Tab.MESSAGES && appState.unreadMessageCount > 0) {
                                BadgedBox(badge = { Badge { Text("${appState.unreadMessageCount}") } }) {
                                    Icon(icon, contentDescription = label)
                                }
                            } else {
                                Icon(icon, contentDescription = label)
                            }
                        },
                        label = { Text(label, style = labelStyle.copy(fontSize = labelFontSize), maxLines = 1, softWrap = false) }
                    )
                }
            }
        }
    ) { padding ->
        // enableEdgeToEdge() ile pencere artık klavye açıldığında OS tarafından
        // otomatik küçültülmüyor (adjustResize edge-to-edge'de kendi başına
        // yetmiyor) — bu yüzden Compose tarafında imePadding() ile klavye
        // yüksekliği kadar alttan boşluk bırakılması gerekiyor. Bu olmadan
        // (ör. ChatScreen'de) klavye açıkken tüm içerik yukarı kayıp durum
        // çubuğunun arkasında kayboluyor, kullanıcı yazdığı mesajı da
        // gönder sonrası gelen mesajı da göremiyordu.
        // Android cihaz çeşitliliği telefonla sınırlı değil — tabletler ve
        // katlanabilir telefonlar (açıldığında tablet genişliğine çıkan
        // ekranlar) çok daha geniş olabiliyor. Bu ekranlar için ayrı bir
        // tablet düzeni tasarlanmadığından, içerik sınırsız genişlese tek
        // sütunlu formlar/sohbet balonları anlamsız şekilde gerilirdi — bu
        // yüzden içerik genişliği makul bir üst sınırla (600dp, büyük
        // telefonların/küçük tabletlerin biraz üstü) sınırlanıp ortalanıyor;
        // dar telefonlarda bu sınıra hiç ulaşılmadığı için görünüşte hiçbir
        // fark yaratmıyor.
        // consumeWindowInsets: alt menü + sistem çubuğu boşluğu zaten `padding` ile verildi;
        // tüketildi olarak işaretlenmezse imePadding klavye yüksekliğinin TAMAMINI bir daha
        // ekliyor ve klavyenin üstünde alt menü kadar anlamsız bir boşluk kalıyordu.
        Box(Modifier.padding(padding).consumeWindowInsets(padding).imePadding().fillMaxSize(), contentAlignment = Alignment.TopCenter) {
            // TV yayın şeridi: alt menünün hemen üstünde (bkz. TvBroadcastBar).
            TvBroadcastBar(appState, Modifier.align(Alignment.BottomCenter).zIndex(1f).padding(bottom = 12.dp))
            // Geçişler: sekmeler arası anında (günde onlarca kez yapılan iş, animasyon
            // yavaş hissettirir); detay ekranları 200 ms'lik kısa bir solma ile.
            val tabRoutes = setOf(Tab.HOME, Tab.APPOINTMENTS, Tab.STOCK, Tab.MESSAGES, Tab.MORE)
            NavHost(
                navController = navController,
                startDestination = Tab.HOME,
                modifier = Modifier.fillMaxHeight().widthIn(max = 600.dp),
                enterTransition = {
                    if (targetState.destination.route in tabRoutes && initialState.destination.route in tabRoutes) androidx.compose.animation.EnterTransition.None
                    else androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(200))
                },
                exitTransition = {
                    if (targetState.destination.route in tabRoutes && initialState.destination.route in tabRoutes) androidx.compose.animation.ExitTransition.None
                    else androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(150))
                },
                popEnterTransition = { androidx.compose.animation.fadeIn(androidx.compose.animation.core.tween(200)) },
                popExitTransition = { androidx.compose.animation.fadeOut(androidx.compose.animation.core.tween(150)) }
            ) {
            composable(Tab.HOME) { HomeScreen(appState = appState, navController = navController) }
            composable(Tab.APPOINTMENTS) { AppointmentsScreen(appState = appState, navController = navController) }
            composable(Tab.STOCK) { StockScreen(appState = appState) }
            composable(Tab.MESSAGES) { MessagesScreen(appState = appState, navController = navController) }
            composable(Tab.MORE) { MoreScreen(appState = appState, appLockState = appLockState, navController = navController) }

            composable(Route.CHAT) { backStackEntry ->
                val userId = backStackEntry.arguments?.getString("userId").orEmpty()
                val encodedName = backStackEntry.arguments?.getString("name").orEmpty()
                val name = java.net.URLDecoder.decode(encodedName, "UTF-8")
                ChatScreen(appState = appState, contactId = userId, contactName = name, navController = navController)
            }
            composable(Route.ZIMMET) { ZimmetScreen(appState = appState, navController = navController) }
            composable(Route.TEKLIFLER) { TekliflerScreen(navController) }
            composable(ROUTE_TEKLIF_YENI) { QuoteCreateScreen(appState = appState, navController = navController) }
            composable(Route.BEKLEYEN_PARCALAR) { BekleyenParcalarScreen(appState = appState, navController = navController) }
            composable(Route.GELEN_SIPARISLER) { GelenSiparislerScreen(appState = appState, navController = navController) }
            composable(Route.DEPOLAR) { DepolarScreen(navController) }
            composable(Route.AKTIVITE) { AktiviteScreen(appState = appState, navController = navController) }
            composable(Route.UCRET_TAKIP) { UcretTakipScreen(appState = appState, navController = navController) }
            composable(Route.PROFILE) { ProfileScreen(appState = appState, navController = navController) }
            composable(Route.APPOINTMENT_CREATE) { AppointmentCreateScreen(appState = appState, navController = navController) }
            composable(Route.QUICK_SALE) { QuickSaleScreen(appState = appState, navController = navController) }
            composable(Route.APPOINTMENT_DETAIL) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id").orEmpty()
                val date = backStackEntry.arguments?.getString("date").orEmpty()
                AppointmentDetailScreen(appState = appState, appointmentId = id, scheduledDate = date, navController = navController)
            }
            composable(Route.APPOINTMENT_EDIT) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id").orEmpty()
                val date = backStackEntry.arguments?.getString("date").orEmpty()
                AppointmentEditScreen(appState = appState, appointmentId = id, scheduledDate = date, navController = navController)
            }
            composable(Route.CUSTOMER_HISTORY) { backStackEntry ->
                val encoded = backStackEntry.arguments?.getString("name").orEmpty()
                val name = java.net.URLDecoder.decode(encoded, "UTF-8")
                CustomerHistoryScreen(customerName = name, navController = navController)
            }
            composable(Route.MAP) { MapScreen(navController = navController) }
            composable(Route.ROUTE_BUILDER) { RouteBuilderScreen(appState = appState, navController = navController) }
            composable(Route.QUOTE_DETAIL) { backStackEntry ->
                QuoteDetailScreen(quoteId = backStackEntry.arguments?.getString("id").orEmpty(), appState = appState, navController = navController)
            }
            composable(Route.QUOTE_PRINT) { backStackEntry ->
                val id = backStackEntry.arguments?.getString("id").orEmpty()
                val quoteState = androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<com.vitra.sitaservisplanlayici.data.Quote?>(null) }
                LaunchedEffect(id) {
                    quoteState.value = try { Repository.listQuotes().firstOrNull { it.id == id } } catch (_: Exception) { null }
                }
                quoteState.value?.let { QuotePrintScreen(quote = it, navController = navController, appState = appState) }
            }
            }
        }
    }
}

fun chatRoute(userId: String, name: String) = "chat/$userId/${java.net.URLEncoder.encode(name, "UTF-8")}"
const val ROUTE_ZIMMET = "zimmet"
const val ROUTE_TEKLIFLER = "teklifler"
const val ROUTE_TEKLIF_YENI = "teklif-yeni"
const val ROUTE_BEKLEYEN_PARCALAR = "bekleyen-parcalar"
const val ROUTE_GELEN_SIPARISLER = "gelen-siparisler"
const val ROUTE_DEPOLAR = "depolar"
const val ROUTE_AKTIVITE = "aktivite"
const val ROUTE_UCRET_TAKIP = "ucret-takip"
const val ROUTE_PROFILE = "profil"
const val ROUTE_APPOINTMENT_CREATE = "appointment-create"
const val ROUTE_QUICK_SALE = "quick-sale"
const val ROUTE_MAP = "harita"
const val ROUTE_ROUTE_BUILDER = "rota-olustur"
fun quotePrintRoute(id: String) = "quote-print/$id"
fun quoteDetailRoute(id: String) = "quote/$id"

/**
 * Bu telefon ofisteki TV'de yayın yaparken görünen şerit — neyin yayında olduğunu
 * gösterir ve tek dokunuşla durdurur (masaüstündeki TvBroadcastBar.jsx ile aynı).
 * Başka bir cihaz yayın yapınca ya da yayın durdurulunca 6 sn içinde kaybolur.
 */
@Composable
fun TvBroadcastBar(appState: AppState, modifier: Modifier = Modifier) {
    val onAir = appState.tvOnAir ?: return
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    var isStopping by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf(false) }
    var error by androidx.compose.runtime.remember { androidx.compose.runtime.mutableStateOf<String?>(null) }
    LaunchedEffect(onAir.sentAt) {
        while (true) {
            kotlinx.coroutines.delay(6_000)
            appState.refreshTvOnAir()
        }
    }
    androidx.compose.material3.Surface(
        modifier = modifier.padding(horizontal = 16.dp).widthIn(max = 560.dp),
        shape = androidx.compose.foundation.shape.RoundedCornerShape(50),
        color = MaterialTheme.colorScheme.secondaryContainer,
        border = androidx.compose.foundation.BorderStroke(1.dp, MaterialTheme.colorScheme.primary),
        shadowElevation = 6.dp,
    ) {
        androidx.compose.foundation.layout.Row(
            Modifier.padding(start = 14.dp, end = 6.dp, top = 6.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(Icons.Filled.Cast, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            androidx.compose.foundation.layout.Spacer(Modifier.width(10.dp))
            androidx.compose.foundation.layout.Column(Modifier.weight(1f)) {
                Text("TV'de yayında: ${onAir.title}", style = MaterialTheme.typography.titleSmall, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
                val sub = error ?: onAir.subtitle
                if (!sub.isNullOrBlank()) {
                    Text(sub, style = MaterialTheme.typography.bodySmall, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis,
                        color = if (error != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            androidx.compose.material3.Button(
                onClick = {
                    isStopping = true
                    error = null
                    scope.launch {
                        runCatching { appState.stopTv() }.onFailure { error = it.message ?: "Durdurulamadı." }
                        isStopping = false
                    }
                },
                enabled = !isStopping,
                colors = androidx.compose.material3.ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 14.dp, vertical = 6.dp)
            ) {
                Icon(Icons.Filled.Stop, contentDescription = null, modifier = Modifier.size(16.dp))
                androidx.compose.foundation.layout.Spacer(Modifier.width(4.dp))
                Text(if (isStopping) "Durduruluyor…" else "Durdur")
            }
        }
    }
}
