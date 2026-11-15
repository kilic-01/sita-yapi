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
import com.vitra.sitaservisplanlayici.data.Depot
import com.vitra.sitaservisplanlayici.data.Repository

@Composable
fun DepolarScreen(navController: NavController) {
    var items by remember { mutableStateOf<List<Depot>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            items = Repository.listDepots()
            error = null
        } catch (e: Exception) {
            error = "Depolar yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    SimpleScreenScaffold(title = "Depolar", navController = navController) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                items.isEmpty() -> Text("Depo yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn {
                    items(items, key = { it.id }) { depot ->
                        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                            Text(depot.name, Modifier.padding(16.dp))
                        }
                    }
                }
            }
        }
    }
}
