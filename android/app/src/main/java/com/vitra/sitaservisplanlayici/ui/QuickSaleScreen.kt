package com.vitra.sitaservisplanlayici.ui

import android.media.AudioManager
import android.media.ToneGenerator
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Depot
import com.vitra.sitaservisplanlayici.data.NewSale
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.toUserMessage
import com.vitra.sitaservisplanlayici.data.SaleItem
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.StockItemDepot
import com.vitra.sitaservisplanlayici.data.codeAndName
import com.vitra.sitaservisplanlayici.data.toLocaleDoubleOrNull
import kotlinx.coroutines.launch

private data class DraftItem(
    var stockItemId: String? = null,
    var code: String = "",
    var description: String = "",
    var qty: String = "1",
    var unitPrice: String = "",
    var discountRate: String = "0",
    var vatRate: String = "20",
    // Bir ürün birden fazla depoda olabildiği için backend (electron/db.js
    // addSale → deductStockItemDepotQuantity) bunu bilmeden stok düşemiyor —
    // eksikse sessizce atlar. Ürün seçilince bu çözümlenir: tek depoda stok
    // varsa otomatik, birden fazlaysa kullanıcı seçene kadar null kalır.
    var depotId: String? = null,
    var depotOptions: List<StockItemDepot>? = null,
    // Sorgu BAŞARISIZ olursa (ör. ağ hatası) bunu "depotOptions = []" (yani
    // "hiçbir depoda stok yok") ile KARIŞTIRMAMAK için — stoğu GERÇEKTEN
    // olan bir ürün bile "Stokta yok" uyarısı alıyordu.
    var depotFetchFailed: Boolean = false
)

@Composable
fun QuickSaleScreen(appState: AppState, navController: NavController) {
    var items by remember { mutableStateOf(listOf(DraftItem())) }
    var deductFromStock by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showBarcodeDialog by remember { mutableStateOf(false) }
    var barcodeInput by remember { mutableStateOf("") }
    var barcodeError by remember { mutableStateOf<String?>(null) }
    var completedMessage by remember { mutableStateOf<String?>(null) }
    // "Kod / Açıklama" alanı eskiden sadece düz bir metin kutusuydu — elle bir
    // kod yazmak HİÇBİR ARAMA/EŞLEŞME tetiklemiyordu (sadece barkod TARAMA ile
    // ürün bulunabiliyordu). Desktop'taki QuickSaleModal.jsx'teki gibi,
    // yazarken canlı bir öneri listesi gösteriyoruz.
    var activeSearchIndex by remember { mutableStateOf<Int?>(null) }
    var query by remember { mutableStateOf("") }
    var searchResults by remember { mutableStateOf<List<StockItem>>(emptyList()) }
    var depots by remember { mutableStateOf<List<Depot>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        depots = try { Repository.listDepots() } catch (_: Exception) { emptyList() }
    }

    // Satışlar normalde dükkanda yapılıyor — depo seçimi varsayılan olarak
    // hep "Dükkan" olmalı, orada stok yoksa kayıtlı olduğu depodan düşülüp
    // kullanıcı satış sonrası uyarılır (bkz. Kaydet butonu).
    val shopDepotId = depots.firstOrNull { it.name == "Dükkan" }?.id

    suspend fun resolveDepot(stockItemId: String, index: Int) {
        val rows = try {
            Repository.listStockItemDepots(stockItemId)
        } catch (e: Exception) {
            items = items.toMutableList().also {
                if (index < it.size) it[index] = it[index].copy(depotOptions = null, depotFetchFailed = true)
            }
            return
        }
        val withStock = rows.filter { (it.quantity ?: 0) > 0 }
        // Dükkanda stok varsa SORU SORMADAN dükkan seçilir. Dükkanda yoksa,
        // stoğu olan TEK bir başka depo varsa oradan düşülür; birden fazla
        // başka depoda varsa aşağıdaki seçiciden kullanıcı kendisi seçer.
        val resolvedDepotId = when {
            shopDepotId != null && withStock.any { it.depotId == shopDepotId } -> shopDepotId
            withStock.size == 1 -> withStock[0].depotId
            else -> null
        }
        items = items.toMutableList().also {
            if (index < it.size) {
                it[index] = it[index].copy(
                    depotOptions = withStock,
                    depotFetchFailed = false,
                    depotId = resolvedDepotId
                )
            }
        }
    }

    LaunchedEffect(query) {
        if (activeSearchIndex == null || query.length < 2) {
            searchResults = emptyList()
        } else {
            kotlinx.coroutines.delay(250)
            val lower = query.lowercase()
            searchResults = try {
                val matches = StockCache.all().filter {
                    (it.code?.lowercase()?.contains(lower) == true) ||
                        (it.name?.lowercase()?.contains(lower) == true) ||
                        (it.barcode?.lowercase()?.contains(lower) == true)
                }
                // Katalogda "A47222" ile "A4722234"/"A4722236WTC" gibi aynı
                // önekli onlarca neredeyse birebir ürün var (isimleri de
                // çoğu zaman AYNI) — eşleşmeler sıralanmadan ilk 15'i
                // gösterince kullanıcı tam aradığı kodu bulamıyor, listede
                // rastgele sırada görünen BENZER bir kodlu farklı ürüne
                // tıklayıp yanlış ürünü seçiyordu. Tam kod eşleşmesi > kod
                // ÖNEKİ eşleşmesi > kodun içinde geçmesi > isim eşleşmesi
                // sırasıyla öne alınır.
                fun rank(item: StockItem): Int {
                    val code = item.code?.lowercase() ?: ""
                    return when {
                        code == lower -> 0
                        code.startsWith(lower) -> 1
                        code.contains(lower) -> 2
                        item.name?.lowercase()?.contains(lower) == true -> 3
                        else -> 4
                    }
                }
                matches.sortedWith(compareBy({ rank(it) }, { it.code ?: "" })).take(15)
            } catch (_: Exception) {
                emptyList()
            }
        }
    }

    fun applySuggestion(stockItem: StockItem, index: Int) {
        items = items.toMutableList().also {
            it[index] = it[index].copy(
                stockItemId = stockItem.id,
                code = stockItem.code ?: "",
                // Katalogda neredeyse birebir aynı isimli ama farklı kodlu
                // çok sayıda ürün var — seçimden sonra satırda sadece isim
                // görünürse kullanıcı yanlış ürün seçtiğini FARK EDEMİYORDU.
                // Kod, isimle AYNI yerde ve ÖNÜNDE görünsün.
                description = stockItem.codeAndName(),
                unitPrice = (stockItem.price ?: 0.0).toString(),
                depotId = null,
                depotOptions = null
            )
        }
        activeSearchIndex = null
        query = ""
        searchResults = emptyList()
        scope.launch { resolveDepot(stockItem.id, index) }
    }

    fun totals(): Triple<Double, Double, Double> {
        var subtotal = 0.0
        var vat = 0.0
        for (item in items) {
            val qty = item.qty.toLocaleDoubleOrNull() ?: 0.0
            val price = item.unitPrice.toLocaleDoubleOrNull() ?: 0.0
            val discount = item.discountRate.toLocaleDoubleOrNull() ?: 0.0
            val vatRate = item.vatRate.toLocaleDoubleOrNull() ?: 0.0
            val gross = qty * price
            val net = gross * (1 - discount / 100.0)
            subtotal += net
            vat += net * (vatRate / 100.0)
        }
        return Triple(subtotal, vat, subtotal + vat)
    }

    val (subtotal, vatTotal, grandTotal) = totals()
    val validItems = items.filter { it.description.isNotBlank() && (it.unitPrice.toLocaleDoubleOrNull() ?: 0.0) > 0 }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Satış", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))

        Column(Modifier.weight(1f).verticalScroll(rememberScrollState())) {
            OutlinedButton(onClick = { showBarcodeDialog = true }, modifier = Modifier.fillMaxWidth()) {
                Icon(Icons.Filled.QrCodeScanner, contentDescription = null)
                Spacer(Modifier.width(6.dp))
                Text("Barkod ile Ürün Ekle")
            }
            Spacer(Modifier.height(12.dp))

            items.forEachIndexed { index, item ->
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = item.description,
                                onValueChange = { v ->
                                    items = items.toMutableList().also { it[index] = item.copy(description = v, stockItemId = null) }
                                    activeSearchIndex = index
                                    query = v
                                },
                                label = { Text("Kod / Açıklama") },
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { items = items.toMutableList().also { it.removeAt(index) } }) {
                                Icon(Icons.Filled.Delete, contentDescription = "Satırı sil")
                            }
                        }
                        if (activeSearchIndex == index && searchResults.isNotEmpty()) {
                            Column {
                                searchResults.forEach { result ->
                                    TextButton(
                                        onClick = { applySuggestion(result, index) },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Column(Modifier.fillMaxWidth()) {
                                            // Ürün kodu artık ad ile AYNI
                                            // puntoda ve ÖNÜNDE — eskiden
                                            // küçük/ikincil bir altyazı gibi
                                            // gösteriliyordu.
                                            Text(result.codeAndName())
                                            // Katalogda birbirine çok benzeyen
                                            // kodlu/isimli onlarca varyant var
                                            // (ör. "A47222" ile "A4722236WTC")
                                            // — stok miktarı görünmeden kolayca
                                            // yanlış ürün seçilip stoksuz bir
                                            // varyant "satılıyordu". Masaüstü
                                            // (QuickSaleModal.jsx) listesindeki
                                            // AYNI "· N adet stokta" bilgisi.
                                            val qty = result.quantity ?: 0
                                            Text(
                                                "${result.price ?: 0.0} · $qty ${result.unit ?: "adet"} stokta",
                                                style = MaterialTheme.typography.bodySmall,
                                                color = if (qty > 0) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.error
                                            )
                                        }
                                    }
                                }
                            }
                        }
                        val lineStockItemId = item.stockItemId
                        if (lineStockItemId != null) {
                            DepotStatusRow(
                                options = item.depotOptions,
                                depots = depots,
                                selectedDepotId = item.depotId,
                                fetchFailed = item.depotFetchFailed,
                                onRetry = { scope.launch { resolveDepot(lineStockItemId, index) } },
                                onSelect = { depotId ->
                                    items = items.toMutableList().also { it[index] = item.copy(depotId = depotId) }
                                }
                            )
                        }
                        Spacer(Modifier.height(6.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            OutlinedTextField(
                                value = item.qty,
                                onValueChange = { v -> items = items.toMutableList().also { it[index] = item.copy(qty = v) } },
                                label = { Text("Adet") },
                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = item.unitPrice,
                                onValueChange = { v -> items = items.toMutableList().also { it[index] = item.copy(unitPrice = v) } },
                                label = { Text("Birim Fiyat") },
                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f)
                            )
                            OutlinedTextField(
                                value = item.vatRate,
                                onValueChange = { v -> items = items.toMutableList().also { it[index] = item.copy(vatRate = v) } },
                                label = { Text("KDV %") },
                                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            TextButton(onClick = { items = items + DraftItem() }) {
                Icon(Icons.Filled.Add, contentDescription = null)
                Spacer(Modifier.width(4.dp))
                Text("Ürün Ekle")
            }

            Spacer(Modifier.height(12.dp))
            Row(
                Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = androidx.compose.ui.Alignment.CenterVertically
            ) {
                Text("Ürünler stoktan düşülsün mü?")
                Switch(checked = deductFromStock, onCheckedChange = { deductFromStock = it })
            }
            Text(
                "Açıksa, barkodla eklenen ürünlerin stok miktarı gerçekten düşülür. Elle yazılan ürünler için bu sadece bilgi amaçlıdır.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(12.dp))

            TotalRow("Ara Toplam", "₺%.2f".format(subtotal))
            TotalRow("KDV", "₺%.2f".format(vatTotal))
            TotalRow("Genel Toplam", "₺%.2f".format(grandTotal), emphasize = true)

            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error!!, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(80.dp))
        }

        Row(Modifier.fillMaxWidth()) {
            OutlinedButton(onClick = { navController.popBackStack() }, modifier = Modifier.weight(1f)) {
                Text("İptal")
            }
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    // Masaüstündeki QuickSaleModal.jsx'teki AYNI kontrol:
                    // stoktan düşülecekse, birden fazla depoda duran ve
                    // henüz hangi depodan düşüleceği seçilmemiş bir satır
                    // varsa gönderim engellenir — yoksa backend o satırı
                    // sessizce atlar, "sattım" dense bile stok hiç değişmez.
                    if (deductFromStock) {
                        val failed = validItems.firstOrNull { it.stockItemId != null && it.depotFetchFailed }
                        if (failed != null) {
                            error = "\"${failed.code.ifBlank { failed.description }}\" için depo bilgisi alınamadı — tekrar deneyin."
                            return@Button
                        }
                        val ambiguous = validItems.firstOrNull {
                            it.stockItemId != null && it.depotId == null && (it.depotOptions?.size ?: 0) > 1
                        }
                        if (ambiguous != null) {
                            error = "\"${ambiguous.code.ifBlank { ambiguous.description }}\" birden fazla depoda var — hangi depodan düşüleceğini seçin."
                            return@Button
                        }
                    }
                    isSaving = true
                    error = null
                    scope.launch {
                        try {
                            val saleItems = validItems.map {
                                SaleItem(
                                    stockItemId = it.stockItemId,
                                    code = it.code.ifBlank { it.description },
                                    name = it.description,
                                    qty = it.qty.toLocaleDoubleOrNull() ?: 0.0,
                                    unitPrice = it.unitPrice.toLocaleDoubleOrNull() ?: 0.0,
                                    discountRate = it.discountRate.toLocaleDoubleOrNull() ?: 0.0,
                                    depotId = it.depotId
                                )
                            }
                            Repository.addSale(
                                NewSale(
                                    items = saleItems,
                                    subtotal = subtotal,
                                    vatTotal = vatTotal,
                                    total = grandTotal,
                                    deductedFromStock = deductFromStock,
                                    actingUserId = appState.currentUser?.id.orEmpty()
                                )
                            )
                            if (deductFromStock) {
                                for (item in validItems) {
                                    // Gerçekten düşülen miktar neyse yerel
                                    // gösterim de onu yansıtsın — depotId
                                    // çözümlenmediyse backend de bir şey
                                    // düşürmedi.
                                    val stockId = item.stockItemId ?: continue
                                    if (item.depotId == null) continue
                                    val current = StockCache.all().firstOrNull { it.id == stockId }?.quantity ?: 0
                                    val qty = item.qty.toLocaleDoubleOrNull() ?: 0.0
                                    StockCache.invalidateQuantity(stockId, maxOf(0, current - qty.toInt()))
                                }
                            }
                            // Satışlar normalde dükkanda yapılıyor — bir
                            // satır dükkan DIŞINDA bir depodan düşüldüyse
                            // (dükkanda stoğu yoktu) kullanıcıyı açıkça
                            // uyarıyoruz.
                            val warnings = validItems
                                .filter { it.depotId != null && it.depotId != shopDepotId }
                                .map { item ->
                                    val depotName = depots.firstOrNull { it.id == item.depotId }?.name ?: "bilinmeyen depo"
                                    "\"${item.code.ifBlank { item.description }}\" ürününün stoğu dükkanda yok, $depotName deposundaki stoktan düşüldü."
                                }
                            var message = "₺%.2f tutarında satış kaydedildi.".format(grandTotal)
                            if (warnings.isNotEmpty()) {
                                message += "\n\n" + warnings.joinToString("\n") + " Kontrol edin."
                            }
                            // Google Pay'deki ödeme onayı gibi kısa, pozitif
                            // bir "ding" sesi — kullanıcı satışın gerçekten
                            // kaydedildiğini anında anlasın diye.
                            try {
                                ToneGenerator(AudioManager.STREAM_NOTIFICATION, ToneGenerator.MAX_VOLUME)
                                    .startTone(ToneGenerator.TONE_PROP_ACK, 150)
                            } catch (_: Exception) {
                            }
                            completedMessage = message
                        } catch (e: Exception) {
                            error = e.message ?: "Satış kaydedilemedi."
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = validItems.isNotEmpty() && !isSaving,
                modifier = Modifier.weight(1f)
            ) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.height(20.dp)) else Text("Kaydet")
            }
        }
    }

    if (showBarcodeDialog) {
        BarcodeScannerDialog(
            title = "Barkod ile Ürün Ekle",
            onDismiss = { showBarcodeDialog = false },
            onScan = { code ->
                scope.launch {
                    val stockItem = try {
                        Repository.stockByBarcode(code.trim())
                    } catch (e: Exception) {
                        barcodeError = e.toUserMessage()
                        showBarcodeDialog = false
                        return@launch
                    }
                    if (stockItem == null) {
                        barcodeError = "Bu barkoda ait ürün bulunamadı: $code"
                        showBarcodeDialog = false
                    } else {
                        val existingIndex = items.indexOfFirst { it.stockItemId == stockItem.id }
                        items = if (existingIndex >= 0) {
                            items.toMutableList().also {
                                val existing = it[existingIndex]
                                val newQty = (existing.qty.toLocaleDoubleOrNull() ?: 0.0) + 1
                                it[existingIndex] = existing.copy(qty = newQty.toString())
                            }
                        } else {
                            val newItem = DraftItem(
                                stockItemId = stockItem.id,
                                code = stockItem.code ?: "",
                                description = stockItem.codeAndName(),
                                qty = "1",
                                unitPrice = (stockItem.price ?: 0.0).toString(),
                                vatRate = (stockItem.vatRate ?: 20.0).toString()
                            )
                            val emptyIndex = items.indexOfFirst { it.description.isBlank() }
                            val targetIndex = if (emptyIndex >= 0) emptyIndex else items.size
                            val updated = if (emptyIndex >= 0) items.toMutableList().also { it[emptyIndex] = newItem }
                            else items + newItem
                            scope.launch { resolveDepot(stockItem.id, targetIndex) }
                            updated
                        }
                        barcodeInput = ""
                        barcodeError = null
                        showBarcodeDialog = false
                    }
                }
            }
        )
    }
    if (barcodeError != null) {
        AlertDialog(
            onDismissRequest = { barcodeError = null },
            title = { Text("Ürün Bulunamadı") },
            text = { Text(barcodeError!!) },
            confirmButton = { TextButton(onClick = { barcodeError = null }) { Text("Tamam") } }
        )
    }
    if (completedMessage != null) {
        AlertDialog(
            onDismissRequest = { navController.popBackStack() },
            title = { Text("Satış Tamamlandı") },
            text = { Text(completedMessage!!) },
            confirmButton = { TextButton(onClick = { navController.popBackStack() }) { Text("Tamam") } }
        )
    }
}

/** Masaüstündeki QuickSaleModal.jsx'teki depo sütunuyla aynı mantık: ürün
 * seçilmemişse gösterme, sorgu sürüyorsa "Yükleniyor…", stok yoksa uyarı,
 * tek depoda varsa salt okunur ad, birden fazlaysa seçici. */
@Composable
private fun DepotStatusRow(
    options: List<StockItemDepot>?,
    depots: List<Depot>,
    selectedDepotId: String?,
    fetchFailed: Boolean = false,
    onRetry: (() -> Unit)? = null,
    onSelect: (String) -> Unit
) {
    when {
        fetchFailed -> TextButton(onClick = { onRetry?.invoke() }) {
            Text("Depo bilgisi alınamadı — tekrar dene", style = MaterialTheme.typography.bodySmall)
        }
        options == null -> Text(
            "Depo bilgisi yükleniyor…",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        options.isEmpty() -> Text(
            "Stokta yok",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error
        )
        options.size == 1 -> Text(
            depots.firstOrNull { it.id == options[0].depotId }?.name ?: "Bilinmeyen depo",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        else -> {
            var expanded by remember { mutableStateOf(false) }
            Box {
                OutlinedButton(onClick = { expanded = true }) {
                    Text(depots.firstOrNull { it.id == selectedDepotId }?.name ?: "Depo seçin")
                    Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                }
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    options.forEach { row ->
                        DropdownMenuItem(
                            text = { Text("${depots.firstOrNull { it.id == row.depotId }?.name ?: "Bilinmeyen depo"} (${row.quantity ?: 0})") },
                            onClick = {
                                expanded = false
                                row.depotId?.let(onSelect)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun TotalRow(label: String, value: String, emphasize: Boolean = false) {
    Row(
        Modifier.fillMaxWidth().padding(vertical = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label)
        Text(
            value,
            style = if (emphasize) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyMedium
        )
    }
}
