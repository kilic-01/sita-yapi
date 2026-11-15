package com.vitra.sitaservisplanlayici.ui.more

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
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
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
import com.vitra.sitaservisplanlayici.data.PendingPart
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.toUserMessage
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BekleyenParcalarScreen(appState: AppState, navController: NavController) {
    var items by remember { mutableStateOf<List<PendingPart>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isRefreshing by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    var query by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val myId = appState.currentUser?.id.orEmpty()

    suspend fun reload() {
        try {
            items = Repository.listPendingParts()
            error = null
        } catch (e: Exception) {
            error = "Bekleyen parçalar yüklenemedi: ${e.toUserMessage()}"
        } finally {
            isLoading = false
            isRefreshing = false
        }
    }

    LaunchedEffect(Unit) { reload() }

    val filtered = remember(items, query) {
        if (query.isBlank()) items
        else items.filter {
            (it.customerName?.contains(query, ignoreCase = true) == true) ||
                (it.description?.contains(query, ignoreCase = true) == true)
        }
    }

    SimpleScreenScaffold(
        title = "Bekleyen Parçalar",
        navController = navController,
        floatingActionButton = {
            FloatingActionButton(onClick = { showAddDialog = true }) { Icon(Icons.Filled.Add, contentDescription = "Ekle") }
        }
    ) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text("Müşteri veya parça ara") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth()
            )
            Spacer(Modifier.height(12.dp))
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
                if (filtered.isEmpty()) {
                    Text(
                        if (query.isBlank()) "Bekleyen parça yok." else "Sonuç bulunamadı.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                } else {
                LazyColumn {
                    items(filtered, key = { it.id }) { part ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Row(
                                Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(Modifier.weight(1f)) {
                                    Text(part.customerName ?: "-", style = MaterialTheme.typography.titleMedium)
                                    Text(part.description ?: "-", color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                val arrived = part.status == "geldi"
                                AssistChip(
                                    onClick = {
                                        scope.launch {
                                            try {
                                                Repository.updatePendingPartStatus(part.id, if (arrived) "bekleniyor" else "geldi", myId)
                                                reload()
                                            } catch (_: Exception) { }
                                        }
                                    },
                                    label = { Text(if (arrived) "Geldi" else "Bekliyor") }
                                )
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
        var customerName by remember { mutableStateOf("") }
        var description by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showAddDialog = false },
            title = { Text("Bekleyen Parça Ekle") },
            text = {
                Column {
                    OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Müşteri Adı") })
                    OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Parça / Ürün Kodu") })
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    showAddDialog = false
                    scope.launch {
                        try {
                            Repository.addPendingPart(
                                Repository.NewPendingPart(
                                    customerName = customerName.trim(),
                                    description = description.trim(),
                                    orderedAt = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                                    actingUserId = myId
                                )
                            )
                            reload()
                        } catch (_: Exception) { }
                    }
                }, enabled = customerName.isNotBlank() && description.isNotBlank()) { Text("Kaydet") }
            },
            dismissButton = { TextButton(onClick = { showAddDialog = false }) { Text("İptal") } }
        )
    }
}
