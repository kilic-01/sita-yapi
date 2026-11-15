package com.vitra.sitaservisplanlayici.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.MoveToInbox
import androidx.compose.material.icons.filled.Warehouse
import androidx.compose.material.icons.filled.Timeline
import androidx.compose.material.icons.filled.CurrencyLira
import androidx.compose.material3.Card
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.fragment.app.FragmentActivity
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppLockState
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.ui.findActivity
import com.vitra.sitaservisplanlayici.ui.ROUTE_AKTIVITE
import com.vitra.sitaservisplanlayici.ui.ROUTE_BEKLEYEN_PARCALAR
import com.vitra.sitaservisplanlayici.ui.ROUTE_DEPOLAR
import com.vitra.sitaservisplanlayici.ui.ROUTE_GELEN_SIPARISLER
import com.vitra.sitaservisplanlayici.ui.ROUTE_PROFILE
import com.vitra.sitaservisplanlayici.ui.ROUTE_TEKLIFLER
import com.vitra.sitaservisplanlayici.ui.ROUTE_UCRET_TAKIP
import com.vitra.sitaservisplanlayici.ui.ROUTE_ZIMMET

private data class MoreItem(val route: String, val title: String, val subtitle: String?, val icon: androidx.compose.ui.graphics.vector.ImageVector)

@Composable
fun MoreScreen(appState: AppState, appLockState: AppLockState, navController: NavController) {
    val isAdmin = appState.currentUser?.role == "admin"
    val context = LocalContext.current
    val items = listOf(
        MoreItem(ROUTE_ZIMMET, "Zimmet", "Parça zimmetleme", Icons.Filled.Inventory),
        MoreItem(ROUTE_TEKLIFLER, "Fiyat Teklifi", null, Icons.Filled.Description),
        MoreItem(ROUTE_BEKLEYEN_PARCALAR, "Bekleyen Parçalar", null, Icons.Filled.Schedule),
        MoreItem(ROUTE_GELEN_SIPARISLER, "Gelen Siparişler", null, Icons.Filled.MoveToInbox),
        MoreItem(ROUTE_DEPOLAR, "Depolar", null, Icons.Filled.Warehouse),
        // Aktivite yalnız yöneticiye açık (sunucu da reddediyor) — diğerlerine hiç gösterilmez.
        MoreItem(ROUTE_AKTIVITE, "Aktivite", null, Icons.Filled.Timeline),
        MoreItem(ROUTE_UCRET_TAKIP, "Ücret Takip", null, Icons.Filled.CurrencyLira)
    ).filter { isAdmin || it.route != ROUTE_AKTIVITE }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Daha Fazla", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        Text("Güvenlik", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
            Row(
                Modifier.padding(16.dp).fillMaxWidth(),
                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Parmak İzi / Yüz Tanıma ile Kilitle")
                Switch(
                    checked = appLockState.isEnabled,
                    onCheckedChange = { enabled ->
                        if (enabled) {
                            val activity = context.findActivity()
                            if (activity != null && appLockState.canUseBiometrics) {
                                appLockState.authenticate(activity) { success ->
                                    if (success) {
                                        appLockState.setLockEnabled(true)
                                    } else {
                                        android.widget.Toast.makeText(context, "Kimlik doğrulama başarısız oldu.", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                }
                            } else {
                                android.widget.Toast.makeText(
                                    context,
                                    "Bu cihazda ekran kilidi (parmak izi, yüz tanıma veya PIN) kurulu değil. Lütfen önce cihaz ayarlarından bir ekran kilidi ekleyin.",
                                    android.widget.Toast.LENGTH_LONG
                                ).show()
                            }
                        } else {
                            appLockState.setLockEnabled(false)
                        }
                    }
                )
            }
        }
        Spacer(Modifier.height(16.dp))
        Text("Hesap", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Card(
            Modifier
                .fillMaxWidth()
                .padding(vertical = 4.dp)
                .clickable { navController.navigate(ROUTE_PROFILE) }
        ) {
            Row(
                Modifier.padding(16.dp).fillMaxWidth(),
                horizontalArrangement = androidx.compose.foundation.layout.Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("${appState.currentUser?.name ?: ""} olarak giriş yapıldı")
                Icon(Icons.Filled.ChevronRight, contentDescription = "Profilim")
            }
        }
        Spacer(Modifier.height(16.dp))
        LazyColumn {
            items(items) { item ->
                Card(
                    Modifier
                        .fillMaxWidth()
                        .padding(vertical = 4.dp)
                        .clickable { navController.navigate(item.route) }
                ) {
                    Row(
                        Modifier.padding(16.dp).fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(item.icon, contentDescription = null)
                        Spacer(Modifier.width(12.dp))
                        Column(Modifier.weight(1f)) {
                            Text(item.title, style = MaterialTheme.typography.bodyLarge)
                            if (item.subtitle != null) {
                                Text(item.subtitle, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                        Icon(Icons.Filled.ChevronRight, contentDescription = null)
                    }
                }
            }
        }
    }
}
