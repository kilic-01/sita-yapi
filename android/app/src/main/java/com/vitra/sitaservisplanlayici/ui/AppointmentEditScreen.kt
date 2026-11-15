package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AddressDetail
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.Technician
import com.vitra.sitaservisplanlayici.data.composeAddress
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@Composable
fun AppointmentEditScreen(appState: AppState, appointmentId: String, scheduledDate: String, navController: NavController) {
    var appt by remember { mutableStateOf<Appointment?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(appointmentId) {
        try {
            val date = scheduledDate.ifBlank { LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE) }
            appt = AppointmentsCache.refresh(date).firstOrNull { it.id == appointmentId }
            error = null
        } catch (e: Exception) {
            error = "Randevu yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        when {
            isLoading -> CircularProgressIndicator()
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
            appt == null -> Text("Randevu bulunamadı.")
            else -> AppointmentEditForm(appState = appState, appt = appt!!, navController = navController)
        }
    }
}

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
private fun AppointmentEditForm(appState: AppState, appt: Appointment, navController: NavController) {
    var customerName by remember { mutableStateOf(appt.customerName ?: "") }
    var phone by remember { mutableStateOf(appt.customerPhone ?: "") }
    var addressDetail by remember { mutableStateOf(appt.addressDetail ?: AddressDetail()) }
    var complaint by remember { mutableStateOf(appt.complaint ?: "") }
    var urgent by remember { mutableStateOf(appt.urgency == "acil") }
    val originalDate = remember { appt.scheduledDate?.let { runCatching { LocalDate.parse(it) }.getOrNull() } ?: LocalDate.now() }
    var date by remember { mutableStateOf(originalDate) }
    var technicians by remember { mutableStateOf<List<Technician>>(emptyList()) }
    var technicianId by remember { mutableStateOf(appt.assignedTechnicianId) }
    var menuExpanded by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try { technicians = Repository.listTechnicians() } catch (_: Exception) { }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).imePadding()) {
        Text("Randevuyu Düzenle", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Müşteri Adı") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Telefon") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        if (addressDetail.isEmpty() && !appt.address.isNullOrBlank()) {
            Text(
                "Mevcut adres: ${appt.address} — konum tabanlı özellikler (harita, rota) için aşağıdan il/ilçe/mahalle seçin.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(Modifier.height(8.dp))
        }
        AddressDetailFields(value = addressDetail, onChange = { addressDetail = it })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = complaint, onValueChange = { complaint = it }, label = { Text("Şikayet / Not") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))
        DateField(date = date, onChange = { date = it })
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth()) {
            Text("Acil", Modifier.weight(1f))
            Switch(checked = urgent, onCheckedChange = { urgent = it })
        }
        Spacer(Modifier.height(12.dp))
        ExposedDropdownMenuBox(expanded = menuExpanded, onExpandedChange = { menuExpanded = it }) {
            OutlinedTextField(
                value = technicians.firstOrNull { it.id == technicianId }?.name
                    ?: if (technicianId == null) "Otomatik rota" else "Atanmış teknisyen",
                onValueChange = {},
                readOnly = true,
                label = { Text("Teknisyen") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuExpanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor()
            )
            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                DropdownMenuItem(text = { Text("Otomatik rota") }, onClick = { technicianId = null; menuExpanded = false })
                technicians.forEach { tech ->
                    DropdownMenuItem(text = { Text(tech.name) }, onClick = { technicianId = tech.id; menuExpanded = false })
                }
            }
        }
        // Masaüstüyle aynı (kullanıcı kararı): "Otomatik rota" mevcut atamayı hemen
        // kaldırmaz; bir sonraki "Rota Oluştur"da sistem yeniden dağıtır.
        val currentTechName = appt.assignedTechnicianId?.let { id -> technicians.firstOrNull { it.id == id }?.name }
        if (technicianId == null && currentTechName != null) {
            Text(
                "$currentTechName şimdilik atanmış kalır; bir sonraki Rota Oluştur'da sistem yeniden atar.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = 4.dp, start = 4.dp)
            )
        }
        if (error != null) {
            Spacer(Modifier.height(8.dp))
            Text(error!!, color = MaterialTheme.colorScheme.error)
        }
        Spacer(Modifier.height(16.dp))
        Row {
            OutlinedButton(onClick = { navController.popBackStack() }, modifier = Modifier.weight(1f)) { Text("İptal") }
            Spacer(Modifier.width(8.dp))
            Button(
                onClick = {
                    isSaving = true
                    error = null
                    scope.launch {
                        try {
                            // Mevcut (bu özellikten önce oluşturulmuş) randevuların addressDetail'i
                            // boş — kullanıcı İl/İlçe/Mahalle alanlarına hiç dokunmadıysa düz
                            // adres metnini SIFIRLAMAMAK için orijinal appt.address'i koruyoruz;
                            // aksi halde her "sadece telefonu güncelle" kaydında adres silinirdi.
                            val (patchAddress, patchAddressDetail) = if (addressDetail.isEmpty()) {
                                appt.address to null
                            } else {
                                composeAddress(addressDetail) to addressDetail
                            }
                            val newDate = date.format(DateTimeFormatter.ISO_LOCAL_DATE)
                            Repository.updateAppointment(
                                id = appt.id,
                                customerName = customerName.trim(),
                                customerPhone = phone.trim(),
                                address = patchAddress,
                                addressDetail = patchAddressDetail,
                                complaint = complaint.trim(),
                                scheduledDate = newDate,
                                urgency = if (urgent) "acil" else "normal",
                                actingUserId = appState.currentUser?.id,
                                technicianChanged = technicianId != appt.assignedTechnicianId,
                                assignedTechnicianId = technicianId
                            )
                            appt.scheduledDate?.let { AppointmentsCache.invalidate(it) }
                            AppointmentsCache.invalidate(newDate)
                            navController.popBackStack()
                        } catch (e: Exception) {
                            error = e.message ?: "Kaydedilemedi."
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = customerName.isNotBlank() &&
                    (composeAddress(addressDetail).isNotBlank() || (addressDetail.isEmpty() && !appt.address.isNullOrBlank())) &&
                    !isSaving,
                modifier = Modifier.weight(1f)
            ) {
                if (isSaving) CircularProgressIndicator(Modifier.height(20.dp)) else Text("Kaydet")
            }
        }
    }
}
