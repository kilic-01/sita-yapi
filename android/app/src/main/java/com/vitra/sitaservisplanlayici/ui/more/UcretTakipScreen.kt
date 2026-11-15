package com.vitra.sitaservisplanlayici.ui.more

import com.vitra.sitaservisplanlayici.data.trDate
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import com.vitra.sitaservisplanlayici.data.FeeEntry
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.toUserMessage
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

private val FEE_CATEGORIES = listOf(
    "yedekParca" to "Yedek Parça",
    "iscilik" to "İşçilik",
    "garantiDahili" to "Garanti Dahili",
    "urunler" to "Ürünler",
)

private fun feeCategoryLabel(id: String): String = FEE_CATEGORIES.firstOrNull { it.first == id }?.second ?: id

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun UcretTakipScreen(appState: AppState, navController: NavController) {
    var entries by remember { mutableStateOf<List<FeeEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    var editingEntry by remember { mutableStateOf<FeeEntry?>(null) }
    var deletingEntry by remember { mutableStateOf<FeeEntry?>(null) }
    val scope = rememberCoroutineScope()
    val myId = appState.currentUser?.id.orEmpty()

    suspend fun reload() {
        try {
            entries = Repository.listFeeEntries().sortedByDescending { it.date }
            error = null
        } catch (e: Exception) {
            error = "Kayıtlar yüklenemedi: ${e.toUserMessage()}"
        } finally {
            isLoading = false
            isRefreshing = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    SimpleScreenScaffold(
        title = "Ücret Takip",
        navController = navController,
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) { Icon(Icons.Filled.Add, contentDescription = "Ekle") }
        }
    ) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                entries.isEmpty() -> Text("Henüz kayıt yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> PullToRefreshBox(
                    isRefreshing = isRefreshing,
                    onRefresh = {
                        isRefreshing = true
                        scope.launch { reload() }
                    },
                    modifier = Modifier.fillMaxSize()
                ) {
                    LazyColumn {
                        items(entries, key = { it.id }) { entry ->
                            Card(
                                Modifier.fillMaxWidth().padding(vertical = 4.dp)
                            ) {
                                Row(
                                    Modifier.padding(16.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Column(
                                        Modifier.weight(1f).clickable { editingEntry = entry }
                                    ) {
                                        Text(feeCategoryLabel(entry.category), style = MaterialTheme.typography.titleMedium)
                                        val subtitle = listOfNotNull(entry.date?.let { trDate(it) }, entry.description?.takeIf { it.isNotBlank() }).joinToString(" · ")
                                        Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    Text(
                                        "%.2f ₺".format(entry.totalAmount),
                                        style = MaterialTheme.typography.titleMedium
                                    )
                                    IconButton(onClick = { deletingEntry = entry }) {
                                        Icon(Icons.Filled.Delete, contentDescription = "Sil")
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        FeeEntryDialog(
            initial = null,
            onDismiss = { showAddDialog = false },
            onSave = { category, amount, description ->
                showAddDialog = false
                scope.launch {
                    try {
                        Repository.addFeeEntry(
                            Repository.NewFeeEntry(
                                category = category,
                                amount = amount,
                                vatRate = 0.0,
                                description = description,
                                date = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                                actingUserId = myId
                            )
                        )
                        reload()
                    } catch (e: Exception) {
                        error = "Kayıt eklenemedi: ${e.toUserMessage()}"
                    }
                }
            }
        )
    }

    editingEntry?.let { entry ->
        FeeEntryDialog(
            initial = entry,
            onDismiss = { editingEntry = null },
            onSave = { category, amount, description ->
                editingEntry = null
                scope.launch {
                    try {
                        Repository.updateFeeEntry(
                            entry.id,
                            Repository.NewFeeEntry(
                                category = category,
                                amount = amount,
                                vatRate = 0.0,
                                description = description,
                                date = entry.date,
                                actingUserId = myId
                            )
                        )
                        reload()
                    } catch (e: Exception) {
                        error = "Kayıt güncellenemedi: ${e.toUserMessage()}"
                    }
                }
            }
        )
    }

    deletingEntry?.let { entry ->
        AlertDialog(
            onDismissRequest = { deletingEntry = null },
            title = { Text("Kaydı sil") },
            text = { Text("\"${feeCategoryLabel(entry.category)}\" kaydını kalıcı olarak silmek istediğinize emin misiniz?") },
            confirmButton = {
                TextButton(onClick = {
                    deletingEntry = null
                    scope.launch {
                        try {
                            Repository.deleteFeeEntry(entry.id, myId)
                            reload()
                        } catch (e: Exception) {
                            error = "Kayıt silinemedi: ${e.toUserMessage()}"
                        }
                    }
                }) { Text("Sil") }
            },
            dismissButton = { TextButton(onClick = { deletingEntry = null }) { Text("İptal") } }
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun FeeEntryDialog(
    initial: FeeEntry?,
    onDismiss: () -> Unit,
    onSave: (category: String, amount: Double, description: String) -> Unit
) {
    var category by remember { mutableStateOf(initial?.category ?: FEE_CATEGORIES.first().first) }
    var amountText by remember { mutableStateOf(initial?.amount?.let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() } ?: "") }
    var description by remember { mutableStateOf(initial?.description ?: "") }
    var menuExpanded by remember { mutableStateOf(false) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (initial == null) "Yeni Ücret Kaydı" else "Kaydı Düzenle") },
        text = {
            Column {
                ExposedDropdownMenuBox(expanded = menuExpanded, onExpandedChange = { menuExpanded = it }) {
                    OutlinedTextField(
                        value = feeCategoryLabel(category),
                        onValueChange = {},
                        readOnly = true,
                        label = { Text("Kategori") },
                        trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuExpanded) },
                        modifier = Modifier.fillMaxWidth().menuAnchor()
                    )
                    DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                        FEE_CATEGORIES.forEach { (id, label) ->
                            DropdownMenuItem(text = { Text(label) }, onClick = { category = id; menuExpanded = false })
                        }
                    }
                }
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = amountText, onValueChange = { amountText = it }, label = { Text("Tutar") })
                Spacer(Modifier.height(8.dp))
                OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Açıklama (opsiyonel)") })
            }
        },
        confirmButton = {
            val amount = amountText.replace(",", ".").toDoubleOrNull()
            TextButton(
                onClick = { if (amount != null && amount > 0) onSave(category, amount, description.trim()) },
                enabled = amount != null && amount > 0
            ) { Text("Kaydet") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("İptal") } }
    )
}
