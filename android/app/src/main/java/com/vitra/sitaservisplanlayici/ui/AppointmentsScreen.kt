package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Undo
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.EventBusy
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.TextButton
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import com.vitra.sitaservisplanlayici.data.Technician
import kotlinx.coroutines.delay
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import com.vitra.sitaservisplanlayici.data.hapticConfirm
import androidx.compose.ui.zIndex
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.toUserMessage
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AppointmentsScreen(appState: AppState, navController: NavController) {
    var date by remember { mutableStateOf(LocalDate.now()) }
    var appointments by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }
    var technicians by remember { mutableStateOf<List<Technician>>(emptyList()) }
    // Hafta şeridindeki günlerin randevu sayıları (seçili tarihin haftası).
    var weekCounts by remember { mutableStateOf<Map<LocalDate, Int>>(emptyMap()) }
    val weekStart = date.with(java.time.DayOfWeek.MONDAY)
    LaunchedEffect(weekStart) {
        weekCounts = (0L..6L).map { weekStart.plusDays(it) }.associateWith { day ->
            runCatching { Repository.appointmentsByDate(day.format(DateTimeFormatter.ISO_LOCAL_DATE)).count { it.status != "cancelled" } }.getOrDefault(0)
        }
    }
    // Arama: müşteri adı ya da telefon — tarihten bağımsız (en yeni 50 randevu).
    var query by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isSearching by remember { mutableStateOf(false) }
    var searchFocused by remember { mutableStateOf(false) }
    val searchActive = query.trim().length >= 2
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) { technicians = runCatching { Repository.listTechnicians() }.getOrDefault(emptyList()) }
    LaunchedEffect(query) {
        val q = query.trim()
        if (q.length < 2) { searchResults = emptyList(); return@LaunchedEffect }
        delay(350) // yazarken her harfte istek atılmasın
        isSearching = true
        searchResults = runCatching { Repository.searchAppointments(q) }.getOrDefault(searchResults)
        isSearching = false
    }

    // "Geri al": durum değiştikten (tamamlandı ↔ bekliyor) sonra kısa süre önceki duruma dönülebilir.
    val snackbar = androidx.compose.runtime.remember { androidx.compose.material3.SnackbarHostState() }
    val view = androidx.compose.ui.platform.LocalView.current

    fun toggleStatus(appt: Appointment, afterwards: suspend () -> Unit) {
        val myId = appState.currentUser?.id ?: return
        scope.launch {
            val previous = appt.status ?: "pending"
            val newStatus = if (appt.status == "completed") "pending" else "completed"
            try {
                Repository.updateAppointmentStatus(appt.id, newStatus, myId)
                view.hapticConfirm()
                afterwards()
                // Önceki bildirim hâlâ ekrandaysa kapat: showSnackbar sıraya girer,
                // yeni işlemin "Geri al"ı eskisi bitene kadar görünmüyordu.
                snackbar.currentSnackbarData?.dismiss()
                val label = if (newStatus == "completed") "tamamlandı" else "bekliyor olarak işaretlendi"
                val result = snackbar.showSnackbar(
                    message = "${appt.customerName ?: "Randevu"} $label",
                    actionLabel = "Geri al",
                    duration = androidx.compose.material3.SnackbarDuration.Short
                )
                if (result == androidx.compose.material3.SnackbarResult.ActionPerformed) {
                    Repository.updateAppointmentStatus(appt.id, previous, myId)
                    afterwards()
                }
            } catch (e: Exception) {
                android.widget.Toast.makeText(context, "Durum güncellenemedi: ${e.toUserMessage()}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    suspend fun reload(showSpinner: Boolean) {
        if (showSpinner) isLoading = true
        try {
            appointments = AppointmentsCache.refresh(date.format(DateTimeFormatter.ISO_LOCAL_DATE))
            error = null
        } catch (e: Exception) {
            error = "Randevular yüklenemedi: ${e.toUserMessage()}"
        } finally {
            isLoading = false
            isRefreshing = false
        }
    }

    // Önbellekte bu tarih için veri varsa anında göster (sekmeler arası hızlı
    // geçiş için — bkz. HomeScreen.kt'deki aynı "stale-while-revalidate"
    // gerekçesi), yoksa normal yükleme ekranını göster; her iki durumda da
    // arkaplanda sessizce tazeleniyor.
    LaunchedEffect(date) {
        val cached = AppointmentsCache.peek(date.format(DateTimeFormatter.ISO_LOCAL_DATE))
        if (cached != null) {
            appointments = cached
            isLoading = false
            reload(showSpinner = false)
        } else {
            reload(showSpinner = true)
        }
    }

    Box(Modifier.fillMaxSize()) {
    // Sağ altta "Randevu Oluştur" butonu; "Geri al" bildirimi çıkınca butonun altına
    // yerleşir ve buton yukarı kayar (üst üste binmezler).
    Column(
        Modifier.align(Alignment.BottomCenter).fillMaxWidth().zIndex(1f),
        horizontalAlignment = Alignment.End
    ) {
        if (!searchActive && !searchFocused) {
            androidx.compose.material3.FloatingActionButton(
                onClick = { navController.navigate(ROUTE_APPOINTMENT_CREATE) },
                modifier = Modifier.padding(16.dp)
            ) {
                Icon(Icons.Filled.Add, contentDescription = "Randevu Oluştur")
            }
        }
        androidx.compose.material3.SnackbarHost(snackbar)
    }
    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text("Randevular", style = MaterialTheme.typography.headlineSmall)
            Box {
                IconButton(onClick = { menuExpanded = true }) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "Diğer")
                }
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    DropdownMenuItem(text = { Text("Harita") }, onClick = {
                        menuExpanded = false
                        navController.navigate(ROUTE_MAP)
                    })
                    DropdownMenuItem(text = { Text("Rota Oluştur") }, onClick = {
                        menuExpanded = false
                        navController.navigate(ROUTE_ROUTE_BUILDER)
                    })
                }
            }
        }
        Spacer(Modifier.height(8.dp))
        // Ana sayfadaki "Müşteri Ara" hızlı işlemi: arama kutusu odaklanır, klavye açılır.
        val searchFocus = androidx.compose.runtime.remember { androidx.compose.ui.focus.FocusRequester() }
        LaunchedEffect(appState.pendingAppointmentSearch) {
            if (appState.pendingAppointmentSearch) {
                appState.pendingAppointmentSearch = false
                runCatching { searchFocus.requestFocus() }
            }
        }
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            placeholder = { Text("Müşteri adı veya telefon") },
            leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth().focusRequester(searchFocus).onFocusChanged { searchFocused = it.isFocused }
        )
        if (searchFocused && query.isBlank() && appState.recentAppointments.isNotEmpty()) {
            Spacer(Modifier.height(12.dp))
            LazyColumn {
                item { Text("Son Bakılanlar", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                items(appState.recentAppointments, key = { "recent-" + it.id }) { appt ->
                    AppointmentCard(
                        appt = appt,
                        technicians = technicians,
                        showDate = true,
                        onClick = { navController.navigate(appointmentDetailRoute(appt.id, appt.scheduledDate ?: date.format(DateTimeFormatter.ISO_LOCAL_DATE))) },
                        onToggleStatus = { toggleStatus(appt) { reload(showSpinner = false) } }
                    )
                }
            }
            return@Column
        }
        if (searchActive) {
            Spacer(Modifier.height(12.dp))
            when {
                isSearching && searchResults.isEmpty() -> CircularProgressIndicator()
                searchResults.isEmpty() -> Text("“${query.trim()}” ile eşleşen randevu yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn {
                    item { Text("${searchResults.size} randevu", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(searchResults, key = { it.id }) { appt ->
                        AppointmentCard(
                            appt = appt,
                            technicians = technicians,
                            showDate = true,
                            onClick = { navController.navigate(appointmentDetailRoute(appt.id, appt.scheduledDate ?: date.format(DateTimeFormatter.ISO_LOCAL_DATE))) },
                            onToggleStatus = { toggleStatus(appt) { searchResults = Repository.searchAppointments(query.trim()) } }
                        )
                    }
                }
            }
            return@Column
        }
        Spacer(Modifier.height(8.dp))
        WeekStrip(date = date, counts = weekCounts, onSelect = { date = it })
        Spacer(Modifier.height(12.dp))

        when {
            isLoading -> CircularProgressIndicator()
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
            else -> PullToRefreshBox(
                isRefreshing = isRefreshing,
                onRefresh = {
                    isRefreshing = true
                    scope.launch { reload(showSpinner = false) }
                },
                modifier = Modifier.fillMaxSize()
            ) {
                if (appointments.isEmpty()) {
                    // Boş durum: ikon + açıklama + doğrudan "Randevu Oluştur".
                    Column(Modifier.fillMaxWidth().padding(top = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Filled.EventBusy, contentDescription = null, tint = MaterialTheme.colorScheme.outline, modifier = Modifier.size(56.dp))
                        Spacer(Modifier.height(12.dp))
                        Text("Bu tarihte randevu yok", style = MaterialTheme.typography.titleMedium)
                        Text("Seçili gün için kayıtlı randevu bulunmuyor.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(16.dp))
                        androidx.compose.material3.Button(onClick = { navController.navigate(ROUTE_APPOINTMENT_CREATE) }) { Text("Randevu Oluştur") }
                    }
                } else {
                    LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 88.dp)) { // son kart "+" butonunun altında kalmasın
                        items(appointments, key = { it.id }) { appt ->
                            AppointmentCard(
                                appt = appt,
                                technicians = technicians,
                                onClick = { navController.navigate(appointmentDetailRoute(appt.id, appt.scheduledDate ?: date.format(DateTimeFormatter.ISO_LOCAL_DATE))) },
                                onToggleStatus = { toggleStatus(appt) { reload(showSpinner = false) } }
                            )
                        }
                    }
                }
            }
        }
    }
}
}

// Masaüstündeki src/lib/techColors.js ile aynı palet ve sıra (atanmamış: gri).
private val TECH_PALETTE = listOf(
    0xFF3EACA7, 0xFFC0392B, 0xFF8E44AD, 0xFF2980B9, 0xFFD35400,
    0xFF27AE60, 0xFFF39C12, 0xFF16A085, 0xFFC2185B, 0xFF5D4037,
)

fun technicianColor(id: String?, technicians: List<Technician>): Color {
    val idx = technicians.indexOfFirst { it.id == id }
    return if (id == null || idx < 0) Color(0xFF7F8C8D) else Color(TECH_PALETTE[idx % TECH_PALETTE.size])
}

/** Mahalle (yoksa ilçe, o da yoksa adresin ilk parçası) — kartın ikinci satırı için kısa konum. */
private fun shortPlace(a: Appointment): String? =
    a.addressDetail?.mahalle?.takeIf { it.isNotBlank() }?.replace(" Mahallesi", "")?.replace(" Mah.", "")?.let(::trTitle)
        ?: a.addressDetail?.ilce?.takeIf { it.isNotBlank() }?.let(::trTitle)
        ?: a.address?.substringBefore(",")?.trim()?.takeIf { it.isNotBlank() }

/** Durum rozeti rengi: tamamlandı yeşil, rotalandı mavi, iptal kırmızı, bekliyor gri. */
@Composable
private fun statusTint(status: String?): Color = when (status) {
    "completed" -> com.vitra.sitaservisplanlayici.ui.theme.StatusGreen
    "routed" -> MaterialTheme.colorScheme.primary
    "cancelled" -> com.vitra.sitaservisplanlayici.ui.theme.StatusRed
    else -> MaterialTheme.colorScheme.onSurfaceVariant
}

/**
 * Randevu kartı: solda teknisyen renginde şerit, rota sırası dairede; ad (Acil ise kırmızı
 * nokta), altında "mahalle · şikâyetin ilk satırı"; sağda küçük durum rozeti (dokununca
 * tamamlandı/bekliyor). Aynı bilgi eskisinin yarı yüksekliğinde. Aramada tarih de görünür.
 */
/**
 * iOS'taki swipeActions karşılığı: sağa kaydır → tamamlandı/bekliyor, sola kaydır → müşteriyi ara.
 * Kart yerinde kalır (kaydırma sadece eylemi tetikler), durum değişikliği Snackbar ile geri alınabilir.
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun AppointmentCard(
    appt: Appointment,
    technicians: List<Technician>,
    onClick: () -> Unit,
    onToggleStatus: () -> Unit,
    showDate: Boolean = false,
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val phoneDigits = appt.customerPhone.orEmpty().filter { it.isDigit() || it == '+' }
    // rememberSwipeToDismissBoxState, confirmValueChange'i İLK çizimde yakalayıp saklıyor.
    // Liste yenilenip kartlar yer değiştirince kaydırma, o konumdaki ESKİ randevuya
    // uygulanıyordu (yanlış randevu değişiyor, "Geri al" çıkmıyordu). Güncel değerler
    // rememberUpdatedState ile okunur; liste öğeleri de randevu id'siyle anahtarlanır.
    val currentToggle by androidx.compose.runtime.rememberUpdatedState(onToggleStatus)
    val currentPhone by androidx.compose.runtime.rememberUpdatedState(phoneDigits)
    val state = androidx.compose.material3.rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            when (value) {
                androidx.compose.material3.SwipeToDismissBoxValue.StartToEnd -> currentToggle()
                androidx.compose.material3.SwipeToDismissBoxValue.EndToStart -> if (currentPhone.isNotEmpty()) {
                    context.startActivity(android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:$currentPhone")))
                }
                else -> {}
            }
            false
        },
        positionalThreshold = { it * 0.35f }
    )
    androidx.compose.material3.SwipeToDismissBox(
        state = state,
        enableDismissFromEndToStart = phoneDigits.isNotEmpty(),
        backgroundContent = {
            val toEnd = state.dismissDirection == androidx.compose.material3.SwipeToDismissBoxValue.StartToEnd
            val done = appt.status == "completed"
            val bg = if (toEnd) (if (done) com.vitra.sitaservisplanlayici.ui.theme.StatusOrange else com.vitra.sitaservisplanlayici.ui.theme.StatusGreen) else MaterialTheme.colorScheme.primary
            Box(
                Modifier.fillMaxSize().padding(vertical = 4.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(12.dp)).background(bg).padding(horizontal = 20.dp),
                contentAlignment = if (toEnd) Alignment.CenterStart else Alignment.CenterEnd
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        if (toEnd) (if (done) Icons.Filled.Undo else Icons.Filled.Check) else Icons.Filled.Call,
                        contentDescription = null,
                        tint = androidx.compose.ui.graphics.Color.White
                    )
                    Spacer(Modifier.width(8.dp))
                    Text(
                        if (toEnd) (if (done) "Bekliyor" else "Tamamlandı") else "Ara",
                        color = androidx.compose.ui.graphics.Color.White,
                        style = MaterialTheme.typography.labelLarge
                    )
                }
            }
        }
    ) {
        AppointmentCardContent(appt, technicians, onClick, onToggleStatus, showDate)
    }
}

@Composable
private fun AppointmentCardContent(
    appt: Appointment,
    technicians: List<Technician>,
    onClick: () -> Unit,
    onToggleStatus: () -> Unit,
    showDate: Boolean = false,
) {
    val tint = technicianColor(appt.assignedTechnicianId, technicians)
    Card(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
            .clickable(onClick = onClick)
    ) {
        Row(Modifier.padding(start = 0.dp, end = 12.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.padding(start = 6.dp).width(5.dp).height(40.dp).clip(androidx.compose.foundation.shape.RoundedCornerShape(3.dp)).background(tint))
            Spacer(Modifier.width(10.dp))
            Box(
                Modifier.size(30.dp).clip(CircleShape).background(tint.copy(alpha = 0.14f))
                    .border(1.25.dp, tint, CircleShape),
                contentAlignment = Alignment.Center
            ) {
                // stopOrder 0'dan başlıyor; masaüstündeki TV rota ekranı gibi 1'den gösterilir.
                Text(appt.stopOrder?.let { "${it + 1}" } ?: "–", style = MaterialTheme.typography.labelLarge)
            }
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        appt.customerName ?: "(isimsiz)",
                        style = MaterialTheme.typography.titleMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f, fill = false)
                    )
                    if (appt.urgency == "acil") {
                        Spacer(Modifier.width(6.dp))
                        Box(Modifier.size(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.error))
                    }
                    if (!appt.geocodeIssue.isNullOrBlank()) {
                        Spacer(Modifier.width(6.dp))
                        Text("⚠", style = MaterialTheme.typography.labelSmall, color = com.vitra.sitaservisplanlayici.ui.theme.StatusOrange)
                    }
                }
                val date = if (showDate) appt.scheduledDate?.let {
                    runCatching { LocalDate.parse(it.take(10)).format(DateTimeFormatter.ofPattern("dd/MM/yyyy")) }.getOrNull()
                } else null
                val complaint = appt.complaint?.lineSequence()?.firstOrNull()?.takeIf { it.isNotBlank() }
                Text(
                    listOfNotNull(date, shortPlace(appt), complaint).joinToString(" · ").ifEmpty { "—" },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            Spacer(Modifier.width(8.dp))
            val st = statusTint(appt.status)
            Text(
                statusLabel(appt.status),
                style = MaterialTheme.typography.labelMedium,
                color = st,
                modifier = Modifier
                    .clip(androidx.compose.foundation.shape.RoundedCornerShape(50))
                    .background(st.copy(alpha = 0.12f))
                    .clickable(onClick = onToggleStatus)
                    .padding(horizontal = 10.dp, vertical = 4.dp)
            )
        }
    }
}

private fun statusLabel(status: String?): String = when (status) {
    "completed" -> "Tamamlandı"
    "routed" -> "Rotalandı"
    "cancelled" -> "İptal Edildi"
    else -> "Bekliyor"
}

/** Randevular ekranının üstündeki hafta şeridi: 7 gün ve randevu sayıları; oklarla hafta değişir. */
@Composable
private fun WeekStrip(date: LocalDate, counts: Map<LocalDate, Int>, onSelect: (LocalDate) -> Unit) {
    val tr = Locale("tr")
    val start = date.with(java.time.DayOfWeek.MONDAY)
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(horizontal = 4.dp, vertical = 6.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onSelect(date.minusWeeks(1)) }) { Icon(Icons.Filled.ChevronLeft, contentDescription = "Önceki hafta") }
                Text(
                    date.format(DateTimeFormatter.ofPattern("LLLL yyyy", tr)).replaceFirstChar { it.titlecase(tr) },
                    style = MaterialTheme.typography.titleSmall,
                    modifier = Modifier.weight(1f)
                )
                if (date != LocalDate.now()) {
                    TextButton(onClick = { onSelect(LocalDate.now()) }) { Text("Bugün") }
                }
                // Uzak bir tarihe tek dokunuşla gitmek için takvim (iOS'taki DatePicker gibi).
                var showPicker by remember { mutableStateOf(false) }
                IconButton(onClick = { showPicker = true }) { Icon(Icons.Filled.CalendarMonth, contentDescription = "Tarih seç") }
                if (showPicker) DatePickerModal(date, onDismiss = { showPicker = false }, onPick = onSelect)
                IconButton(onClick = { onSelect(date.plusWeeks(1)) }) { Icon(Icons.Filled.ChevronRight, contentDescription = "Sonraki hafta") }
            }
            Row(Modifier.fillMaxWidth()) {
                (0L..6L).map { start.plusDays(it) }.forEach { day ->
                    val selected = day == date
                    val isToday = day == LocalDate.now()
                    val count = counts[day] ?: 0
                    Column(
                        Modifier
                            .weight(1f)
                            .padding(horizontal = 2.dp)
                            .clip(androidx.compose.foundation.shape.RoundedCornerShape(10.dp))
                            .background(if (selected) MaterialTheme.colorScheme.primary else Color.Transparent)
                            .clickable { onSelect(day) }
                            .padding(vertical = 6.dp),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Text(day.dayOfWeek.getDisplayName(TextStyle.SHORT, tr), style = MaterialTheme.typography.labelSmall,
                            color = if (selected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
                        Text("${day.dayOfMonth}", style = MaterialTheme.typography.titleMedium,
                            color = when { selected -> Color.White; isToday -> MaterialTheme.colorScheme.primary; else -> MaterialTheme.colorScheme.onSurface })
                        Text(if (count > 0) "$count" else "·", style = MaterialTheme.typography.labelSmall,
                            color = when { selected -> Color.White; count > 0 -> MaterialTheme.colorScheme.primary; else -> MaterialTheme.colorScheme.onSurfaceVariant })
                    }
                }
            }
        }
    }
}

/** "MEHMET AKİF" → "Mehmet Akif" (TV rota ekranındaki gibi; büyük harf küçük boyda zor okunur). */
private fun trTitle(s: String): String {
    val tr = Locale("tr")
    return s.lowercase(tr).split(" ").joinToString(" ") { w -> w.replaceFirstChar { it.titlecase(tr) } }
}
