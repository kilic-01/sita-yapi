package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffold

/** iOS'taki CustomerHistoryView'in karşılığı — GET /api/appointments/by-customer. */
@Composable
fun CustomerHistoryScreen(customerName: String, navController: NavController) {
    var history by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(customerName) {
        try {
            history = Repository.appointmentsByCustomer(customerName)
                .sortedByDescending { it.scheduledDate ?: "" }
            error = null
        } catch (e: Exception) {
            error = "Geçmiş yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    SimpleScreenScaffold(title = customerName, navController = navController) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                history.isEmpty() -> Text("Bu müşteri için geçmiş randevu yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn {
                    items(history, key = { it.id }) { appt ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Column(Modifier.padding(16.dp)) {
                                Text(appt.scheduledDate ?: "-", style = MaterialTheme.typography.titleMedium)
                                if (!appt.complaint.isNullOrBlank()) Text(appt.complaint)
                                if (!appt.address.isNullOrBlank()) {
                                    Text(appt.address, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Text(statusLabelFor(appt.status), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }
}

fun statusLabelFor(status: String?): String = when (status) {
    "completed" -> "Tamamlandı"
    "routed" -> "Rotalandı"
    "cancelled" -> "İptal Edildi"
    else -> "Bekliyor"
}
