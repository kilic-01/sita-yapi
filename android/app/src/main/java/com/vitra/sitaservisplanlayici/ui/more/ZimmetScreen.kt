package com.vitra.sitaservisplanlayici.ui.more

import com.vitra.sitaservisplanlayici.data.trDate
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.clickable
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.Depot
import com.vitra.sitaservisplanlayici.data.PartCheckout
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.StockItemDepot
import com.vitra.sitaservisplanlayici.data.Technician
import com.vitra.sitaservisplanlayici.data.codeAndName
import com.vitra.sitaservisplanlayici.data.toUserMessage
import com.vitra.sitaservisplanlayici.ui.BarcodeScannerDialog
import com.vitra.sitaservisplanlayici.ui.CheckoutPrintGroup
import com.vitra.sitaservisplanlayici.ui.CheckoutPrintRow
import com.vitra.sitaservisplanlayici.ui.PartCheckoutsPrintHtml
import com.vitra.sitaservisplanlayici.ui.PrintPreviewDialog
import kotlinx.coroutines.launch
import java.text.Collator
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ZimmetScreen(appState: AppState, navController: NavController) {
    var items by remember { mutableStateOf<List<PartCheckout>>(emptyList()) }
    var technicians by remember { mutableStateOf<List<Technician>>(emptyList()) }
    var stockNames by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var stockById by remember { mutableStateOf<Map<String, StockItem>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var reconcileTarget by remember { mutableStateOf<PartCheckout?>(null) }
    var showCreateDialog by remember { mutableStateOf(false) }
    var printDate by remember { mutableStateOf(LocalDate.now()) }
    var showPrintDialog by remember { mutableStateOf(false) }
    // Önce isimleri listeliyoruz, bir isme basılınca o teknisyenin
    // zimmetlediği ürünler gösteriliyor — eskiden tüm zimmet kayıtları
    // (ürün bazında) tek düz liste olarak geliyordu.
    var selectedTechnicianId by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val collator = remember { Collator.getInstance(Locale("tr")) }

    val technicianGroups by remember {
        derivedStateOf {
            items.groupBy { it.technicianId ?: "" }.map { (techId, checkouts) ->
                Triple(
                    techId,
                    technicians.firstOrNull { it.id == techId }?.name ?: "—",
                    checkouts.sortedByDescending { it.date ?: "" }
                )
            }.sortedWith(
                compareByDescending<Triple<String, String, List<PartCheckout>>> { (_, _, checkouts) ->
                    checkouts.count { it.status != "reconciled" }
                }.thenBy(collator) { it.second }
            )
        }
    }

    suspend fun reload() {
        try {
            items = Repository.listPartCheckouts()
            technicians = Repository.listTechnicians()
            val stock = StockCache.all()
            stockNames = stock.associate { it.id to (it.name ?: it.code ?: "(isimsiz)") }
            stockById = stock.associateBy { it.id }
            error = null
        } catch (e: Exception) {
            error = "Zimmetler yüklenemedi: ${e.toUserMessage()}"
        } finally {
            isLoading = false
            isRefreshing = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    SimpleScreenScaffoldWithActions(
        title = "Zimmet",
        navController = navController,
        actions = {
            IconButton(onClick = { showPrintDialog = true }) {
                Icon(Icons.Filled.Print, contentDescription = "Yazdır")
            }
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { showCreateDialog = true }) {
                Icon(Icons.Filled.Add, contentDescription = "Zimmetle")
            }
        }
    ) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                else -> PullToRefreshBox(
                    isRefreshing = isRefreshing,
                    onRefresh = {
                        isRefreshing = true
                        scope.launch { reload() }
                    },
                    modifier = Modifier.fillMaxSize()
                ) {
                if (items.isEmpty()) {
                    Text("Zimmet kaydı yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                val selectedGroup = technicianGroups.firstOrNull { it.first == selectedTechnicianId }
                if (selectedGroup == null) {
                    LazyColumn {
                        items(technicianGroups, key = { it.first }) { (techId, techName, checkouts) ->
                            val outstanding = checkouts.count { it.status != "reconciled" }
                            Card(
                                Modifier.fillMaxWidth().padding(vertical = 4.dp)
                                    .clickable { selectedTechnicianId = techId }
                            ) {
                                Row(
                                    Modifier.padding(16.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(techName, style = MaterialTheme.typography.titleMedium)
                                        Text("${checkouts.size} ürün", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (outstanding > 0) {
                                        AssistChip(onClick = { selectedTechnicianId = techId }, label = { Text("$outstanding Mutabakat Bekliyor") })
                                    }
                                    Icon(Icons.Filled.ChevronRight, contentDescription = null)
                                }
                            }
                        }
                    }
                } else {
                    val (_, techName, checkouts) = selectedGroup
                    Row(
                        Modifier.fillMaxWidth().clickable { selectedTechnicianId = null }.padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Filled.ArrowBack, contentDescription = "Tüm teknisyenler")
                        Spacer(Modifier.width(8.dp))
                        Text(techName, style = MaterialTheme.typography.titleLarge)
                    }
                    LazyColumn {
                        items(checkouts, key = { it.id }) { checkout ->
                            val partName = stockNames[checkout.stockItemId] ?: "-"
                            Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                                Row(
                                    Modifier.padding(16.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(Modifier.weight(1f)) {
                                        Text(partName, style = MaterialTheme.typography.titleMedium)
                                        Text("${checkout.qtyTaken ?: 0} adet · ${trDate(checkout.date, "-")}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (checkout.status == "reconciled") {
                                        AssistChip(onClick = {}, label = { Text("Mutabık") })
                                    } else {
                                        AssistChip(onClick = { reconcileTarget = checkout }, label = { Text("Mutabakat Sağla") })
                                    }
                                }
                            }
                        }
                    }
                }
                }
                }
            }
        }
    }

    if (showCreateDialog) {
        ZimmetCreateDialog(
            appState = appState,
            technicians = technicians,
            onDismiss = { showCreateDialog = false },
            onCreated = {
                showCreateDialog = false
                scope.launch { reload() }
            }
        )
    }

    if (showPrintDialog) {
        var printGroups by remember { mutableStateOf<List<CheckoutPrintGroup>?>(null) }
        val printDateIso = printDate.format(DateTimeFormatter.ISO_LOCAL_DATE)

        LaunchedEffect(printDateIso, items, stockById, technicians) {
            val dayCheckouts = items.filter { it.date == printDateIso }
            val appointmentsForDate = try {
                AppointmentsCache.forDate(printDateIso)
            } catch (_: Exception) {
                emptyList()
            }
            val collator = Collator.getInstance(Locale("tr"))
            printGroups = dayCheckouts
                .groupBy { it.groupId ?: it.technicianId ?: it.id }
                .map { (key, rows) ->
                    val groupTechnicians = rows.map { it.technicianId }.distinct()
                        .mapNotNull { id -> technicians.firstOrNull { it.id == id } }
                    CheckoutPrintGroup(
                        groupKey = key,
                        technicians = groupTechnicians,
                        rows = rows.map { checkout ->
                            CheckoutPrintRow(
                                checkout = checkout,
                                stock = stockById[checkout.stockItemId],
                                appointment = checkout.appointmentId?.let { apptId ->
                                    appointmentsForDate.firstOrNull { it.id == apptId }
                                }
                            )
                        }
                    )
                }
                .sortedWith(compareBy(collator) { it.technicians.firstOrNull()?.name ?: "" })
        }

        printGroups?.let { groups ->
            PrintPreviewDialog(
                title = "Parça Zimmeti",
                html = PartCheckoutsPrintHtml.render(printDateIso, groups),
                jobName = "Zimmet-$printDateIso",
                onDismiss = { showPrintDialog = false }
            )
        } ?: AlertDialog(
            onDismissRequest = { showPrintDialog = false },
            title = { Text("Zimmet Çıktısı") },
            text = { CircularProgressIndicator() },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { showPrintDialog = false }) { Text("Vazgeç") } }
        )
    }

    reconcileTarget?.let { checkout ->
        var qtyUsed by remember { mutableStateOf("0") }
        var qtyReturned by remember { mutableStateOf("0") }
        // iOS'taki ZimmetReconcileView'daki "Araçta Depolanan" alanının
        // karşılığı — burada hiç yoktu, kullanılan+iade toplamı alınan
        // miktara eşit olmak ZORUNDA olduğu için arabada kalan parçası olan
        // kayıtlar hiçbir zaman mutabakat sağlanamıyordu.
        var qtyStoredInVehicle by remember { mutableStateOf("0") }
        var isSubmitting by remember { mutableStateOf(false) }
        val taken = checkout.qtyTaken ?: 0
        val used = qtyUsed.toIntOrNull() ?: -1
        val returned = qtyReturned.toIntOrNull() ?: -1
        val stored = qtyStoredInVehicle.toIntOrNull() ?: -1
        val remaining = taken - used.coerceAtLeast(0) - returned.coerceAtLeast(0) - stored.coerceAtLeast(0)
        val valid = used >= 0 && returned >= 0 && stored >= 0 && used + returned + stored == taken

        AlertDialog(
            onDismissRequest = { reconcileTarget = null },
            title = { Text("Mutabakat Sağla") },
            text = {
                Column {
                    Text("Alınan: $taken adet")
                    OutlinedTextField(value = qtyUsed, onValueChange = { qtyUsed = it }, label = { Text("Kullanılan") })
                    OutlinedTextField(value = qtyReturned, onValueChange = { qtyReturned = it }, label = { Text("İade Edilen") })
                    OutlinedTextField(value = qtyStoredInVehicle, onValueChange = { qtyStoredInVehicle = it }, label = { Text("Araçta Depolanan") })
                    Text(
                        "Kalan: $remaining",
                        color = if (remaining == 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                    )
                }
            },
            confirmButton = {
                TextButton(
                    enabled = valid && !isSubmitting,
                    onClick = {
                        isSubmitting = true
                        scope.launch {
                            try {
                                Repository.reconcilePartCheckout(
                                    checkout.id,
                                    Repository.ReconcilePatch(used, returned, stored, actingUserId = appState.currentUser?.id.orEmpty())
                                )
                                reconcileTarget = null
                                reload()
                            } catch (e: Exception) {
                                error = e.message
                            } finally {
                                isSubmitting = false
                            }
                        }
                    }
                ) { Text("Kaydet") }
            },
            dismissButton = { TextButton(onClick = { reconcileTarget = null }) { Text("Vazgeç") } }
        )
    }
}

/**
 * iOS'taki ZimmetCreateView'in (ios/App/App/ZimmetView.swift) Android karşılığı
 * — teknisyen seçimi, metinle parça arama VE barkod ile bulma (Android'de
 * daha önce hiç yoktu, iOS'ta vardı).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ZimmetCreateDialog(
    appState: AppState,
    technicians: List<Technician>,
    onDismiss: () -> Unit,
    onCreated: () -> Unit
) {
    var selectedTechId by remember { mutableStateOf(technicians.firstOrNull()?.id) }
    var techMenuExpanded by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<StockItem>>(emptyList()) }
    var selectedItem by remember { mutableStateOf<StockItem?>(null) }
    var quantity by remember { mutableStateOf(1) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var showScanner by remember { mutableStateOf(false) }
    // Bir ürün birden fazla depoda olabildiği için backend (electron/db.js
    // addPartCheckout) bunu bilmeden HATA verip zimmetlemeyi tamamen
    // engelliyor — ürün seçilince depo dağılımı çözümlenir: tek depoda
    // stok varsa otomatik, birden fazlaysa kullanıcı seçene kadar null kalır.
    var depots by remember { mutableStateOf<List<Depot>>(emptyList()) }
    var depotOptions by remember { mutableStateOf<List<StockItemDepot>?>(null) }
    var selectedDepotId by remember { mutableStateOf<String?>(null) }
    var depotMenuExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        depots = try { Repository.listDepots() } catch (_: Exception) { emptyList() }
    }

    var depotFetchFailed by remember { mutableStateOf(false) }

    // QuickSaleScreen'deki ("Satış") AYNI öncelik kuralı: dükkanda stok
    // varsa SORU SORMADAN dükkan seçilir — zimmetlenen parçalar da genelde
    // dükkandan alınıyor, kullanıcıya her seferinde sormak gereksiz.
    val shopDepotId = depots.firstOrNull { it.name == "Dükkan" }?.id

    suspend fun loadDepotOptions(item: StockItem) {
        depotOptions = null
        depotFetchFailed = false
        val rows = try {
            Repository.listStockItemDepots(item.id)
        } catch (e: Exception) {
            // Sorgu BAŞARISIZ olursa (ör. ağ hatası) bunu "hiçbir depoda
            // stok yok" ile KARIŞTIRMAMAK için — stoğu GERÇEKTEN olan bir
            // ürün bile "Stokta yok" uyarısı alıyordu.
            depotFetchFailed = true
            return
        }
        val withStock = rows.filter { (it.quantity ?: 0) > 0 }
        depotOptions = withStock
        selectedDepotId = when {
            shopDepotId != null && withStock.any { it.depotId == shopDepotId } -> shopDepotId
            withStock.size == 1 -> withStock[0].depotId
            else -> null
        }
    }

    LaunchedEffect(selectedItem) {
        val item = selectedItem
        if (item == null) {
            depotOptions = null
            depotFetchFailed = false
            selectedDepotId = null
        } else {
            loadDepotOptions(item)
        }
    }

    LaunchedEffect(query) {
        if (query.length < 2) {
            searchResults = emptyList()
        } else {
            val lower = query.lowercase()
            searchResults = try {
                StockCache.all().filter {
                    (it.code?.lowercase()?.contains(lower) == true) || (it.name?.lowercase()?.contains(lower) == true)
                }.take(15)
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Yeni Zimmet") },
        text = {
            // DİKKAT: AlertDialog kendi "text" içeriğini OTOMATİK kaydırmıyor —
            // teknisyen seçici + arama sonuçları + seçili parça + depo seçici
            // hepsi birlikte ekran boyundan uzun olabiliyor, özellikle klavye
            // açıkken alttaki "Zimmetle" butonuna ulaşılamıyordu (bkz.
            // StockDetailScreen.kt'teki AYNI düzeltme).
            Column(Modifier.verticalScroll(rememberScrollState())) {
                Box {
                    OutlinedTextField(
                        value = technicians.firstOrNull { it.id == selectedTechId }?.name ?: "",
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Teknisyen") },
                        trailingIcon = {
                            IconButton(onClick = { techMenuExpanded = true }) {
                                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                            }
                        },
                        modifier = Modifier.fillMaxWidth()
                    )
                    DropdownMenu(expanded = techMenuExpanded, onDismissRequest = { techMenuExpanded = false }) {
                        technicians.forEach { tech ->
                            DropdownMenuItem(
                                text = { Text(tech.name) },
                                onClick = { selectedTechId = tech.id; techMenuExpanded = false }
                            )
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedButton(onClick = { showScanner = true }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Filled.QrCodeScanner, contentDescription = null)
                    Spacer(Modifier.width(8.dp))
                    Text("Barkod ile Bul")
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Parça ara (kod veya isim)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                searchResults.forEach { item ->
                    TextButton(
                        onClick = {
                            selectedItem = item
                            quantity = 1
                            query = ""
                            searchResults = emptyList()
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Column(Modifier.fillMaxWidth()) {
                            // Ürün kodu artık ad ile AYNI puntoda ve ÖNÜNDE
                            // — eskiden küçük/ikincil bir altyazı gibi
                            // gösteriliyordu.
                            Text(item.codeAndName())
                            Text(
                                "${item.quantity ?: 0} ${item.unit ?: "adet"}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
                selectedItem?.let { item ->
                    Spacer(Modifier.height(8.dp))
                    Text("Seçilen parça: ${item.codeAndName()}", style = MaterialTheme.typography.titleSmall)
                    Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                        TextButton(onClick = { if (quantity > 1) quantity-- }) { Text("-") }
                        Text("$quantity", style = MaterialTheme.typography.titleMedium)
                        TextButton(onClick = { quantity++ }) { Text("+") }
                    }
                    when {
                        depotFetchFailed -> TextButton(onClick = { scope.launch { loadDepotOptions(item) } }) {
                            Text("Depo bilgisi alınamadı — tekrar dene", style = MaterialTheme.typography.bodySmall)
                        }
                        depotOptions == null -> Text(
                            "Depo bilgisi yükleniyor…",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        depotOptions!!.isEmpty() -> Text(
                            "Stokta yok",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                        depotOptions!!.size == 1 -> Text(
                            depots.firstOrNull { it.id == depotOptions!![0].depotId }?.name ?: "Bilinmeyen depo",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        else -> Box {
                            OutlinedButton(onClick = { depotMenuExpanded = true }) {
                                Text(depots.firstOrNull { it.id == selectedDepotId }?.name ?: "Depo seçin")
                                Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                            }
                            DropdownMenu(expanded = depotMenuExpanded, onDismissRequest = { depotMenuExpanded = false }) {
                                depotOptions!!.forEach { row ->
                                    DropdownMenuItem(
                                        text = { Text("${depots.firstOrNull { it.id == row.depotId }?.name ?: "Bilinmeyen depo"} (${row.quantity ?: 0})") },
                                        onClick = {
                                            depotMenuExpanded = false
                                            selectedDepotId = row.depotId
                                        }
                                    )
                                }
                            }
                        }
                    }
                }
                if (errorMessage != null) {
                    Spacer(Modifier.height(8.dp))
                    Text(errorMessage!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
            }
        },
        confirmButton = {
            TextButton(
                // Backend (electron/db.js addPartCheckout) depotId olmadan
                // HATA verip zimmetlemeyi tamamen engelliyor — depo
                // çözümlenmeden (tek depo otomatik, birden fazlaysa seçim
                // yapılmadan) buton etkinleşmiyor.
                enabled = selectedItem != null && selectedTechId != null && selectedDepotId != null && !isSubmitting,
                onClick = {
                    val item = selectedItem ?: return@TextButton
                    val techId = selectedTechId ?: return@TextButton
                    val depotId = selectedDepotId ?: return@TextButton
                    val userId = appState.currentUser?.id ?: return@TextButton
                    isSubmitting = true
                    errorMessage = null
                    scope.launch {
                        try {
                            Repository.createPartCheckout(
                                Repository.NewPartCheckout(
                                    technicianId = techId,
                                    stockItemId = item.id,
                                    date = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                                    qtyTaken = quantity,
                                    actingUserId = userId,
                                    depotId = depotId
                                )
                            )
                            onCreated()
                        } catch (e: Exception) {
                            errorMessage = e.toUserMessage()
                        } finally {
                            isSubmitting = false
                        }
                    }
                }
            ) { Text("Zimmetle") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("İptal") } }
    )

    if (showScanner) {
        BarcodeScannerDialog(
            title = "Barkod ile Parça Bul",
            onDismiss = { showScanner = false },
            onScan = { code ->
                showScanner = false
                scope.launch {
                    try {
                        val item = Repository.stockByBarcode(code)
                        if (item != null) {
                            selectedItem = item
                            quantity = 1
                            query = ""
                            searchResults = emptyList()
                        } else {
                            errorMessage = "Bu barkoda ait ürün bulunamadı: $code"
                        }
                    } catch (e: Exception) {
                        errorMessage = e.toUserMessage()
                    }
                }
            }
        )
    }
}
