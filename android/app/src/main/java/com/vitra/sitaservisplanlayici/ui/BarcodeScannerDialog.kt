package com.vitra.sitaservisplanlayici.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material.icons.filled.Close
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage

/**
 * iOS'taki BarcodeScannerView.swift'in (VisionKit DataScannerViewController)
 * Android karşılığı — CameraX + ML Kit ile canlı barkod okuma. Bilerek
 * TEK OKUMALIK: ilk barkod bulunduğunda hemen kapanıyor (iOS'taki gibi —
 * kullanıcı "art arda okuyor" sürekli tarama modunu açıkça reddetmişti).
 * Kamera izni yoksa/reddedildiyse (iOS'ta simülatörde kamera olmaması gibi)
 * manuel barkod girişine düşer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BarcodeScannerDialog(title: String, onDismiss: () -> Unit, onScan: (String) -> Unit) {
    val context = LocalContext.current
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    var permissionDenied by remember { mutableStateOf(false) }
    var cameraUnavailable by remember { mutableStateOf(false) }
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPermission = granted
        if (!granted) permissionDenied = true
    }

    LaunchedEffect(Unit) {
        if (!hasCameraPermission) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(Modifier.fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                TopAppBar(
                    title = { Text(title) },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Filled.Close, contentDescription = "İptal")
                        }
                    }
                )
                if (hasCameraPermission && !cameraUnavailable) {
                    CameraBarcodeScanner(onBarcodeDetected = onScan, onCameraUnavailable = { cameraUnavailable = true })
                } else {
                    ManualBarcodeEntry(
                        showDeniedNotice = permissionDenied && !cameraUnavailable,
                        onSubmit = onScan
                    )
                }
            }
        }
    }
}

@Composable
private fun CameraBarcodeScanner(onBarcodeDetected: (String) -> Unit, onCameraUnavailable: () -> Unit) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var handled by remember { mutableStateOf(false) }
    // Barkod okununca dialog hemen kapanıyordu — kullanıcıya "okundu" anını
    // hissettirecek bir şey yoktu. Kısa bir titreşim + çerçevenin yeşile
    // dönmesiyle (handled=true) okumanın başarılı olduğu görsel/dokunsal
    // olarak da onaylanıyor, dialog ondan hemen sonra kapanıyor.
    var foundVisual by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                val scanner = BarcodeScanning.getClient()
                val cameraProviderFuture = ProcessCameraProvider.getInstance(ctx)
                cameraProviderFuture.addListener({
                    try {
                        val cameraProvider = cameraProviderFuture.get()
                        val preview = Preview.Builder().build().also {
                            it.setSurfaceProvider(previewView.surfaceProvider)
                        }
                        val analysis = ImageAnalysis.Builder()
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .build()
                        analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx)) { imageProxy ->
                            analyzeFrame(scanner, imageProxy) { code ->
                                if (!handled) {
                                    handled = true
                                    foundVisual = true
                                    vibrateOnScan(ctx)
                                    onBarcodeDetected(code)
                                }
                            }
                        }
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                    } catch (_: Exception) {
                        // Kamera donanımı yok/erişilemiyor (ör. kamerasız emülatör) —
                        // kullanıcıyı siyah ekranda bırakmak yerine manuel girişe düş.
                        onCameraUnavailable()
                    }
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            }
        )
        androidx.compose.foundation.layout.Box(
            Modifier
                .fillMaxSize()
                .padding(24.dp)
                .border(
                    width = 3.dp,
                    color = if (foundVisual) androidx.compose.ui.graphics.Color(0xFF2ECC71) else androidx.compose.ui.graphics.Color.White.copy(alpha = 0.6f)
                )
        )
        Text(
            "Barkodu çerçeve içine getirin",
            color = androidx.compose.ui.graphics.Color.White,
            modifier = Modifier
                .padding(24.dp)
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            try {
                ProcessCameraProvider.getInstance(context).get().unbindAll()
            } catch (_: Exception) { }
        }
    }
}

private fun vibrateOnScan(context: android.content.Context) {
    try {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S) {
            val manager = context.getSystemService(android.os.VibratorManager::class.java)
            manager?.defaultVibrator?.vibrate(android.os.VibrationEffect.createOneShot(40, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
        } else {
            @Suppress("DEPRECATION")
            val vibrator = context.getSystemService(android.content.Context.VIBRATOR_SERVICE) as? android.os.Vibrator
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                vibrator?.vibrate(android.os.VibrationEffect.createOneShot(40, android.os.VibrationEffect.DEFAULT_AMPLITUDE))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(40)
            }
        }
    } catch (_: Exception) {
        // Titreşim donanımı/izni olmayan cihazlarda sessizce atla — görsel
        // geri bildirim (yeşil çerçeve) zaten yeterli.
    }
}

// CameraX androidx.annotation.OptIn bekliyor (Kotlin @OptIn lint hatası veriyordu)
@androidx.annotation.OptIn(markerClass = [ExperimentalGetImage::class])
private fun analyzeFrame(scanner: com.google.mlkit.vision.barcode.BarcodeScanner, imageProxy: ImageProxy, onDetected: (String) -> Unit) {
    val mediaImage = imageProxy.image
    if (mediaImage == null) {
        imageProxy.close()
        return
    }
    val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
    scanner.process(image)
        .addOnSuccessListener { barcodes: List<Barcode> ->
            barcodes.firstOrNull()?.rawValue?.let(onDetected)
        }
        .addOnCompleteListener { imageProxy.close() }
}

@Composable
private fun ManualBarcodeEntry(showDeniedNotice: Boolean, onSubmit: (String) -> Unit) {
    var code by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().padding(24.dp)) {
        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
            Icon(Icons.Filled.CameraAlt, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(0.dp))
        }
        Text(
            if (showDeniedNotice) "Kamera izni verilmedi — barkod numarasını elle girebilirsiniz."
            else "Bu cihazda kamera taraması kullanılamıyor.",
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = code,
            onValueChange = { code = it },
            label = { Text("Barkod") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        Button(
            onClick = { onSubmit(code.trim()) },
            enabled = code.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) { Text("Ara") }
    }
}
