package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CurrencyLira
import androidx.compose.material.icons.filled.PersonSearch
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.HomeWidgetId
import com.vitra.sitaservisplanlayici.data.HomeWidgetPrefs
import com.vitra.sitaservisplanlayici.data.PartCheckout
import com.vitra.sitaservisplanlayici.data.Quote
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.Technician
import com.vitra.sitaservisplanlayici.data.isCriticalStock
import com.vitra.sitaservisplanlayici.data.toUserMessage
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun HomeScreen(appState: AppState, navController: NavController) {
    val user = appState.currentUser
    val context = LocalContext.current
    val widgetPrefs = remember { HomeWidgetPrefs(context) }
    val scope = rememberCoroutineScope()
    var editMode by remember { mutableStateOf(false) }
    var showAddWidgetSheet by remember { mutableStateOf(false) }

    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var apptByDate by remember { mutableStateOf<Map<String, List<Appointment>>>(emptyMap()) }
    var lowStock by remember { mutableStateOf<List<StockItem>>(emptyList()) }
    var quotes by remember { mutableStateOf<List<Quote>>(emptyList()) }
    var outstandingCheckouts by remember { mutableStateOf<List<PartCheckout>>(emptyList()) }
    var technicians by remember { mutableStateOf<List<Technician>>(emptyList()) }
    var selectedProgramDay by remember { mutableStateOf(LocalDate.now()) }
    // Program widget'ında gösterilen hafta: 0 = bu hafta, -1 geçen, +1 gelecek…
    var programWeekOffset by remember { mutableStateOf(0) }
    var programAppts by remember { mutableStateOf<Map<String, List<Appointment>>>(emptyMap()) }
    var programReloadKey by remember { mutableStateOf(0) }

    val today = LocalDate.now()
    val tomorrow = today.plusDays(1)
    val weekStart = today.with(DayOfWeek.MONDAY)
    val fmt = DateTimeFormatter.ISO_LOCAL_DATE
    val datesToFetch = remember {
        val programDays = (0..6).map { weekStart.plusDays(it.toLong()) }
        val rollingWeek = (0..6).map { today.minusDays(it.toLong()) }
        (programDays + rollingWeek + listOf(tomorrow, today)).map { it.format(fmt) }.distinct()
    }

    suspend fun reload() {
        try {
            coroutineScope {
                val apptDeferred = datesToFetch.associateWith { date ->
                    async { try { AppointmentsCache.refresh(date) } catch (_: Exception) { AppointmentsCache.peek(date) ?: emptyList() } }
                }
                val stockDeferred = async { try { StockCache.reload() } catch (_: Exception) { StockCache.peek() ?: emptyList() } }
                val quotesDeferred = async { try { Repository.listQuotes() } catch (_: Exception) { emptyList() } }
                val checkoutsDeferred = async { try { Repository.listPartCheckouts() } catch (_: Exception) { emptyList() } }
                val techDeferred = async { try { Repository.listTechnicians() } catch (_: Exception) { emptyList() } }

                apptByDate = apptDeferred.mapValues { it.value.await() }
                lowStock = stockDeferred.await().filter { it.isCriticalStock() }
                quotes = quotesDeferred.await()
                technicians = techDeferred.await()
                val todayIso = today.format(fmt)
                outstandingCheckouts = checkoutsDeferred.await()
                    .filter { it.status == "outstanding" && (it.date ?: "") < todayIso }
            }
            error = null
        } catch (e: Exception) {
            error = "Veriler yüklenemedi: ${e.toUserMessage()}"
        } finally {
            isLoading = false
        }
    }

    // "Stale-while-revalidate": sekmeler arası geçiş artık ekranı sıfırdan
    // oluşturduğu için (bkz. RootApp.kt'deki sekme geçişi düzeltmesi), önce
    // varsa önbellekteki veriyi ANINDA (yükleniyor ekranı göstermeden) çizip
    // ardından arkaplanda sessizce tazeliyoruz — ilk açılışta hâlâ normal
    // yükleme süresi var, ama tekrar ziyaretlerde bekleme hissi olmuyor.
    LaunchedEffect(Unit) {
        val cachedStock = StockCache.peek()
        val cachedAppts = datesToFetch.associateWith { AppointmentsCache.peek(it) }
        if (cachedStock != null && cachedAppts.values.all { it != null }) {
            lowStock = cachedStock.filter { it.isCriticalStock() }
            @Suppress("UNCHECKED_CAST")
            apptByDate = cachedAppts as Map<String, List<Appointment>>
            isLoading = false
        }
        reload()
    }

    val todayList = apptByDate[today.format(fmt)] ?: emptyList()
    val tomorrowList = apptByDate[tomorrow.format(fmt)] ?: emptyList()
    val todayCompleted = todayList.count { it.status == "completed" }
    val todayRouted = todayList.count { it.status == "routed" }
    val todayPending = todayList.count { it.status == "pending" }
    val tomorrowNotRouted = tomorrowList.count { it.status == "pending" }

    val pendingCollection = todayList
        .filter { it.status != "cancelled" && it.feeAmount != null && it.feePaid != true }
        .sumOf { it.feeAmount ?: 0.0 }

    val rollingWeekIsos = (0..6).map { today.minusDays(it.toLong()).format(fmt) }.toSet()
    val weekAppointments = apptByDate.filterKeys { it in rollingWeekIsos }.values.flatten().filter { it.status != "cancelled" }
    val weekCompletionRate = if (weekAppointments.isEmpty()) 0 else
        Math.round(weekAppointments.count { it.status == "completed" } * 100.0 / weekAppointments.size).toInt()

    val programWeekStart = weekStart.plusWeeks(programWeekOffset.toLong())
    // Seçili haftanın 7 günü: önbellekte varsa anında, sonra sunucudan tazelenir.
    LaunchedEffect(programWeekStart, programReloadKey) {
        val isos = (0..6).map { programWeekStart.plusDays(it.toLong()).format(fmt) }
        programAppts = isos.associateWith { AppointmentsCache.peek(it) ?: apptByDate[it] ?: emptyList() }
        programAppts = coroutineScope {
            isos.associateWith { d -> async { try { AppointmentsCache.refresh(d) } catch (_: Exception) { programAppts[d] ?: emptyList() } } }
                .mapValues { it.value.await() }
        }
    }
    fun programDay(day: LocalDate) = programAppts[day.format(fmt)] ?: apptByDate[day.format(fmt)] ?: emptyList()
    val programDayCounts = (0..6).associate { i ->
        val day = programWeekStart.plusDays(i.toLong())
        day to programDay(day).size
    }
    val selectedDayAppointments = programDay(selectedProgramDay)
    fun changeProgramWeek(offset: Int) {
        programWeekOffset = offset
        // Bu haftada bugün, başka haftada o haftanın pazartesisi seçili gelir.
        selectedProgramDay = if (offset == 0) today else weekStart.plusWeeks(offset.toLong())
    }

    fun toggleCompleted(appt: Appointment) {
        val myId = user?.id ?: return
        scope.launch {
            val newStatus = if (appt.status == "completed") "pending" else "completed"
            try {
                Repository.updateAppointmentStatus(appt.id, newStatus, myId)
                reload()
                programReloadKey++
            } catch (e: Exception) {
                android.widget.Toast.makeText(context, "Durum güncellenemedi: ${e.toUserMessage()}", android.widget.Toast.LENGTH_SHORT).show()
            }
        }
    }

    LazyColumn(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
        item {
            Spacer(Modifier.height(16.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Merhaba, ${user?.name ?: ""}", style = MaterialTheme.typography.headlineSmall)
                TextButton(onClick = { editMode = !editMode }) {
                    Text(if (editMode) "Bitti" else "Düzenle")
                }
            }
            Spacer(Modifier.height(12.dp))
            // Hızlı işlemler: ofiste en sık yapılan dört iş.
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                QuickActionTile("Randevu", Icons.Filled.CalendarMonth, MaterialTheme.colorScheme.primary, Modifier.weight(1f)) {
                    navController.navigate(ROUTE_APPOINTMENT_CREATE)
                }
                QuickActionTile("Satış", Icons.Filled.CurrencyLira, com.vitra.sitaservisplanlayici.ui.theme.StatusGreen, Modifier.weight(1f)) {
                    navController.navigate(ROUTE_QUICK_SALE)
                }
                QuickActionTile("Barkod", Icons.Filled.QrCodeScanner, com.vitra.sitaservisplanlayici.ui.theme.StatusOrange, Modifier.weight(1f)) {
                    appState.pendingStockScan = true
                    navController.navigate(ROUTE_STOCK) { launchSingleTop = true }
                }
                QuickActionTile("Müşteri Ara", Icons.Filled.PersonSearch, androidx.compose.ui.graphics.Color(0xFF8E44AD), Modifier.weight(1f)) {
                    appState.pendingAppointmentSearch = true
                    navController.navigate(ROUTE_APPOINTMENTS) { launchSingleTop = true }
                }
            }
            Spacer(Modifier.height(16.dp))
        }

        if (isLoading) {
            item {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { CircularProgressIndicator() }
                Spacer(Modifier.height(16.dp))
            }
        } else if (error != null) {
            item { Text(error!!, color = MaterialTheme.colorScheme.error) }
        } else {
            item {
                StatsGrid(
                    todayCount = todayList.count { it.status != "cancelled" },
                    todayDone = todayCompleted,
                    pendingCollection = pendingCollection,
                    weekCompletionRate = weekCompletionRate,
                    criticalStockCount = lowStock.size
                )
                Spacer(Modifier.height(20.dp))
            }

            items(widgetPrefs.visibleIds) { widgetId ->
                WidgetFrame(editMode = editMode, onRemove = { widgetPrefs.remove(widgetId) }) {
                    when (widgetId) {
                        HomeWidgetId.PROGRAM -> ProgramWidgetCard(
                            weekStart = programWeekStart,
                            isCurrentWeek = programWeekOffset == 0,
                            onPrevWeek = { changeProgramWeek(programWeekOffset - 1) },
                            onNextWeek = { changeProgramWeek(programWeekOffset + 1) },
                            onThisWeek = { changeProgramWeek(0) },
                            dayCounts = programDayCounts,
                            selectedDay = selectedProgramDay,
                            onSelectDay = { selectedProgramDay = it },
                            selectedDayAppointments = selectedDayAppointments,
                            technicians = technicians,
                            onToggleCompleted = ::toggleCompleted
                        )
                        HomeWidgetId.TODAY -> TodayAppointmentsWidgetCard(
                            upcoming = upcomingOf(todayList),
                            technicians = technicians,
                            count = todayList.size,
                            completed = todayCompleted,
                            routed = todayRouted,
                            pending = todayPending,
                            onClick = { navController.navigate(ROUTE_APPOINTMENTS) { launchSingleTop = true } }
                        )
                        HomeWidgetId.TOMORROW -> TomorrowAppointmentsWidgetCard(
                            upcoming = upcomingOf(tomorrowList),
                            technicians = technicians,
                            count = tomorrowList.size,
                            tomorrow = tomorrow,
                            notRouted = tomorrowNotRouted,
                            onClick = { navController.navigate(ROUTE_APPOINTMENTS) { launchSingleTop = true } }
                        )
                        HomeWidgetId.LOW_STOCK -> LowStockWidgetCard(
                            items = lowStock,
                            onSeeAll = { navController.navigate(ROUTE_STOCK) { launchSingleTop = true } }
                        )
                        HomeWidgetId.QUOTES -> QuotesWidgetCard(
                            quotes = quotes,
                            onSeeAll = { navController.navigate(ROUTE_TEKLIFLER) }
                        )
                        HomeWidgetId.OUTSTANDING_CHECKOUTS -> OutstandingCheckoutsWidgetCard(
                            checkouts = outstandingCheckouts,
                            technicians = technicians,
                            onSeeAll = { navController.navigate(ROUTE_ZIMMET) }
                        )
                    }
                }
                Spacer(Modifier.height(16.dp))
            }

            if (editMode) {
                item {
                    OutlinedButton(onClick = { showAddWidgetSheet = true }, modifier = Modifier.fillMaxWidth()) {
                        Icon(Icons.Filled.Add, contentDescription = null)
                        Spacer(Modifier.width(6.dp))
                        Text("Widget Ekle")
                    }
                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }

    if (showAddWidgetSheet) {
        AlertDialog(
            onDismissRequest = { showAddWidgetSheet = false },
            title = { Text("Widget Ekle") },
            text = {
                Column {
                    val hidden = widgetPrefs.hiddenIds
                    if (hidden.isEmpty()) {
                        Text("Eklenecek widget yok — hepsi zaten görünür.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    } else {
                        hidden.forEach { id ->
                            TextButton(onClick = { widgetPrefs.add(id); showAddWidgetSheet = false }, modifier = Modifier.fillMaxWidth()) {
                                Text(id.title, Modifier.weight(1f))
                                Icon(Icons.Filled.Add, contentDescription = null)
                            }
                        }
                    }
                }
            },
            confirmButton = {
                TextButton(onClick = { showAddWidgetSheet = false }) { Text("Kapat") }
            }
        )
    }
}

/** Sıradaki (tamamlanmamış) en fazla 3 randevu — rota sırasına göre. */
private fun upcomingOf(list: List<Appointment>): List<Appointment> =
    list.filter { it.status != "completed" && it.status != "cancelled" }.sortedBy { it.stopOrder ?: 999 }.take(3)

/** Ana sayfa hızlı işlem kutusu: renkli ikon + kısa başlık. */
@Composable
private fun QuickActionTile(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, tint: androidx.compose.ui.graphics.Color, modifier: Modifier, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = modifier) {
        Column(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(icon, contentDescription = null, tint = tint)
            Spacer(Modifier.height(4.dp))
            Text(title, style = MaterialTheme.typography.labelMedium, maxLines = 1)
        }
    }
}
