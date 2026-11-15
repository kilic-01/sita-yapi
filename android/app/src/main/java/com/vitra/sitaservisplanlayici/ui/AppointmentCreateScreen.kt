package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
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
import com.vitra.sitaservisplanlayici.data.AppointmentsCache
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.NewAppointment
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.Technician
import com.vitra.sitaservisplanlayici.data.composeAddress
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.format.DateTimeFormatter

@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun AppointmentCreateScreen(appState: AppState, navController: NavController) {
    var customerName by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var contactName by remember { mutableStateOf("") }
    var internalNote by remember { mutableStateOf("") }
    // Telefon/isim yazılınca aynı müşterinin önceki servisleri (masaüstündeki uyarı gibi).
    var history by remember { mutableStateOf<List<com.vitra.sitaservisplanlayici.data.Appointment>>(emptyList()) }
    var addressDetail by remember { mutableStateOf(AddressDetail()) }
    var complaint by remember { mutableStateOf("") }
    var date by remember { mutableStateOf(LocalDate.now()) }
    var urgent by remember { mutableStateOf(false) }
    var technicians by remember { mutableStateOf<List<Technician>>(emptyList()) }
    var selectedTechnician by remember { mutableStateOf<Technician?>(null) }
    var menuExpanded by remember { mutableStateOf(false) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        try { technicians = Repository.listTechnicians() } catch (_: Exception) { }
    }
    LaunchedEffect(phone, customerName) {
        val digits = phone.filter { it.isDigit() }
        val name = customerName.trim()
        if (digits.length < 10 && name.length < 3) { history = emptyList(); return@LaunchedEffect }
        kotlinx.coroutines.delay(500)
        history = runCatching {
            if (digits.length >= 10) Repository.appointmentsByCustomerPhone(phone.trim()) else Repository.appointmentsByCustomer(name)
        }.getOrDefault(history)
    }

    Column(
        Modifier
            .fillMaxSize()
            .padding(16.dp)
            .verticalScroll(rememberScrollState())
            .imePadding()
    ) {
        Text("Yeni Randevu", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(16.dp))
        OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Müşteri Adı") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = phone, onValueChange = { phone = it }, label = { Text("Telefon") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = contactName, onValueChange = { contactName = it }, label = { Text("Muhatap Kişi (opsiyonel)") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        if (history.isNotEmpty()) {
            androidx.compose.material3.Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(12.dp)) {
                    Text("Bu müşteri daha önce ${history.size} kez servis almış", style = MaterialTheme.typography.titleSmall, color = androidx.compose.ui.graphics.Color(0xFFD97706))
                    history.take(3).forEach { a ->
                        Spacer(Modifier.height(4.dp))
                        Text((a.scheduledDate ?: "—") + " · " + (a.complaint?.takeIf { it.isNotBlank() } ?: "(şikâyet yok)"), style = MaterialTheme.typography.bodySmall, maxLines = 2)
                    }
                    if (history.size > 3) Text("+${history.size - 3} ziyaret daha", style = MaterialTheme.typography.bodySmall)
                }
            }
            Spacer(Modifier.height(8.dp))
        }
        AddressDetailFields(value = addressDetail, onChange = { addressDetail = it })
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = complaint, onValueChange = { complaint = it }, label = { Text("Şikayet / Not") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(value = internalNote, onValueChange = { internalNote = it }, label = { Text("Not (yalnız bize görünür)") }, modifier = Modifier.fillMaxWidth())
        Spacer(Modifier.height(12.dp))

        DateField(date = date, onChange = { date = it })
        Spacer(Modifier.height(12.dp))

        Row(modifier = Modifier.fillMaxWidth()) {
            Text("Acil", modifier = Modifier.weight(1f))
            Switch(checked = urgent, onCheckedChange = { urgent = it })
        }
        Spacer(Modifier.height(12.dp))

        ExposedDropdownMenuBox(expanded = menuExpanded, onExpandedChange = { menuExpanded = it }) {
            OutlinedTextField(
                value = selectedTechnician?.name ?: "Atanmamış",
                onValueChange = {},
                readOnly = true,
                label = { Text("Teknisyen") },
                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuExpanded) },
                modifier = Modifier.fillMaxWidth().menuAnchor()
            )
            DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                DropdownMenuItem(text = { Text("Atanmamış") }, onClick = { selectedTechnician = null; menuExpanded = false })
                technicians.forEach { tech ->
                    DropdownMenuItem(text = { Text(tech.name) }, onClick = { selectedTechnician = tech; menuExpanded = false })
                }
            }
        }
        Spacer(Modifier.height(8.dp))

        if (error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error)
            Spacer(Modifier.height(8.dp))
        }

        Row {
            OutlinedButton(onClick = { navController.popBackStack() }, modifier = Modifier.weight(1f)) {
                Text("İptal")
            }
            Spacer(Modifier.height(0.dp))
            Button(
                onClick = {
                    error = null
                    isSaving = true
                    scope.launch {
                        try {
                            Repository.createAppointment(
                                NewAppointment(
                                    customerName = customerName.trim(),
                                    customerPhone = phone.trim().ifBlank { null },
                                    address = composeAddress(addressDetail),
                                    addressDetail = addressDetail,
                                    complaint = complaint.trim().ifBlank { null },
                                    scheduledDate = date.format(DateTimeFormatter.ISO_LOCAL_DATE),
                                    urgency = if (urgent) "acil" else "normal",
                                    assignedTechnicianId = selectedTechnician?.id,
                                    actingUserId = appState.currentUser?.id,
                                    contactName = contactName.trim().ifBlank { null },
                                    internalNote = internalNote.trim().ifBlank { null }
                                )
                            )
                            AppointmentsCache.invalidate(date.format(DateTimeFormatter.ISO_LOCAL_DATE))
                            navController.popBackStack()
                        } catch (e: Exception) {
                            error = e.message ?: "Randevu kaydedilemedi."
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = customerName.isNotBlank() && composeAddress(addressDetail).isNotBlank() && !isSaving,
                modifier = Modifier.weight(1f)
            ) {
                if (isSaving) CircularProgressIndicator(modifier = Modifier.height(20.dp)) else Text("Kaydet")
            }
        }
    }
}
