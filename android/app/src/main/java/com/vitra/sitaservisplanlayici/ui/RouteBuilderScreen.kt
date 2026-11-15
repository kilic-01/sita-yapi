package com.vitra.sitaservisplanlayici.ui

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
import androidx.compose.material.icons.filled.Print
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.BuildRoutesResponse
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffoldWithActions
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

/** iOS'taki RouteBuilderView'in karşılığı — POST /api/routes ile otomatik rota dağıtımı. */
@Composable
fun RouteBuilderScreen(appState: AppState, navController: NavController) {
    // iOS'taki RouteBuilderView'daki ("yarın") ile aynı varsayılan — rotalar
    // genelde bir gün önceden planlanıyor, iki platform tutarlı olmalı.
    var date by remember { mutableStateOf(LocalDate.now().plusDays(1)) }
    var result by remember { mutableStateOf<BuildRoutesResponse?>(null) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var showPrintDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun build() {
        isLoading = true
        error = null
        scope.launch {
            try {
                val dateIso = date.format(DateTimeFormatter.ISO_LOCAL_DATE)
                result = Repository.buildRoutes(dateIso, appState.currentUser?.id)
                AppointmentsCache.invalidate(dateIso)
            } catch (e: Exception) {
                error = e.message ?: "Rota oluşturulamadı."
            } finally {
                isLoading = false
            }
        }
    }

    SimpleScreenScaffoldWithActions(
        title = "Rota Oluştur",
        navController = navController,
        actions = {
            if (result != null && result!!.routes.isNotEmpty()) {
                IconButton(onClick = { showPrintDialog = true }) {
                    Icon(Icons.Filled.Print, contentDescription = "Yazdır")
                }
            }
        }
    ) { padding ->
    Column(padding.fillMaxSize().padding(16.dp)) {
        Spacer(Modifier.height(12.dp))
        DateField(date = date, onChange = { date = it })
        Spacer(Modifier.height(12.dp))
        Button(onClick = { build() }, enabled = !isLoading, modifier = Modifier.fillMaxWidth()) {
            if (isLoading) CircularProgressIndicator(Modifier.height(20.dp)) else Text("Bu Tarih İçin Rota Oluştur")
        }
        Spacer(Modifier.height(16.dp))

        if (error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }

        result?.let { res ->
            if (res.skippedCount > 0) {
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(12.dp)) {
                        Text("${res.skippedCount} randevu konum bulunamadığı için atlandı:", color = MaterialTheme.colorScheme.error)
                        res.skippedCustomers.forEach { Text("• $it", style = MaterialTheme.typography.bodySmall) }
                    }
                }
                Spacer(Modifier.height(12.dp))
            }
            LazyColumn {
                items(res.routes) { group ->
                    Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                        Column(Modifier.padding(16.dp)) {
                            Text(group.technician.name, style = MaterialTheme.typography.titleMedium)
                            Text("${group.stops.size} durak", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(8.dp))
                            group.stops.sortedBy { it.stopOrder ?: 0 }.forEach { stop ->
                                Text("${(stop.stopOrder ?: 0) + 1}. ${stop.customerName ?: "(isimsiz)"}")
                            }
                        }
                    }
                }
            }
        }
    }
    }

    if (showPrintDialog) {
        result?.let { res ->
            val dateIso = date.format(DateTimeFormatter.ISO_LOCAL_DATE)
            PrintPreviewDialog(
                title = "Günlük Rota",
                html = RoutePrintHtml.render(dateIso, res.routes),
                jobName = "Rota-$dateIso",
                landscape = true,
                onDismiss = { showPrintDialog = false }
            )
        }
    }
}
