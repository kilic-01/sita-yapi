package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
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
import androidx.compose.ui.window.Dialog
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Depot
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.StockItemDepot
import kotlinx.coroutines.launch

/** Yeni ürün eklerken ("StockCreateScreen") ya da mevcut bir ürünü
 * düzenlerken ("StockEditForm") depo dağılımını satır satır düzenlemek için
 * — metin girişi sırasında geçersiz/boş değerler tutulabilsin diye miktar
 * String. */
// "0" DEĞİL boş string: metin alanı dolu bir "0" ile başlarsa kullanıcı
// yazdığı her rakam o sabit "0"nın arkasına/önüne ekleniyor ("5" yazınca
// "05" ya da "50" gibi), hiçbir zaman temiz bir sayı elde edilemiyordu.
// Boşken OutlinedTextField'ın "label"ı ("Miktar") zaten placeholder gibi
// görünüyor, toplam hesaplarında "toIntOrNull() ?: 0" ile doğru yorumlanıyor.
data class DepotRow(var depotId: String? = null, var quantity: String = "")

/** Desktop'taki StockPage.jsx "Depo Dağılımı" satır listesi editörünün
 * Android karşılığı — her satırın depo seçimi ve miktarı elle düzenlenir. */
@Composable
fun DepotRowsEditor(rows: List<DepotRow>, depots: List<Depot>, onChange: (List<DepotRow>) -> Unit) {
    Column {
        rows.forEachIndexed { index, row ->
            Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                var expanded by remember { mutableStateOf(false) }
                Box(Modifier.weight(1f)) {
                    OutlinedButton(onClick = { expanded = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(depots.firstOrNull { it.id == row.depotId }?.name ?: "Depo seçin")
                        Icon(Icons.Filled.ArrowDropDown, contentDescription = null)
                    }
                    DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                        depots.forEach { depot ->
                            DropdownMenuItem(
                                text = { Text(depot.name ?: "(isimsiz)") },
                                onClick = {
                                    expanded = false
                                    onChange(rows.toMutableList().also { it[index] = row.copy(depotId = depot.id) })
                                }
                            )
                        }
                    }
                }
                Spacer(Modifier.width(8.dp))
                OutlinedTextField(
                    value = row.quantity,
                    onValueChange = { v -> onChange(rows.toMutableList().also { it[index] = row.copy(quantity = v) }) },
                    label = { Text("Miktar") },
                    modifier = Modifier.width(100.dp)
                )
                IconButton(onClick = { onChange(rows.toMutableList().also { it.removeAt(index) }) }) {
                    Icon(Icons.Filled.Close, contentDescription = "Kaldır")
                }
            }
        }
        val usedDepotIds = rows.mapNotNull { it.depotId }.toSet()
        if (rows.size < depots.size) {
            OutlinedButton(onClick = {
                val next = depots.firstOrNull { it.id !in usedDepotIds }
                onChange(rows + DepotRow(depotId = next?.id, quantity = ""))
            }) { Text("+ Depo Ekle") }
        }
        val total = rows.sumOf { it.quantity.toIntOrNull() ?: 0 }
        Text("Toplam: $total", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/** Bir depodaki ürünü başka bir depoya kaydırmak için — ör. depodaki bir
 * ürünü dükkana teşhir/satış için getirme. Desktop'taki StockPage.jsx
 * "Depo Transferi" modalının karşılığı — burada da (desktop'taki gibi)
 * ayrı bir ekran DEĞİL, "Düzenle" formunun içinden açılan bir diyalog. */
@Composable
fun StockTransferDialog(
    appState: AppState,
    stockId: String,
    depots: List<Depot>,
    initialRows: List<StockItemDepot>,
    onDismiss: () -> Unit,
    onDone: (List<StockItemDepot>) -> Unit
) {
    var rows by remember { mutableStateOf(initialRows) }
    var fromDepotId by remember {
        mutableStateOf(rows.firstOrNull { (it.quantity ?: 0) > 0 }?.depotId)
    }
    var toDepotId by remember {
        mutableStateOf(depots.firstOrNull { it.id != fromDepotId }?.id)
    }
    var qty by remember { mutableStateOf("") }
    var isSubmitting by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var fromMenuExpanded by remember { mutableStateOf(false) }
    var toMenuExpanded by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val available = rows.firstOrNull { it.depotId == fromDepotId }?.quantity ?: 0

    Dialog(onDismissRequest = onDismiss) {
        androidx.compose.material3.Card(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().padding(20.dp).verticalScroll(rememberScrollState()).imePadding()) {
            Text("Depo Transferi", style = MaterialTheme.typography.titleLarge)
            Spacer(Modifier.height(16.dp))
            Text("Kaynak Depo", style = MaterialTheme.typography.labelLarge)
            Box(Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { fromMenuExpanded = true }, modifier = Modifier.fillMaxWidth()) {
                    val row = rows.firstOrNull { it.depotId == fromDepotId }
                    Text(
                        depots.firstOrNull { it.id == fromDepotId }?.name?.let { "$it (${row?.quantity ?: 0} adet)" }
                            ?: "Seçin…"
                    )
                }
                DropdownMenu(expanded = fromMenuExpanded, onDismissRequest = { fromMenuExpanded = false }) {
                    rows.filter { (it.quantity ?: 0) > 0 }.forEach { row ->
                        DropdownMenuItem(
                            text = { Text("${depots.firstOrNull { it.id == row.depotId }?.name ?: "Bilinmeyen depo"} (${row.quantity ?: 0} adet)") },
                            onClick = { fromDepotId = row.depotId; fromMenuExpanded = false }
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            Text("Hedef Depo", style = MaterialTheme.typography.labelLarge)
            Box(Modifier.fillMaxWidth()) {
                OutlinedButton(onClick = { toMenuExpanded = true }, modifier = Modifier.fillMaxWidth()) {
                    Text(depots.firstOrNull { it.id == toDepotId }?.name ?: "Seçin…")
                }
                DropdownMenu(expanded = toMenuExpanded, onDismissRequest = { toMenuExpanded = false }) {
                    depots.filter { it.id != fromDepotId }.forEach { depot ->
                        DropdownMenuItem(
                            text = { Text(depot.name ?: "(isimsiz)") },
                            onClick = { toDepotId = depot.id; toMenuExpanded = false }
                        )
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            OutlinedTextField(
                value = qty,
                onValueChange = { qty = it },
                label = { Text("Miktar") },
                modifier = Modifier.fillMaxWidth()
            )
            if (fromDepotId != null) {
                Text("Kaynakta $available adet var.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            if (rows.none { (it.quantity ?: 0) > 0 }) {
                Text(
                    "Bu ürün hiçbir depoda stokta değil — transfer edilecek bir şey yok.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error!!, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            Row {
                OutlinedButton(onClick = onDismiss, modifier = Modifier.weight(1f)) { Text("Vazgeç") }
                Spacer(Modifier.width(8.dp))
                Button(
                    onClick = {
                        val from = fromDepotId ?: return@Button
                        val to = toDepotId ?: return@Button
                        val qtyInt = qty.toIntOrNull() ?: return@Button
                        if (qtyInt <= 0 || qtyInt > available || from == to) return@Button
                        isSubmitting = true
                        error = null
                        scope.launch {
                            try {
                                Repository.transferStockItemDepot(
                                    stockId,
                                    Repository.StockTransferBody(from, to, qtyInt, appState.currentUser?.id.orEmpty())
                                )
                                val updatedRows = rows.toMutableList()
                                val fromIdx = updatedRows.indexOfFirst { it.depotId == from }
                                if (fromIdx >= 0) {
                                    updatedRows[fromIdx] = updatedRows[fromIdx].copy(quantity = (updatedRows[fromIdx].quantity ?: 0) - qtyInt)
                                }
                                val toIdx = updatedRows.indexOfFirst { it.depotId == to }
                                if (toIdx >= 0) {
                                    updatedRows[toIdx] = updatedRows[toIdx].copy(quantity = (updatedRows[toIdx].quantity ?: 0) + qtyInt)
                                } else {
                                    updatedRows.add(StockItemDepot(id = to, stockItemId = stockId, depotId = to, quantity = qtyInt))
                                }
                                onDone(updatedRows)
                            } catch (e: Exception) {
                                error = e.message ?: "Depo transferi kaydedilemedi."
                                isSubmitting = false
                            }
                        }
                    },
                    enabled = fromDepotId != null && toDepotId != null && fromDepotId != toDepotId &&
                        (qty.toIntOrNull() ?: 0) > 0 && (qty.toIntOrNull() ?: 0) <= available && !isSubmitting,
                    modifier = Modifier.weight(1f)
                ) {
                    if (isSubmitting) CircularProgressIndicator(Modifier.height(20.dp)) else Text("Kaydet")
                }
            }
        }
        }
    }
}
