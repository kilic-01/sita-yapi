package com.vitra.sitaservisplanlayici.ui

import com.vitra.sitaservisplanlayici.data.hapticConfirm
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.QrCodeScanner
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import androidx.navigation.NavController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.codeAndName
import kotlinx.coroutines.launch

@Composable
fun StockScreen(appState: AppState) {
    val navController = rememberNavController()
    // Stok sekmesi kendi iç navigasyonunu kullanır (liste -> detay -> düzenle),
    // RootApp'teki ana NavHost'tan bağımsız — iOS'ta da StockView kendi
    // NavigationStack'ini yönetiyordu.
    NavHost(navController, startDestination = "list") {
        composable("list") { StockListScreen(appState, navController) }
        composable("detail/{id}") { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id").orEmpty()
            StockDetailScreen(appState = appState, stockId = id, navController = navController)
        }
        composable("create") { StockCreateScreen(appState = appState, navController = navController) }
    }
}

@Composable
private fun StockListScreen(appState: AppState, navController: NavController) {
    var query by remember { mutableStateOf("") }
    var allItems by remember { mutableStateOf<List<StockItem>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var showBarcodeDialog by remember { mutableStateOf(false) }
    val scanView = androidx.compose.ui.platform.LocalView.current
    // Ana sayfadaki "Barkod" hızlı işlemi: okuyucu doğrudan açılır.
    LaunchedEffect(appState.pendingStockScan) {
        if (appState.pendingStockScan) {
            appState.pendingStockScan = false
            showBarcodeDialog = true
        }
    }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try {
            allItems = StockCache.all()
            error = null
        } catch (e: Exception) {
            error = "Stok yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    val filtered = remember(query, allItems) {
        val q = query.trim().lowercase()
        if (q.isEmpty()) {
            allItems.filter { (it.quantity ?: 0) <= 5 }.take(50)
        } else {
            allItems.filter {
                (it.name?.lowercase()?.contains(q) == true) ||
                    (it.code?.lowercase()?.contains(q) == true) ||
                    (it.barcode?.lowercase()?.contains(q) == true)
            }.take(100)
        }
    }

    Scaffold(
        // Dış Scaffold (alt menü) üst/alt boşluğu zaten veriyor — iç içe Scaffold
        // ikinci kez durum çubuğu boşluğu ekleyip başlığı aşağı itiyordu.
        contentWindowInsets = androidx.compose.foundation.layout.WindowInsets(0, 0, 0, 0),
        floatingActionButton = {
            FloatingActionButton(onClick = { navController.navigate("create") }) {
                Icon(Icons.Filled.Add, contentDescription = "Ürün Ekle")
            }
        }
    ) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Text("Stok", style = MaterialTheme.typography.headlineSmall)
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Ürün ara (ad / kod / barkod)") },
                    leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                    singleLine = true,
                    modifier = Modifier.weight(1f)
                )
                IconButton(onClick = { showBarcodeDialog = true }) {
                    Icon(Icons.Filled.QrCodeScanner, contentDescription = "Barkod ile ara")
                }
            }
            Spacer(Modifier.height(8.dp))
            if (query.isBlank() && appState.recentStock.isEmpty()) {
                Text("Az Stoklu Ürünler", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.height(4.dp))
            }

            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                filtered.isEmpty() -> Text("Sonuç bulunamadı.")
                // Alttaki boşluk: "+" düğmesi son satırın miktarını kapatmasın.
                else -> LazyColumn(contentPadding = androidx.compose.foundation.layout.PaddingValues(bottom = 88.dp)) {
                    if (query.isBlank() && appState.recentStock.isNotEmpty()) {
                        item { Text("Son Bakılanlar", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        items(appState.recentStock, key = { "recent-" + it.id }) { item -> StockListRow(item) { navController.navigate("detail/${item.id}") } }
                        item {
                            androidx.compose.foundation.layout.Spacer(Modifier.height(8.dp))
                            Text("Az Stoklu Ürünler", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    items(filtered, key = { it.id }) { item -> StockListRow(item) { navController.navigate("detail/${item.id}") } }
                }
            }
        }
    }

    if (showBarcodeDialog) {
        BarcodeScannerDialog(
            title = "Barkod ile Ara",
            onDismiss = { showBarcodeDialog = false },
            onScan = { code ->
                scanView.hapticConfirm()
                showBarcodeDialog = false
                query = code
            }
        )
    }
}

/**
 * Ürün görseli (stoktaki imageUrl): beyaz zeminli, köşeleri yuvarlak kare. Görsel yoksa
 * ya da yüklenemezse boş kutu. mncdn adreslerinde küçük boyut istenir (liste hızlı kalsın).
 */
@Composable
fun ProductThumbnail(url: String?, size: androidx.compose.ui.unit.Dp) {
    val shape = androidx.compose.foundation.shape.RoundedCornerShape(8.dp)
    androidx.compose.foundation.layout.Box(
        Modifier
            .size(size)
            .clip(shape)
            .background(androidx.compose.ui.graphics.Color.White)
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, shape),
        contentAlignment = Alignment.Center
    ) {
        if (url.isNullOrBlank()) {
            Icon(
                androidx.compose.material.icons.Icons.Filled.Inventory2,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.outlineVariant,
                modifier = Modifier.size(size * 0.45f)
            )
        } else {
            val px = (size.value * 3).toInt().coerceAtMost(1000)
            coil.compose.AsyncImage(
                model = url.replace(Regex("/mnresize/\\d+/\\d+/"), "/mnresize/$px/$px/"),
                contentDescription = null,
                contentScale = androidx.compose.ui.layout.ContentScale.Fit,
                modifier = Modifier.fillMaxSize().padding(2.dp)
            )
        }
    }
}

/** Miktar rozeti: 0 kırmızı, eşik altı turuncu, diğerleri nötr. */
@Composable
fun QuantityBadge(quantity: Int, threshold: Int) {
    val (fg, bg) = when {
        quantity <= 0 -> com.vitra.sitaservisplanlayici.ui.theme.StatusRed to com.vitra.sitaservisplanlayici.ui.theme.StatusRed.copy(alpha = 0.12f)
        quantity <= threshold -> com.vitra.sitaservisplanlayici.ui.theme.StatusOrange to com.vitra.sitaservisplanlayici.ui.theme.StatusOrange.copy(alpha = 0.14f)
        else -> MaterialTheme.colorScheme.onSurfaceVariant to MaterialTheme.colorScheme.surfaceVariant
    }
    Text(
        "$quantity adet",
        style = MaterialTheme.typography.labelMedium,
        color = fg,
        modifier = Modifier.clip(androidx.compose.foundation.shape.RoundedCornerShape(50)).background(bg).padding(horizontal = 10.dp, vertical = 4.dp)
    )
}

/** Stok listesi satırı: görsel, kalın kod, 2 satırlık ad, renkli miktar rozeti. */
@Composable
private fun StockListRow(item: com.vitra.sitaservisplanlayici.data.StockItem, onClick: () -> Unit) {
    Card(
        Modifier
            .fillMaxWidth()
            .padding(vertical = 4.dp)
    ) {
        Row(
            Modifier
                .padding(12.dp)
                .fillMaxWidth()
                .clickable(onClick = onClick),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            ProductThumbnail(item.imageUrl, 48.dp)
            androidx.compose.foundation.layout.Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                // Ürün kodu ad ile AYNI puntoda ve ÖNÜNDE (kullanıcı
                // isteği) — artık kendi satırında kalın; uzun ad
                // altında en fazla 2 satır, satır 3 satıra taşmıyor.
                if (!item.code.isNullOrBlank()) {
                    Text(item.code, style = MaterialTheme.typography.bodyLarge, fontWeight = androidx.compose.ui.text.font.FontWeight.SemiBold, maxLines = 1)
                }
                Text(
                    item.name ?: "(isimsiz)",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (item.code.isNullOrBlank()) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                )
            }
            androidx.compose.foundation.layout.Spacer(Modifier.width(8.dp))
            QuantityBadge(item.quantity ?: 0, item.lowStockThreshold ?: 2)
        }
    }
}
