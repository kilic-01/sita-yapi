package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.width
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.Warning
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.foundation.layout.size
import androidx.compose.ui.draw.clip
import androidx.compose.foundation.background
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.toUserMessage
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffoldWithActions
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun AppointmentDetailScreen(appState: AppState, appointmentId: String, scheduledDate: String, navController: NavController) {
    var appt by remember { mutableStateOf<Appointment?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }
    var showDeleteConfirm by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    suspend fun reload() {
        try {
            // Tek randevu çekme ucu yok — iOS'ta da aynı yaklaşım: o günün
            // listesinden bulunuyor (bkz. Repository.appointmentsByDate). Tarih
            // rotadan geliyor: eskiden ilk yüklemede HEP bugüne bakılıyordu,
            // başka bir günün randevusu açılınca "Randevu bulunamadı" çıkıyordu.
            val date = appt?.scheduledDate
                ?: scheduledDate.ifBlank { LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE) }
            appt = AppointmentsCache.refresh(date).firstOrNull { it.id == appointmentId } ?: appt
            appt?.let { appState.addRecentAppointment(it) }
            error = null
        } catch (e: Exception) {
            error = "Randevu yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    var technicians by remember { mutableStateOf<List<com.vitra.sitaservisplanlayici.data.Technician>>(emptyList()) }
    LaunchedEffect(appointmentId) { reload() }
    LaunchedEffect(Unit) { technicians = runCatching { Repository.listTechnicians() }.getOrDefault(emptyList()) }

    SimpleScreenScaffoldWithActions(
        title = appt?.customerName ?: "Randevu",
        navController = navController,
        actions = {
            IconButton(onClick = { menuExpanded = true }) {
                Icon(Icons.Filled.MoreVert, contentDescription = "Diğer")
            }
            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                DropdownMenuItem(text = { Text("Düzenle") }, onClick = {
                    menuExpanded = false
                    navController.navigate(appointmentEditRoute(appointmentId, appt?.scheduledDate ?: LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE)))
                })
                DropdownMenuItem(text = { Text("Müşteri Geçmişi") }, onClick = {
                    menuExpanded = false
                    appt?.customerName?.let { navController.navigate(customerHistoryRoute(it)) }
                })
                DropdownMenuItem(text = { Text("Sil") }, onClick = {
                    menuExpanded = false
                    showDeleteConfirm = true
                })
            }
        }
    ) { padding ->
        Column(padding.fillMaxSize().padding(16.dp)) {
            when {
                isLoading -> CircularProgressIndicator()
                error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
                appt == null -> Text("Randevu bulunamadı.")
                else -> {
                    val a = appt!!
                    Card(Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(16.dp)) {
                            Text(a.customerName ?: "(isimsiz)", style = MaterialTheme.typography.titleLarge)
                            if (!a.address.isNullOrBlank()) Text(a.address, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            if (!a.customerPhone.isNullOrBlank()) Text(a.customerPhone, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.fillMaxWidth()) {
                        val phoneDigits = a.customerPhone.orEmpty().filter { it.isDigit() || it == '+' }
                        OutlinedButton(
                            onClick = {
                                context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:$phoneDigits")))
                            },
                            enabled = phoneDigits.isNotEmpty(),
                            modifier = Modifier.weight(1f)
                        ) { Text("Ara") }
                        Spacer(Modifier.width(8.dp))
                        OutlinedButton(
                            onClick = {
                                // Koordinat varsa doğrudan oraya, yoksa adres metniyle
                                // arama — Google Maps (veya yüklü başka harita uygulaması) açılır.
                                val uri = if (a.lat != null && a.lng != null) {
                                    Uri.parse("geo:${a.lat},${a.lng}?q=${a.lat},${a.lng}(${Uri.encode(a.customerName ?: "Müşteri")})")
                                } else {
                                    Uri.parse("geo:0,0?q=${Uri.encode(a.address.orEmpty())}")
                                }
                                try {
                                    context.startActivity(Intent(Intent.ACTION_VIEW, uri))
                                } catch (_: android.content.ActivityNotFoundException) {
                                    android.widget.Toast.makeText(context, "Harita uygulaması bulunamadı.", android.widget.Toast.LENGTH_SHORT).show()
                                }
                            },
                            enabled = (a.lat != null && a.lng != null) || !a.address.isNullOrBlank(),
                            modifier = Modifier.weight(1f)
                        ) { Text("Yol Tarifi") }
                    }
                    if (!a.geocodeIssue.isNullOrBlank()) {
                        Spacer(Modifier.height(8.dp))
                        Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                            Icon(
                                Icons.Filled.Warning,
                                contentDescription = null,
                                tint = MaterialTheme.colorScheme.error,
                                modifier = Modifier.height(16.dp)
                            )
                            Spacer(Modifier.height(0.dp))
                            Text(
                                a.geocodeIssue,
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.padding(start = 4.dp)
                            )
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    if (a.lat != null && a.lng != null) {
                        val customerLatLng = LatLng(a.lat, a.lng)
                        val cameraPositionState = rememberCameraPositionState(key = a.id) {
                            position = CameraPosition.fromLatLngZoom(customerLatLng, 15f)
                        }
                        Card(Modifier.fillMaxWidth().height(180.dp)) {
                            GoogleMap(
                                modifier = Modifier.fillMaxSize(),
                                cameraPositionState = cameraPositionState
                            ) {
                                Marker(state = MarkerState(position = customerLatLng), title = a.customerName ?: "(isimsiz)")
                            }
                        }
                    } else {
                        Text(
                            "Bu randevu için konum belirlenemedi.",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Spacer(Modifier.height(16.dp))
                    if (!a.complaint.isNullOrBlank()) {
                        Text("Şikayet / Not", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(a.complaint)
                        Spacer(Modifier.height(16.dp))
                    }
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("Teknisyen", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            androidx.compose.foundation.layout.Box(
                                Modifier.size(8.dp).clip(androidx.compose.foundation.shape.CircleShape)
                                    .background(technicianColor(a.assignedTechnicianId, technicians))
                            )
                            Spacer(Modifier.width(6.dp))
                            Text(technicians.firstOrNull { it.id == a.assignedTechnicianId }?.name ?: "Atanmadı")
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("Durum", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(statusLabelFor(a.status))
                    }
                    if (a.urgency == "acil") {
                        Spacer(Modifier.height(4.dp))
                        Text("Acil", color = MaterialTheme.colorScheme.error)
                    }
                    Spacer(Modifier.height(24.dp))
                    Text("Durumu güncelle", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    listOf("pending" to "Bekliyor olarak işaretle", "routed" to "Rotalandı olarak işaretle", "completed" to "Tamamlandı olarak işaretle")
                        .filter { it.first != a.status }
                        .forEach { (status, label) ->
                            TextButton(onClick = {
                                val myId = appState.currentUser?.id ?: return@TextButton
                                scope.launch {
                                    try {
                                        Repository.updateAppointmentStatus(a.id, status, myId)
                                        reload()
                                    } catch (e: Exception) {
                                        android.widget.Toast.makeText(context, "Durum güncellenemedi: ${e.toUserMessage()}", android.widget.Toast.LENGTH_SHORT).show()
                                    }
                                }
                            }) { Text(label) }
                        }
                }
            }
        }
    }

    if (showDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showDeleteConfirm = false },
            title = { Text("Bu randevu kalıcı olarak silinecek. Emin misiniz?") },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteConfirm = false
                    scope.launch {
                        try {
                            Repository.deleteAppointment(appointmentId)
                            appt?.scheduledDate?.let { AppointmentsCache.invalidate(it) }
                            navController.popBackStack()
                        } catch (e: Exception) {
                            error = e.message
                        }
                    }
                }) { Text("Sil", color = MaterialTheme.colorScheme.error) }
            },
            dismissButton = { TextButton(onClick = { showDeleteConfirm = false }) { Text("Vazgeç") } }
        )
    }
}

fun appointmentDetailRoute(id: String, date: String) = "appointment-detail/$id/$date"
fun appointmentEditRoute(id: String, date: String) = "appointment-edit/$id/$date"
fun customerHistoryRoute(name: String) = "customer-history/${java.net.URLEncoder.encode(name, "UTF-8")}"
