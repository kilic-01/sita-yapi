package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.ActivityEntry
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Depot
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.StockItemDepot
import com.vitra.sitaservisplanlayici.data.toLocaleDoubleOrNull
import kotlinx.coroutines.launch
import com.vitra.sitaservisplanlayici.data.hapticConfirm
import com.vitra.sitaservisplanlayici.data.toUserMessage

@Composable
fun StockDetailScreen(appState: AppState, stockId: String, navController: NavController) {
    var item by remember { mutableStateOf<StockItem?>(null) }
    var isEditing by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    var showFinalDeleteConfirm by remember { mutableStateOf(false) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    // Bir ürün birden fazla depoda farklı miktarlarda durabiliyor — eskiden
    // burada hiç gösterilmiyordu, sadece (artık güncellenmeyen) tekil
    // "depotId" alanı vardı.
    var depotRows by remember { mutableStateOf<List<StockItemDepot>>(emptyList()) }
    var depots by remember { mutableStateOf<List<Depot>>(emptyList()) }
    // Ürün sayfasında "Son İşlem" artık AÇIK gösterilmiyor — kullanıcı bunu
    // gürültülü buldu, yerine bir "info" butonu + detaylı geçmiş diyaloğu var.
    var showHistory by remember { mutableStateOf(false) }
    var isBroadcasting by remember { mutableStateOf(false) }
    val tvView = androidx.compose.ui.platform.LocalView.current
    var tvMessage by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val isAdmin = appState.currentUser?.role == "admin"

    suspend fun reloadDepotRows() {
        depotRows = try { Repository.listStockItemDepots(stockId) } catch (_: Exception) { emptyList() }
    }

    LaunchedEffect(stockId) {
        try {
            item = StockCache.all().firstOrNull { it.id == stockId }
            item?.let { appState.addRecentStock(it) }
            depots = Repository.listDepots()
            reloadDepotRows()
        } catch (e: Exception) {
            error = "Ürün yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    // Depo Transferi ekranından dönünce miktarları tazelemek için — geri
    // dönüşte bu composable yeniden oluşturulmuyor, savedStateHandle ile
    // "bir şey değişti" sinyali bekleniyor.
    val backStackEntry = navController.currentBackStackEntry
    LaunchedEffect(backStackEntry) {
        val refresh = backStackEntry?.savedStateHandle?.get<Boolean>("stockRefresh")
        if (refresh == true) {
            backStackEntry.savedStateHandle.remove<Boolean>("stockRefresh")
            item = try { StockCache.all().firstOrNull { it.id == stockId } } catch (_: Exception) { item }
            reloadDepotRows()
        }
    }

    // DİKKAT: scroll olmadan (önceki hal) "Miktar" alanına dokunup klavye
    // açılınca pencere adjustResize ile küçülüyor ama içerik kaydırılamadığı
    // için sığmayan satırlar birbirine giriyor/görünmez oluyordu — bazen bu
    // karmaşada yanlışlıkla bir satırın "kaldır" (X) butonuna dokunulup o
    // satır gerçekten silinmiş gibi kayboluyordu. imePadding() BİLEREK yok —
    // RootApp.kt'teki NavHost zaten genel bir imePadding uyguluyor, burada
    // bir daha eklemek klavyenin üstünde anlamsız bir boşluk bırakıyordu.
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        when {
            isLoading -> CircularProgressIndicator()
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
            item == null -> Text("Ürün bulunamadı.")
            isEditing -> StockEditForm(
                appState = appState,
                item = item!!,
                depots = depots,
                initialDepotRows = depotRows,
                onCancel = { isEditing = false },
                onSaved = { updated, updatedRows ->
                    item = updated
                    depotRows = updatedRows
                    isEditing = false
                }
            )
            else -> {
                val stock = item!!
                if (!stock.imageUrl.isNullOrBlank()) {
                    androidx.compose.foundation.layout.Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
                        ProductThumbnail(stock.imageUrl, 200.dp)
                    }
                    Spacer(Modifier.height(12.dp))
                }
                Row(
                    Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        stock.name ?: stock.code ?: "(isimsiz)",
                        style = MaterialTheme.typography.headlineSmall,
                        modifier = Modifier.weight(1f)
                    )
                    // "TV'de Göster": yalnız ikon (masaüstündeki AirPlay düğmesi gibi).
                    IconButton(
                        onClick = {
                            val me = appState.currentUser ?: return@IconButton
                            isBroadcasting = true
                            tvMessage = null
                            scope.launch {
                                tvMessage = try {
                                    val result = Repository.broadcastToTv(stock, me.id, "${android.os.Build.MODEL} · ${me.name}")
                                    result.sentAt?.let {
                                        tvView.hapticConfirm()
                                        appState.tvOnAir = com.vitra.sitaservisplanlayici.data.TvOnAir(it, stock.code ?: stock.name ?: "Ürün", if (stock.code != null) stock.name else null)
                                    }
                                    // Bazı TV'ler gösteremediyse (internet yok vb.) uyarı burada kalır.
                                    result.warning
                                } catch (e: Exception) {
                                    e.toUserMessage()
                                }
                                isBroadcasting = false
                            }
                        },
                        enabled = !isBroadcasting
                    ) {
                        if (isBroadcasting) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                        else Icon(androidx.compose.material.icons.Icons.Filled.Cast, contentDescription = "TV'de Göster")
                    }
                    IconButton(onClick = { showHistory = true }) {
                        Icon(Icons.Filled.Info, contentDescription = "Stok Geçmişi")
                    }
                }
                Spacer(Modifier.height(16.dp))
                InfoRow("Kod", stock.code ?: "-")
                InfoRow("Barkod", stock.barcode ?: "-")
                InfoRow("Miktar", "${stock.quantity ?: 0} adet")
                InfoRow("Fiyat", "${stock.price ?: 0.0} (KDV %${stock.vatRate ?: 20})")
                InfoRow("Kategori", stock.category ?: "-")
                Spacer(Modifier.height(8.dp))
                // TV'ye gönderilemezse küçük uyarı (başarıda alttaki yayın şeridi çıkar).
                tvMessage?.let { Text("⚠ $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error) }
                Spacer(Modifier.height(16.dp))
                Text("Depo Dağılımı", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
                val stockedRows = depotRows.filter { (it.quantity ?: 0) > 0 }
                if (stockedRows.isEmpty()) {
                    Text("Hiçbir depoda stokta değil.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    stockedRows.forEach { row ->
                        InfoRow(depots.firstOrNull { it.id == row.depotId }?.name ?: "Bilinmeyen depo", "${row.quantity ?: 0} ${stock.unit ?: "adet"}")
                    }
                }
                Text(
                    "Stok girişi ve depo transferi \"Düzenle\" ekranından yapılır.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(Modifier.height(16.dp))
                Button(onClick = { isEditing = true }, modifier = Modifier.fillMaxWidth()) { Text("Düzenle") }
                Spacer(Modifier.height(8.dp))
                if (isAdmin) {
                    OutlinedButton(
                        onClick = { showDeleteConfirm = true },
                        colors = androidx.compose.material3.ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Ürünü Sil") }
                }
            }
        }
    }

    // iOS'taki gibi yanlışlıkla silmeyi önlemek için iki aşamalı onay.
    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Emin misiniz?") },
            text = { Text("Bu ürünü silmek istediğinize emin misiniz?") },
            confirmButton = {
                TextButton(onClick = { showDeleteConfirm = false; showFinalDeleteConfirm = true }) { Text("Evet, sil") }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Vazgeç") } }
        )
    }
    if (showFinalDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showFinalDeleteConfirm = false },
            title = { Text("Son kez soruyoruz") },
            text = { Text("Bu işlem geri alınamaz. Gerçekten silmek istiyor musunuz?") },
            confirmButton = {
                TextButton(onClick = {
                    showFinalDeleteConfirm = false
                    scope.launch {
                        try {
                            Repository.deleteStockItem(stockId, appState.currentUser?.id.orEmpty())
                            StockCache.remove(stockId)
                            navController.popBackStack()
                        } catch (e: Exception) {
                            error = e.message
                        }
                    }
                }) { Text("Evet, kalıcı olarak sil") }
            },
            dismissButton = { TextButton(onClick = { showFinalDeleteConfirm = false }) { Text("Vazgeç") } }
        )
    }

    if (showHistory) {
        StockHistoryDialog(stockId = stockId, onDismiss = { showHistory = false })
    }
}

/** Ürün sayfasındaki "info" butonu açıyor — kim stok adedini değiştirdi,
 * kaçtan kaça (eklendi/çıkarıldı), ya da depolar arasında ne kadar ürün
 * taşındı, hepsi burada tek tek listeleniyor. Desktop'taki StockPage.jsx
 * "Stok Geçmişi" modalının karşılığı. */
@Composable
private fun StockHistoryDialog(stockId: String, onDismiss: () -> Unit) {
    var entries by remember { mutableStateOf<List<ActivityEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(stockId) {
        try {
            entries = Repository.getStockItemActivity(stockId)
        } catch (e: Exception) {
            error = e.message ?: "Geçmiş yüklenemedi."
        } finally {
            isLoading = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Stok Geçmişi") },
        text = {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                entries.isEmpty() -> Text("Bu ürün için kayıtlı bir işlem yok.")
                else -> Column {
                    entries.forEach { entry ->
                        Column(Modifier.padding(vertical = 6.dp)) {
                            Text(entry.description ?: "", style = MaterialTheme.typography.bodyMedium)
                            // Sunucu ISO 8601 zaman damgası döndürüyor — uygulamanın
                            // başka hiçbir yerinde bunu yeniden biçimlendirmiyoruz,
                            // aynı basit yaklaşım: ilk 16 karakteri okunur hale getir.
                            entry.createdAt?.takeIf { it.length >= 16 }?.let {
                                Text(
                                    it.take(16).replace("T", " "),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text("Kapat") } }
    )
}

@Composable
private fun InfoRow(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value)
    }
}

@Composable
private fun StockEditForm(
    appState: AppState,
    item: StockItem,
    depots: List<Depot>,
    initialDepotRows: List<StockItemDepot>,
    onCancel: () -> Unit,
    onSaved: (StockItem, List<StockItemDepot>) -> Unit
) {
    var name by remember { mutableStateOf(item.name ?: "") }
    var code by remember { mutableStateOf(item.code ?: "") }
    var unit by remember { mutableStateOf(item.unit ?: "adet") }
    var category by remember { mutableStateOf(item.category ?: "") }
    var lowStockThreshold by remember { mutableStateOf(item.lowStockThreshold?.toString() ?: "") }
    var barcode by remember { mutableStateOf(item.barcode ?: "") }
    var price by remember { mutableStateOf((item.price ?: 0.0).toString()) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showBarcodeScanner by remember { mutableStateOf(false) }
    var showTransferDialog by remember { mutableStateOf(false) }
    val actingUserId = appState.currentUser?.id.orEmpty()
    val scope = rememberCoroutineScope()

    // Bir ürün birden fazla depoda farklı miktarlarda durabiliyor — "Miktar"
    // artık tek bir alan değil, bu satır listesi üzerinden düzenleniyor.
    // "originalRows" kaydederken hangi satırların değişmiş/silinmiş olduğunu
    // anlamak için — desktop'taki StockPage.jsx'teki aynı mantık.
    var depotRows by remember {
        // Miktar 0 ise boş string — dolu bir "0" ile başlarsa kullanıcı
        // yazdığı rakam o sabit karakterin yanına ekleniyor, hiçbir zaman
        // temiz bir sayı elde edilemiyordu (bkz. DepotRow'daki not).
        mutableStateOf(initialDepotRows.map { DepotRow(it.depotId, (it.quantity ?: 0).let { q -> if (q > 0) q.toString() else "" }) })
    }
    var originalRows by remember { mutableStateOf(depotRows) }

    Column {
        Text("Ürünü Düzenle", style = MaterialTheme.typography.titleLarge)
        Spacer(Modifier.height(12.dp))
        // iOS'taki "Ürünü Düzenle" formuyla aynı alanlar: Kod, Ad, Birim, Kategori.
        OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Ürün Kodu") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Ürün Adı") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        Row {
            OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Birim") }, singleLine = true, modifier = Modifier.weight(1f))
            Spacer(Modifier.width(8.dp))
            OutlinedTextField(value = category, onValueChange = { category = it }, label = { Text("Kategori") }, singleLine = true, modifier = Modifier.weight(1f))
        }
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = barcode,
            onValueChange = { barcode = it },
            label = { Text("Barkod") },
            trailingIcon = {
                IconButton(onClick = { showBarcodeScanner = true }) {
                    Icon(Icons.Filled.QrCodeScanner, contentDescription = "Kamera ile barkod oku")
                }
            },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = price, onValueChange = { price = it }, label = { Text("Fiyat (KDV hariç)") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = lowStockThreshold,
            onValueChange = { v -> lowStockThreshold = v.filter { it.isDigit() } },
            label = { Text("Az Stok Eşiği") },
            singleLine = true,
            keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = androidx.compose.ui.text.input.KeyboardType.Number),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(16.dp))
        Text("Depo Dağılımı", style = MaterialTheme.typography.titleSmall)
        Text(
            "Birden fazla depoya dağıtabilirsiniz — her depo için miktarı elle girin, " +
                "ya da bir depodan diğerine kaydırabilirsiniz.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(4.dp))
        DepotRowsEditor(rows = depotRows, depots = depots, onChange = { depotRows = it })
        if (depots.size >= 2) {
            Spacer(Modifier.height(8.dp))
            OutlinedButton(onClick = { showTransferDialog = true }, modifier = Modifier.fillMaxWidth()) {
                Text("Depo Transferi")
            }
        }
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        Row {
            OutlinedButton(onClick = onCancel, modifier = Modifier.weight(1f)) { Text("İptal") }
            Spacer(Modifier.height(0.dp))
            Button(
                onClick = {
                    isSaving = true
                    error = null
                    scope.launch {
                        try {
                            var updated = Repository.updateStockItem(
                                item.id,
                                Repository.StockPatch(
                                    name = name.trim(),
                                    code = code.trim().ifBlank { null },
                                    unit = unit.trim().ifBlank { null },
                                    category = category.trim(),
                                    lowStockThreshold = lowStockThreshold.toIntOrNull(),
                                    barcode = barcode.trim().ifBlank { null },
                                    price = price.toLocaleDoubleOrNull()
                                )
                            )
                            val removed = originalRows.filter { o -> o.depotId != null && depotRows.none { it.depotId == o.depotId } }
                            for (row in removed) {
                                Repository.removeStockItemDepot(item.id, row.depotId!!, actingUserId)
                            }
                            for (row in depotRows) {
                                val depotId = row.depotId ?: continue
                                val qty = row.quantity.toIntOrNull() ?: 0
                                val original = originalRows.firstOrNull { it.depotId == depotId }
                                if (original == null || (original.quantity.toIntOrNull() ?: 0) != qty) {
                                    Repository.setStockItemDepotQuantity(item.id, depotId, qty, actingUserId)
                                }
                            }
                            val finalRows = depotRows.mapNotNull { row ->
                                val depotId = row.depotId ?: return@mapNotNull null
                                StockItemDepot(id = depotId, stockItemId = item.id, depotId = depotId, quantity = row.quantity.toIntOrNull() ?: 0)
                            }
                            val newTotal = finalRows.sumOf { it.quantity ?: 0 }
                            updated = updated.copy(quantity = newTotal)
                            StockCache.upsert(updated)
                            onSaved(updated, finalRows)
                        } catch (e: Exception) {
                            error = e.message ?: "Kaydedilemedi."
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = !isSaving,
                modifier = Modifier.weight(1f)
            ) { Text("Kaydet") }
        }
    }

    if (showBarcodeScanner) {
        BarcodeScannerDialog(
            title = "Barkod Ekle",
            onDismiss = { showBarcodeScanner = false },
            onScan = { code ->
                barcode = code
                showBarcodeScanner = false
            }
        )
    }

    if (showTransferDialog) {
        val currentRows = depotRows.mapNotNull { row ->
            val depotId = row.depotId ?: return@mapNotNull null
            StockItemDepot(id = depotId, stockItemId = item.id, depotId = depotId, quantity = row.quantity.toIntOrNull() ?: 0)
        }
        StockTransferDialog(
            appState = appState,
            stockId = item.id,
            depots = depots,
            initialRows = currentRows,
            onDismiss = { showTransferDialog = false },
            onDone = { updatedRows ->
                depotRows = updatedRows.map { DepotRow(it.depotId, (it.quantity ?: 0).let { q -> if (q > 0) q.toString() else "" }) }
                originalRows = depotRows
                showTransferDialog = false
            }
        )
    }
}
