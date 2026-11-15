package com.vitra.sitaservisplanlayici.ui.more

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
import com.vitra.sitaservisplanlayici.data.ActivityEntry
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Repository

@Composable
fun AktiviteScreen(appState: AppState, navController: NavController) {
    val isAdmin = appState.currentUser?.role == "admin"
    var items by remember { mutableStateOf<List<ActivityEntry>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        if (!isAdmin) {
            isLoading = false
        } else {
            try {
                items = Repository.activityLog(appState.currentUser?.id.orEmpty())
                error = null
            } catch (e: Exception) {
                error = "Aktivite kaydı yüklenemedi: ${e.message}"
            } finally {
                isLoading = false
            }
        }
    }

    SimpleScreenScaffold(title = "Aktivite", navController = navController) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                !isAdmin -> Text(
                    "Aktivite kaydını görüntüleme yetkisi sadece yönetici hesaplarında.",
                    color = MaterialTheme.colorScheme.error
                )
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                items.isEmpty() -> Text("Aktivite kaydı yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn {
                    items(items, key = { it.id }) { entry ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Column(Modifier.padding(16.dp)) {
                                Text(entry.description ?: "-", style = MaterialTheme.typography.bodyMedium)
                                if (!entry.createdAt.isNullOrBlank()) {
                                    Text(formatActivityDate(entry.createdAt), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** "2026-11-14T13:22:05.123Z" → "14 Kas 2026, 16:22" (cihazın saat diliminde). */
private fun formatActivityDate(iso: String): String = runCatching {
    com.vitra.sitaservisplanlayici.data.serverTimeLocal(iso)!!
        .format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm", java.util.Locale("tr")))
}.getOrDefault(iso)
