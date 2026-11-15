package com.vitra.sitaservisplanlayici.ui

import android.webkit.WebView
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Cast
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.Quote
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffoldWithActions
import kotlinx.coroutines.launch
import java.io.File

/**
 * Masaüstündeki src/components/QuotePrintView.jsx'in HTML/CSS'i (bkz.
 * QuotePrintHtml.render) bir WebView'da gösterilir — bu sayede yazdırma
 * ve "Paylaş" (PDF olarak WhatsApp/SMS vb.) çıktısı masaüstüyle birebir
 * aynı görünür (iOS'taki QuoteWebPrintView ile aynı yaklaşım).
 */
@Composable
fun QuotePrintScreen(quote: Quote, navController: NavController, appState: com.vitra.sitaservisplanlayici.data.AppState? = null) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var isReady by remember { mutableStateOf(false) }
    var isExporting by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }

    val html = remember(quote) { QuotePrintHtml.render(quote) }
    val jobName = "Teklif-${quote.quoteNo ?: quote.id}"

    SimpleScreenScaffoldWithActions(
        title = quote.quoteNo ?: "Teklif",
        navController = navController,
        actions = {
            // "TV'de Göster": teklif ofis TV'sinde müşteriye gösterilir (masaüstündeki gibi).
            IconButton(onClick = {
                val me = appState?.currentUser ?: return@IconButton
                scope.launch {
                    runCatching {
                        com.vitra.sitaservisplanlayici.data.Repository.broadcastQuoteToTv(quote.id, me.id, "${android.os.Build.MODEL} · ${me.name}")
                    }.onSuccess { result ->
                        result.sentAt?.let { appState?.tvOnAir = com.vitra.sitaservisplanlayici.data.TvOnAir(it, "Teklif ${quote.quoteNo ?: ""}", quote.customerName) }
                        result.warning?.let { android.widget.Toast.makeText(context, it, android.widget.Toast.LENGTH_LONG).show() }
                    }.onFailure {
                        android.widget.Toast.makeText(context, it.message ?: "Gönderilemedi.", android.widget.Toast.LENGTH_SHORT).show()
                    }
                }
            }) {
                Icon(Icons.Filled.Cast, contentDescription = "TV'de Göster")
            }
            IconButton(onClick = { showDeleteConfirm = true }) {
                Icon(Icons.Filled.Delete, contentDescription = "Teklifi Sil")
            }
            IconButton(
                enabled = isReady && !isExporting,
                onClick = { webViewRef?.let { printWebView(context, it, jobName) } }
            ) {
                Icon(Icons.Filled.Print, contentDescription = "Yazdır")
            }
            IconButton(
                enabled = isReady && !isExporting,
                onClick = {
                    isExporting = true
                    scope.launch {
                        try {
                            val outFile = File(context.cacheDir, "prints/$jobName.pdf")
                            val ok = exportHtmlToPdf(context, html, outFile)
                            if (ok) sharePdfFile(context, outFile, "Teklifi Paylaş")
                        } finally {
                            isExporting = false
                        }
                    }
                }
            ) {
                Icon(Icons.Filled.Share, contentDescription = "Paylaş")
            }
        }
    ) { padding ->
        if (showDeleteConfirm) {
            androidx.compose.material3.AlertDialog(
                onDismissRequest = { showDeleteConfirm = false },
                title = { androidx.compose.material3.Text("${quote.quoteNo ?: "Bu teklif"} silinsin mi?") },
                text = { androidx.compose.material3.Text("Bu işlem geri alınamaz.") },
                confirmButton = {
                    androidx.compose.material3.TextButton(onClick = {
                        showDeleteConfirm = false
                        scope.launch {
                            runCatching { com.vitra.sitaservisplanlayici.data.Repository.deleteQuote(quote.id) }
                                .onSuccess { if (!navController.popBackStack(com.vitra.sitaservisplanlayici.ui.ROUTE_TEKLIFLER, false)) navController.popBackStack() }
                                .onFailure { android.widget.Toast.makeText(context, it.message ?: "Silinemedi.", android.widget.Toast.LENGTH_SHORT).show() }
                        }
                    }) { androidx.compose.material3.Text("Sil", color = androidx.compose.material3.MaterialTheme.colorScheme.error) }
                },
                dismissButton = { androidx.compose.material3.TextButton(onClick = { showDeleteConfirm = false }) { androidx.compose.material3.Text("Vazgeç") } }
            )
        }
        Box(padding.fillMaxSize()) {
            PrintableHtmlView(
                html = html,
                onReady = {
                    webViewRef = it
                    isReady = true
                }
            )
            if (!isReady || isExporting) {
                CircularProgressIndicator(Modifier.align(Alignment.Center))
            }
        }
    }
}
