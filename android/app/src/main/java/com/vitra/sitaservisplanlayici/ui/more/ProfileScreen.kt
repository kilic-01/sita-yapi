package com.vitra.sitaservisplanlayici.ui.more

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.toUserMessage
import kotlinx.coroutines.launch
import com.vitra.sitaservisplanlayici.data.decodeDataUrlBitmap
import java.io.ByteArrayOutputStream

@Composable
fun ProfileScreen(appState: AppState, navController: NavController) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val user = appState.currentUser

    var name by remember { mutableStateOf(user?.name ?: "") }
    var newPhotoDataUrl by remember { mutableStateOf<String?>(null) }
    var newPhotoPreview by remember { mutableStateOf<Bitmap?>(null) }
    var showPasswordFields by remember { mutableStateOf(false) }
    var newPassword by remember { mutableStateOf("") }
    var newPasswordConfirm by remember { mutableStateOf("") }
    var isSaving by remember { mutableStateOf(false) }
    var statusMessage by remember { mutableStateOf<String?>(null) }
    var statusIsError by remember { mutableStateOf(false) }
    val savedPhotoBitmap = remember(user?.photo) { decodeDataUrlBitmap(user?.photo) }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                val original = bytes?.let { BitmapFactory.decodeByteArray(it, 0, it.size) } ?: return@launch
                // 512px kenar yeterli — profil fotoğrafı sadece küçük bir dairede
                // gösteriliyor, orijinal çözünürlük gereksiz yere payload'ı büyütür
                // (masaüstündeki 2MB client sınırının aynısını burada sıkıştırmayla sağlıyoruz).
                val scale = 512f / maxOf(original.width, original.height)
                val resized = if (scale < 1f) {
                    Bitmap.createScaledBitmap(original, (original.width * scale).toInt(), (original.height * scale).toInt(), true)
                } else original
                val out = ByteArrayOutputStream()
                resized.compress(Bitmap.CompressFormat.JPEG, 70, out)
                val base64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
                newPhotoPreview = resized
                newPhotoDataUrl = "data:image/jpeg;base64,$base64"
            } catch (_: Exception) {
                statusIsError = true
                statusMessage = "Fotoğraf okunamadı, lütfen başka bir fotoğraf deneyin."
            }
        }
    }

    SimpleScreenScaffold(title = "Profilim", navController = navController) { padding ->
        Column(
            // DİKKAT: imePadding() BİLEREK yok — RootApp.kt'teki NavHost'a
            // zaten genel bir imePadding uygulanıyor, burada bir daha
            // eklemek klavye yüksekliğini İKİ KEZ sayıp klavyenin üstünde
            // anlamsız bir boşluk bırakıyordu.
            padding.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Box(
                modifier = Modifier
                    .size(96.dp)
                    .clip(CircleShape),
                contentAlignment = Alignment.Center
            ) {
                when {
                    newPhotoPreview != null -> androidx.compose.foundation.Image(
                        bitmap = newPhotoPreview!!.asImageBitmap(),
                        contentDescription = "Profil fotoğrafı",
                        modifier = Modifier.fillMaxSize()
                    )
                    // Coil'in AsyncImage'ı "data:image/...;base64,..." şemasını çözemiyor
                    // (http/file/content dışındaki URI'leri desteklemiyor) — kaydettikten
                    // sonra sunucudan aynı data-URL geri geldiğinde avatar sessizce boş
                    // kalıyordu; base64'ü burada da elle Bitmap'e çeviriyoruz.
                    savedPhotoBitmap != null -> androidx.compose.foundation.Image(
                        bitmap = savedPhotoBitmap.asImageBitmap(),
                        contentDescription = "Profil fotoğrafı",
                        modifier = Modifier.fillMaxSize()
                    )
                    else -> Box(
                        Modifier.fillMaxSize().clip(CircleShape),
                        contentAlignment = Alignment.Center
                    ) {
                        androidx.compose.material3.Surface(color = MaterialTheme.colorScheme.primary, modifier = Modifier.fillMaxSize()) {
                            Box(contentAlignment = Alignment.Center) {
                                Text(
                                    (user?.name?.firstOrNull() ?: '?').toString().uppercase(),
                                    color = Color.White,
                                    style = MaterialTheme.typography.headlineMedium
                                )
                            }
                        }
                    }
                }
            }
            VSpace()
            TextButton(onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                Text("Fotoğrafı Değiştir")
            }
            VSpace()
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Ad Soyad") },
                modifier = Modifier.fillMaxWidth()
            )
            VSpace()
            if (!showPasswordFields) {
                OutlinedButton(onClick = { showPasswordFields = true }, modifier = Modifier.fillMaxWidth()) {
                    Text("Şifre Değiştir")
                }
            } else {
                OutlinedTextField(
                    value = newPassword,
                    onValueChange = { newPassword = it },
                    label = { Text("Yeni Şifre") },
                    visualTransformation = PasswordVisualTransformation(),
                    modifier = Modifier.fillMaxWidth()
                )
                VSpace()
                OutlinedTextField(
                    value = newPasswordConfirm,
                    onValueChange = { newPasswordConfirm = it },
                    label = { Text("Yeni Şifre (Tekrar)") },
                    visualTransformation = PasswordVisualTransformation(),
                    isError = newPasswordConfirm.isNotEmpty() && newPassword != newPasswordConfirm,
                    modifier = Modifier.fillMaxWidth()
                )
                if (newPasswordConfirm.isNotEmpty() && newPassword != newPasswordConfirm) {
                    Text("Şifreler eşleşmiyor.", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                TextButton(onClick = { showPasswordFields = false; newPassword = ""; newPasswordConfirm = "" }) {
                    Text("Vazgeç")
                }
            }
            VSpace()
            if (statusMessage != null) {
                Text(
                    statusMessage!!,
                    color = if (statusIsError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.bodySmall
                )
                VSpace()
            }
            val passwordValid = !showPasswordFields || (newPassword.isNotBlank() && newPassword == newPasswordConfirm)
            Button(
                onClick = {
                    val currentUser = user ?: return@Button
                    isSaving = true
                    statusMessage = null
                    scope.launch {
                        try {
                            val updated = Repository.updateUser(
                                currentUser.id,
                                Repository.UpdateUserPatch(
                                    name = name.trim().ifBlank { null },
                                    password = if (showPasswordFields) newPassword else null,
                                    photo = newPhotoDataUrl
                                ),
                                currentUser.id
                            )
                            appState.login(updated)
                            newPhotoDataUrl = null
                            newPhotoPreview = null
                            showPasswordFields = false
                            newPassword = ""
                            newPasswordConfirm = ""
                            statusIsError = false
                            statusMessage = "Profil güncellendi."
                        } catch (e: Exception) {
                            statusIsError = true
                            statusMessage = e.toUserMessage()
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = !isSaving && passwordValid && name.isNotBlank(),
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.size(20.dp)) else Text("Kaydet")
            }
            VSpace()
            HorizontalDivider()
            VSpace()
            var showLogoutConfirm by remember { mutableStateOf(false) }
            Button(
                onClick = { showLogoutConfirm = true },
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("Çıkış Yap")
            }
            // iOS'taki onay penceresiyle aynı: yanlışlıkla çıkışı önler.
            if (showLogoutConfirm) {
                androidx.compose.material3.AlertDialog(
                    onDismissRequest = { showLogoutConfirm = false },
                    title = { Text("Çıkış yapmak istiyor musunuz?") },
                    confirmButton = {
                        androidx.compose.material3.TextButton(onClick = { showLogoutConfirm = false; appState.logout() }) {
                            Text("Çıkış Yap", color = MaterialTheme.colorScheme.error)
                        }
                    },
                    dismissButton = { androidx.compose.material3.TextButton(onClick = { showLogoutConfirm = false }) { Text("Vazgeç") } }
                )
            }
        }
    }
}

@Composable
private fun VSpace() {
    androidx.compose.foundation.layout.Spacer(Modifier.height(12.dp))
}
