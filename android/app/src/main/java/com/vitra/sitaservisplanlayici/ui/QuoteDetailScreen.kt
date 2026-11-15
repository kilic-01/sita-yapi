package com.vitra.sitaservisplanlayici.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Phone
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Quote
import com.vitra.sitaservisplanlayici.data.QuoteItem
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.TvOnAir
import com.vitra.sitaservisplanlayici.data.computeQuoteTotals
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffoldWithActions
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.util.Locale

private val tryFormat: NumberFormat = NumberFormat.getCurrencyInstance(Locale("tr", "TR"))
private fun money(n: Double): String = tryFormat.format(n)

private fun lineTotal(item: QuoteItem): Double {
    val gross = (item.qty ?: 0.0) * (item.unitPrice ?: 0.0)
    return gross * (1 - (item.discountRate ?: 0.0) / 100)
}

private fun formattedQty(q: Double): String =
    if (q % 1.0 == 0.0) q.toLong().toString() else q.toString().replace('.', ',')

/**
 * Teklif detayı — iOS'taki QuoteDetailView ile aynı: müşteri, teklif bilgisi, kalemler ve
 * toplamlar yerel olarak gösterilir; "Çıktı Formatını Görüntüle" yazdırılabilir sayfayı açar.
 */
@Composable
fun QuoteDetailScreen(quoteId: String, appState: AppState, navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var quote by remember { mutableStateOf<Quote?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    LaunchedEffect(quoteId) {
        try {
            quote = Repository.listQuotes().firstOrNull { it.id == quoteId }
            if (quote == null) error = "Teklif bulunamadı."
        } catch (e: Exception) {
            error = e.message ?: "Teklif yüklenemedi."
        }
    }

    SimpleScreenScaffoldWithActions(
        title = quote?.quoteNo ?: "Teklif",
        navController = navController,
        actions = {
            val q = quote
            if (q != null) {
                IconButton(onClick = {
                    val me = appState.currentUser ?: return@IconButton
                    scope.launch {
                        runCatching { Repository.broadcastQuoteToTv(q.id, me.id, "${android.os.Build.MODEL} · ${me.name}") }
                            .onSuccess { result ->
                                result.sentAt?.let { appState.tvOnAir = TvOnAir(it, "Teklif ${q.quoteNo ?: ""}", q.customerName) }
                                result.warning?.let { android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_LONG).show() }
                            }
                            .onFailure { android.widget.Toast.makeText(context, it.message ?: "Gönderilemedi.", android.widget.Toast.LENGTH_SHORT).show() }
                    }
                }) { Icon(Icons.Filled.Cast, contentDescription = "TV'de Göster") }
                IconButton(onClick = { showDeleteConfirm = true }) { Icon(Icons.Filled.Delete, contentDescription = "Teklifi Sil") }
            }
        }
    ) { padding ->
        val q = quote
        when {
            error != null -> Text(error!!, padding.padding(16.dp), color = MaterialTheme.colorScheme.error)
            q == null -> Column(padding.padding(24.dp)) { CircularProgressIndicator() }
            else -> {
                val totals = remember(q) { computeQuoteTotals(q.items) }
                LazyColumn(padding, contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    item {
                        OutlinedButton(onClick = { navController.navigate(quotePrintRoute(q.id)) }, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Description, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("Çıktı Formatını Görüntüle")
                        }
                    }
                    item {
                        Card(Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(16.dp)) {
                                Text(q.customerName ?: "(isimsiz)", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                                q.contactName?.takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                q.customerAddress?.takeIf { it.isNotBlank() }?.let { Text(it, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                q.customerPhone?.takeIf { it.isNotBlank() }?.let { phone ->
                                    val digits = phone.filter { it.isDigit() || it == '+' }
                                    Row(
                                        Modifier.padding(top = 6.dp).clickable { context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$digits"))) },
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Icon(Icons.Filled.Phone, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(18.dp))
                                        Spacer(Modifier.width(6.dp))
                                        Text(phone, color = MaterialTheme.colorScheme.primary)
                                    }
                                }
                            }
                        }
                    }
                    item {
                        Section("Teklif Bilgisi") {
                            InfoLine("Teklif No", q.quoteNo ?: "—")
                            InfoLine("Tarih", q.quoteDate ?: "—")
                            q.validityDays?.let { InfoLine("Geçerlilik", "$it gün") }
                            q.preparedBy?.takeIf { it.isNotBlank() }?.let { InfoLine("Hazırlayan", it) }
                        }
                    }
                    item {
                        Section("Kalemler") {
                            q.items.forEachIndexed { index, item ->
                                if (index > 0) HorizontalDivider(Modifier.padding(vertical = 6.dp))
                                Text(item.description ?: item.code ?: "(isimsiz)", style = MaterialTheme.typography.bodyMedium)
                                Row(Modifier.fillMaxWidth()) {
                                    Text(
                                        "${formattedQty(item.qty ?: 0.0)} ${item.unit ?: "Adet"} × ${money(item.unitPrice ?: 0.0)}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.weight(1f)
                                    )
                                    Text(money(lineTotal(item)), style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
                    item {
                        Section("Toplam") {
                            InfoLine("Ara Toplam", money(totals.araToplam))
                            if (totals.indirimTutari > 0) InfoLine("İndirim", "-" + money(totals.indirimTutari))
                            InfoLine("KDV", money(totals.kdvToplami))
                            Row(Modifier.fillMaxWidth().padding(top = 4.dp)) {
                                Text("Genel Toplam", Modifier.weight(1f), fontWeight = FontWeight.Bold)
                                Text(money(totals.genelToplam), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }
    }

    if (showDeleteConfirm) {
        val q = quote
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("${q?.quoteNo ?: "Bu teklif"} silinsin mi?") },
            text = { Text("Bu işlem geri alınamaz.") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    if (q == null) return@TextButton
                    scope.launch {
                        runCatching { Repository.deleteQuote(q.id) }
                            .onSuccess { navController.popBackStack() }
                            .onFailure { android.widget.Toast.makeText(context, it.message ?: "Silinemedi.", android.widget.Toast.LENGTH_SHORT).show() }
                    }
                }) { Text("Sil", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Vazgeç") } }
        )
    }
}

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column {
        Text(title, style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(Modifier.height(6.dp))
        Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(16.dp)) { content() } }
    }
}

@Composable
private fun InfoLine(label: String, value: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 3.dp)) {
        Text(label, Modifier.weight(1f), color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value)
    }
}
