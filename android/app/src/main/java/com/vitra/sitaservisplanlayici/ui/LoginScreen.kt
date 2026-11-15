package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.vitra.sitaservisplanlayici.R
import com.vitra.sitaservisplanlayici.data.ApiClient
import com.vitra.sitaservisplanlayici.data.ApiException
import com.vitra.sitaservisplanlayici.data.AppUser
import com.vitra.sitaservisplanlayici.data.Repository
import kotlinx.coroutines.launch
import androidx.compose.foundation.clickable

@Composable
fun LoginScreen(onLoggedIn: (AppUser) -> Unit) {
    var name by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var serverAddress by remember { mutableStateOf(ApiClient.serverAddress) }
    var editingServer by remember { mutableStateOf(false) }
    // Sunucu adresi kullanıcıya gösterilmez (mağaza sürümünde kafa karıştırıyor):
    // geliştirme derlemesinde görünür; diğerlerinde logoya 5 kez dokununca açılır.
    val loginContext = androidx.compose.ui.platform.LocalContext.current
    var showServerSettings by remember {
        mutableStateOf((loginContext.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0)
    }
    var logoTaps by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .imePadding()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Image(
            painter = painterResource(id = R.mipmap.ic_launcher_foreground),
            contentDescription = null,
            modifier = Modifier.size(96.dp).clickable(
                interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() },
                indication = null
            ) { if (++logoTaps >= 5) showServerSettings = true }
        )
        Spacer(Modifier.height(12.dp))
        Text("SİTA YAPI", style = MaterialTheme.typography.headlineMedium)
        Spacer(Modifier.height(32.dp))
        OutlinedTextField(
            value = name,
            onValueChange = { name = it; error = null },
            label = { Text("Ad") },
            leadingIcon = { Icon(Icons.Filled.Person, contentDescription = null) },
            singleLine = true,
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(12.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = null },
            label = { Text("Şifre") },
            leadingIcon = { Icon(Icons.Filled.Lock, contentDescription = null) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth()
        )
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(24.dp))
        Button(
            onClick = {
                error = null
                isLoading = true
                scope.launch {
                    try {
                        val user = Repository.login(name.trim(), password)
                        if (user == null) {
                            error = "Hatalı kullanıcı adı veya şifre."
                        } else {
                            onLoggedIn(user)
                        }
                    } catch (e: ApiException) {
                        error = e.message
                    } catch (e: Exception) {
                        error = "Sunucuya bağlanılamadı."
                    } finally {
                        isLoading = false
                    }
                }
            },
            enabled = name.isNotBlank() && password.isNotBlank() && !isLoading,
            modifier = Modifier.fillMaxWidth()
        ) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = MaterialTheme.colorScheme.onPrimary)
            } else {
                Text("Giriş Yap")
            }
        }
        Spacer(Modifier.height(16.dp))
        // Sunucu (Mac'in LAN IP'si) Wi-Fi değişince kayabiliyor — yeniden
        // derlemeden buradan güncellenebilsin.
        if (editingServer) {
            OutlinedTextField(
                value = serverAddress,
                onValueChange = { serverAddress = it; error = null },
                label = { Text("Sunucu adresi (ör. 192.168.1.103:4173)") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
                modifier = Modifier.fillMaxWidth()
            )
            TextButton(onClick = {
                ApiClient.serverAddress = serverAddress.ifBlank { ApiClient.defaultServerAddress }
                serverAddress = ApiClient.serverAddress
                editingServer = false
            }) { Text("Kaydet") }
        } else if (showServerSettings) {
            TextButton(onClick = { editingServer = true }) {
                Text("Sunucu: ${ApiClient.serverAddress}", style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
