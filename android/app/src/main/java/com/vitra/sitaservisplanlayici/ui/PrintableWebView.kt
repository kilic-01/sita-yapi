package com.vitra.sitaservisplanlayici.ui

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Rect
import android.graphics.pdf.PdfDocument
import android.print.PrintAttributes
import android.print.PrintManager
import android.view.View
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import kotlin.coroutines.resume
import kotlin.math.roundToInt

/**
 * Masaüstündeki (Electron/Chromium) yazdırma çıktısıyla piksel piksel aynı
 * görünsün diye: native Compose yerine masaüstünün ürettiği HTML/CSS burada
 * bir WebView'da gösterilir — yazdırma ve PDF paylaşımı da bu WebView'ın
 * kendi (Chromium tabanlı) print renderer'ı üzerinden yürütülür. iOS
 * tarafındaki QuoteWebPrintView.swift ile aynı yaklaşım.
 */
@Composable
fun PrintableHtmlView(
    html: String,
    modifier: Modifier = Modifier,
    onReady: (WebView) -> Unit = {}
) {
    AndroidView(
        modifier = modifier.fillMaxSize(),
        factory = { ctx ->
            WebView(ctx).apply {
                // DİKKAT: bu HTML masaüstü (Electron/Chromium) için tasarlanmış
                // geniş, yüzde-tabanlı sabit bir sayfa düzeni — viewport meta
                // etiketi yok. Bu iki ayar olmadan WebView içeriği telefonun dar
                // ekranına göre YENİDEN AKITMAYA çalışıyor (useWideViewPort=false
                // varsayılanı), bu da yüzdelik sütunların çok dar hesaplanmasına
                // ve metinlerin/logonun birbirine girmesine yol açıyordu.
                // useWideViewPort: sayfanın kendi doğal (geniş) genişliğine saygı
                // göster. loadWithOverviewMode: sonra o geniş sayfayı ekrana SIĞACAK
                // şekilde KÜÇÜLTEREK göster — masaüstündeki/PDF'teki ile birebir
                // aynı oranlarda, sadece küçük bir "genel görünüm".
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        onReady(view)
                    }
                }
                loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            }
        }
    )
}

/** Sistemin kendi yazdırma diyaloğunu açar (yazıcı seçimi, önizleme vb). */
fun printWebView(context: Context, webView: WebView, jobName: String) {
    val printManager = context.getSystemService(Context.PRINT_SERVICE) as PrintManager
    val adapter = webView.createPrintDocumentAdapter(jobName)
    printManager.print(jobName, adapter, PrintAttributes.Builder().build())
}

/**
 * Sistem yazdırma diyaloğunu HİÇ açmadan bir PDF dosyası üretir — "Paylaş"
 * akışı için. Android'in WebView.createPrintDocumentAdapter() üzerinden
 * dönen PrintDocumentAdapter'ı elle sürmek (onLayout/onWrite) normalde bu işi
 * Chromium'un kendi print motoruyla birebir yapardı, ama bunun için gereken
 * android.print.PrintDocumentAdapter.LayoutResultCallback / WriteResultCallback
 * sınıflarının constructor'ı Android SDK'da PACKAGE-PRIVATE — uygulama
 * kodundan alt sınıf oluşturmak derleme zamanında engelleniyor (JVM erişim
 * kuralı, framework tarafından kasıtlı kısıtlanmış). Bu yüzden burada tamamen
 * public API'lerle (ekran dışı bir WebView'ı tam içerik yüksekliğine göre
 * ölçüp bir Bitmap'e çizip bunu A4 sayfalarına dilimleyerek) kendi PDF'imizi
 * üretiyoruz — Chromium'un sayfa-kırma mantığı kadar hassas değil ama gerçek,
 * paylaşılabilir bir PDF çıktısı veriyor.
 */
suspend fun exportHtmlToPdf(context: Context, html: String, outFile: File, landscape: Boolean = false): Boolean =
    withContext(Dispatchers.Main) {
        try {
            val pageWidthMm = if (landscape) 297f else 210f
            val pageHeightMm = if (landscape) 210f else 297f
            val density = context.resources.displayMetrics.density
            val pxPerMm = density * 160f / 25.4f
            val widthPx = (pageWidthMm * pxPerMm).roundToInt()
            val pageHeightPx = (pageHeightMm * pxPerMm).roundToInt()

            val webView = WebView(context)
            webView.settings.useWideViewPort = true
            webView.settings.loadWithOverviewMode = true

            val loaded = suspendCancellableCoroutine<Boolean> { cont ->
                webView.webViewClient = object : WebViewClient() {
                    override fun onPageFinished(view: WebView, url: String?) {
                        view.postVisualStateCallback(1L, object : WebView.VisualStateCallback() {
                            override fun onComplete(requestId: Long) {
                                if (cont.isActive) cont.resume(true)
                            }
                        })
                    }
                }
                webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null)
            }
            if (!loaded) return@withContext false

            webView.measure(
                View.MeasureSpec.makeMeasureSpec(widthPx, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
            )
            val contentHeightPx = maxOf((webView.contentHeight * density).roundToInt(), webView.measuredHeight, 1)
            webView.layout(0, 0, widthPx, contentHeightPx)

            val bitmap = Bitmap.createBitmap(widthPx, contentHeightPx, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.drawColor(Color.WHITE)
            webView.draw(canvas)

            val pageWidthPt = (pageWidthMm / 25.4f * 72f).roundToInt()
            val pageHeightPt = (pageHeightMm / 25.4f * 72f).roundToInt()
            val scale = pageWidthPt.toFloat() / widthPx

            val pdfDocument = PdfDocument()
            var y = 0
            var pageNum = 1
            while (y < contentHeightPx) {
                val sliceHeight = minOf(pageHeightPx, contentHeightPx - y)
                val pageInfo = PdfDocument.PageInfo.Builder(pageWidthPt, pageHeightPt, pageNum).create()
                val page = pdfDocument.startPage(pageInfo)
                val srcRect = Rect(0, y, widthPx, y + sliceHeight)
                val dstRect = Rect(0, 0, pageWidthPt, (sliceHeight * scale).roundToInt())
                page.canvas.drawBitmap(bitmap, srcRect, dstRect, null)
                pdfDocument.finishPage(page)
                y += sliceHeight
                pageNum++
            }

            outFile.parentFile?.mkdirs()
            FileOutputStream(outFile).use { pdfDocument.writeTo(it) }
            pdfDocument.close()
            bitmap.recycle()
            webView.destroy()
            true
        } catch (_: Exception) {
            false
        }
    }

/** Üretilmiş bir PDF'i FileProvider üzerinden WhatsApp/SMS/Mail vb. ile paylaşır. */
fun sharePdfFile(context: Context, file: File, chooserTitle: String) {
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "application/pdf"
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, chooserTitle))
}

/**
 * Zimmet ve Rota gibi, kendi nav route'u olmayan ekranlarda kullanılan tam
 * ekran yazdırma/paylaşma önizlemesi — Quote'un aksine ayrı bir NavHost
 * rotası açmadan, çağıran ekranın üzerine bir Dialog olarak biner.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PrintPreviewDialog(
    title: String,
    html: String,
    jobName: String,
    landscape: Boolean = false,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        val context = LocalContext.current
        val scope = rememberCoroutineScope()
        var webViewRef by remember { mutableStateOf<WebView?>(null) }
        var isReady by remember { mutableStateOf(false) }
        var isExporting by remember { mutableStateOf(false) }

        Scaffold(
            topBar = {
                CenterAlignedTopAppBar(
                    title = { Text(title) },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Filled.Close, contentDescription = "Kapat")
                        }
                    },
                    actions = {
                        IconButton(
                            enabled = isReady && !isExporting,
                            onClick = { webViewRef?.let { printWebView(context, it, jobName) } }
                        ) {
                            Icon(Icons.Filled.Print, contentDescription = "Yazdır")
                        }
                        IconButton(
                            enabled = isReady && !isExporting,
                            onClick = {
                                val webView = webViewRef ?: return@IconButton
                                isExporting = true
                                scope.launch {
                                    try {
                                        val outFile = File(context.cacheDir, "prints/$jobName.pdf")
                                        val ok = exportHtmlToPdf(context, html, outFile, landscape)
                                        if (ok) sharePdfFile(context, outFile, title)
                                    } finally {
                                        isExporting = false
                                    }
                                }
                            }
                        ) {
                            Icon(Icons.Filled.Share, contentDescription = "Paylaş")
                        }
                    }
                )
            }
        ) { padding ->
            Box(Modifier.fillMaxSize().padding(padding)) {
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
}
