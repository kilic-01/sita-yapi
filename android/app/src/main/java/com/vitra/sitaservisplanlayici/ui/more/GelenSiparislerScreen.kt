package com.vitra.sitaservisplanlayici.ui.more

import com.vitra.sitaservisplanlayici.data.trDate
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.IncomingOrder
import com.vitra.sitaservisplanlayici.data.Repository
import kotlinx.coroutines.launch
import androidx.compose.foundation.clickable
import androidx.compose.foundation.background
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun GelenSiparislerScreen(appState: AppState, navController: NavController) {
    var items by remember { mutableStateOf<List<IncomingOrder>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    // Karta dokununca durum değiştirme penceresi.
    var statusTarget by remember { mutableStateOf<IncomingOrder?>(null) }
    val scope = rememberCoroutineScope()
    val myId = appState.currentUser?.id.orEmpty()

    suspend fun reload() {
        try {
            items = Repository.listIncomingOrders()
            error = null
        } catch (e: Exception) {
            error = "Gelen siparişler yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    SimpleScreenScaffold(
        title = "Gelen Siparişler",
        navController = navController,
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) { Icon(Icons.Filled.Add, contentDescription = "Ekle") }
        }
    ) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                items.isEmpty() -> Text("Gelen sipariş yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn {
                    items(items, key = { it.id }) { order ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp).clickable { statusTarget = order }) {
                            androidx.compose.foundation.layout.Row(Modifier.padding(16.dp), verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(order.customerName ?: "-", style = MaterialTheme.typography.titleMedium)
                                    val meta = listOfNotNull(order.orderNo, order.orderDate?.let { trDate(it) }).joinToString(" · ")
                                    if (meta.isNotBlank()) Text(meta, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    if (!order.notes.isNullOrBlank()) Text(order.notes, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                ORDER_STATUSES.firstOrNull { it.first == order.status }?.let { (_, label, color) ->
                                    Text(
                                        label,
                                        color = androidx.compose.ui.graphics.Color(color),
                                        style = MaterialTheme.typography.labelMedium,
                                        modifier = Modifier
                                            .background(androidx.compose.ui.graphics.Color(color).copy(alpha = 0.15f), androidx.compose.foundation.shape.CircleShape)
                                            .padding(horizontal = 10.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    statusTarget?.let { order ->
        AlertDialog(
            onDismissRequest = { statusTarget = null },
            title = { Text(order.customerName ?: "Sipariş") },
            text = {
                Column {
                    Text("Durumu değiştir", color = MaterialTheme.colorScheme.onSurfaceVariant)
                    ORDER_STATUSES.forEach { (value, label, _) ->
                        TextButton(onClick = {
                            statusTarget = null
                            val me = appState.currentUser?.id ?: return@TextButton
                            scope.launch {
                                runCatching { Repository.updateIncomingOrderStatus(order.id, value, me) }
                                    .onSuccess { items = items.map { if (it.id == order.id) it.copy(status = value) else it } }
                                    .onFailure { error = it.message }
                            }
                        }) { Text(label) }
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { statusTarget = null }) { Text("Vazgeç") } }
        )
    }

    if (showAddDialog) {
        var customerName by remember { mutableStateOf("") }
        var note by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAddDialog = false },
            title = { Text("Gelen Sipariş Ekle") },
            text = {
                Column {
                    OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Müşteri Adı") })
                    OutlinedTextField(value = note, onValueChange = { note = it }, label = { Text("Sipariş notu") })
                    Text(
                        "Kalem detayları (ürünler, fiyatlar) için ofis/masaüstü kullanılmalı — bu, sahadan hızlı bir sipariş kaydı açar.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showAddDialog = false
                    scope.launch {
                        try {
                            Repository.addIncomingOrder(
                                Repository.NewIncomingOrder(
                                    customerName = customerName.trim(),
                                    notes = note.trim().ifBlank { null },
                                    orderDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                                    actingUserId = myId
                                )
                            )
                            reload()
                        } catch (_: Exception) { }
                    }
                }, enabled = customerName.isNotBlank()) { Text("Kaydet") }
            },
            dismissButton = { TextButton(onClick = { showAddDialog = false }) { Text("İptal") } }
        )
    }
}

// Masaüstündeki IncomingOrderForm.jsx STATUS_OPTIONS / IncomingOrdersPage.jsx renkleriyle aynı.
private val ORDER_STATUSES = listOf(
    Triple("yeni", "Yeni", 0xFF3B82F6),
    Triple("hazirlaniyor", "Hazırlanıyor", 0xFFF59E0B),
    Triple("kargoda", "Kargoda", 0xFF8B5CF6),
    Triple("teslim_edildi", "Teslim Edildi", 0xFF10B981),
    Triple("odendi", "Ödendi", 0xFF6B7280),
)
