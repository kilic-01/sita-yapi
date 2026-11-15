package com.vitra.sitaservisplanlayici.ui.more

import com.vitra.sitaservisplanlayici.data.trDate
import androidx.compose.foundation.clickable
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
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import com.vitra.sitaservisplanlayici.ui.ROUTE_TEKLIF_YENI
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.Quote
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.ui.quoteDetailRoute

@Composable
fun TekliflerScreen(navController: NavController) {
    var items by remember { mutableStateOf<List<Quote>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(Unit) {
        try {
            items = Repository.listQuotes()
            error = null
        } catch (e: Exception) {
            error = "Teklifler yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    SimpleScreenScaffold(
        title = "Fiyat Teklifi",
        navController = navController,
        floatingActionButton = {
            FloatingActionButton(onClick = { navController.navigate(ROUTE_TEKLIF_YENI) }) {
                Icon(Icons.Filled.Add, contentDescription = "Yeni Teklif")
            }
        }
    ) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                items.isEmpty() -> Text("Teklif yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                else -> LazyColumn {
                    items(items, key = { it.id }) { quote ->
                        Card(
                            Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp)
                                .clickable { navController.navigate(quoteDetailRoute(quote.id)) }
                        ) {
                            Column(Modifier.padding(16.dp)) {
                                Text(quote.customerName ?: "(isimsiz)", style = MaterialTheme.typography.titleMedium)
                                Text("${quote.quoteNo ?: "-"} · ${trDate(quote.quoteDate, "-")}", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }
        }
    }
}
