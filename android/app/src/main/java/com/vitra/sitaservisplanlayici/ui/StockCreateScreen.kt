package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import androidx.compose.runtime.LaunchedEffect
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Depot
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockDepotAllocation
import com.vitra.sitaservisplanlayici.data.toLocaleDoubleOrNull
import kotlinx.coroutines.launch

@Composable
fun StockCreateScreen(appState: AppState, navController: NavController) {
    var name by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var barcode by remember { mutableStateOf("") }
    var price by remember { mutableStateOf("0") }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showBarcodeScanner by remember { mutableStateOf(false) }
    var depots by remember { mutableStateOf<List<Depot>>(emptyList()) }
    // Yeni ürün de ilk eklenişte birden fazla depoya dağıtılabilsin diye
    // (ör. hem dükkan hem şantiye) — tekil bir "Miktar" alanı yerine.
    var depotRows by remember { mutableStateOf<List<DepotRow>>(emptyList()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        depots = try { Repository.listDepots() } catch (_: Exception) { emptyList() }
    }

    val validAllocations = depotRows.mapNotNull { row ->
        val depotId = row.depotId ?: return@mapNotNull null
        val qty = row.quantity.toIntOrNull() ?: return@mapNotNull null
        if (qty <= 0) null else StockDepotAllocation(depotId, qty)
    }

    // DİKKAT: scroll olmadan "Miktar" alanına dokunup klavye açılınca içerik
    // sığmayan satırlar birbirine giriyor/görünmez oluyordu (bkz.
    // StockDetailScreen.kt'teki AYNI düzeltme). imePadding() BİLEREK yok —
    // RootApp.kt'teki NavHost zaten genel bir imePadding uyguluyor, burada
    // bir daha eklemek klavyenin üstünde anlamsız bir boşluk bırakıyordu.
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState())) {
        Text("Yeni Ürün", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Ürün Adı") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Ürün Kodu") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = barcode,
            onValueChange = { barcode = it },
            label = { Text("Barkod (opsiyonel)") },
            trailingIcon = {
                IconButton(onClick = { showBarcodeScanner = true }) {
                    Icon(Icons.Filled.QrCodeScanner, contentDescription = "Kamera ile barkod oku")
                }
            },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = price, onValueChange = { price = it }, label = { Text("Fiyat") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(16.dp))
        Text("Depo Dağılımı", style = MaterialTheme.typography.titleSmall)
        Text(
            "Bu ürünü ilk eklerken birden fazla depoya dağıtabilirsiniz.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        DepotRowsEditor(rows = depotRows, depots = depots, onChange = { depotRows = it })
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        Row {
            OutlinedButton(onClick = { navController.popBackStack() }, modifier = Modifier.weight(1f)) { Text("İptal") }
            Spacer(Modifier.height(0.dp))
            Button(
                onClick = {
                    error = null
                    isSaving = true
                    scope.launch {
                        try {
                            val created = Repository.createStockItem(
                                Repository.NewStockItemBody(
                                    code = code.trim().ifBlank { null },
                                    name = name.trim(),
                                    barcode = barcode.trim().ifBlank { null },
                                    price = price.toLocaleDoubleOrNull() ?: 0.0,
                                    depots = validAllocations,
                                    actingUserId = appState.currentUser?.id.orEmpty()
                                )
                            )
                            StockCache.upsert(created)
                            navController.popBackStack()
                        } catch (e: Exception) {
                            error = e.message ?: "Ürün kaydedilemedi."
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = name.isNotBlank() && validAllocations.isNotEmpty() && !isSaving,
                modifier = Modifier.weight(1f)
            ) { Text("Kaydet") }
        }
    }

    if (showBarcodeScanner) {
        BarcodeScannerDialog(
            title = "Barkod Tara",
            onDismiss = { showBarcodeScanner = false },
            onScan = { scanned ->
                barcode = scanned
                showBarcodeScanner = false
            }
        )
    }
}
