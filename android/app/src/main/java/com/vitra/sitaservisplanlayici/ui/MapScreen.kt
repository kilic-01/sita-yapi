package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.GoogleMap
import com.google.maps.android.compose.Marker
import com.google.maps.android.compose.MarkerState
import com.google.maps.android.compose.rememberCameraPositionState
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.ShopLocation
import com.vitra.sitaservisplanlayici.data.Technician
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffoldWithActions
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * iOS'taki MapTabView'in karşılığı — belirli bir günün konumlu randevuları +
 * atanan teknisyen. Önceden sadece "bugün" sabit kodluydu — masaüstündeki
 * MapPage.jsx'te olduğu gibi bir tarih seçici YOKTU; dev veritabanında bugüne
 * ait randevu olmadığında harita hep boş görünüyor, başka bir güne geçmenin
 * hiçbir yolu olmuyordu.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MapScreen(navController: NavController) {
    var appointments by remember { mutableStateOf<List<Appointment>>(emptyList()) }
    var technicians by remember { mutableStateOf<List<Technician>>(emptyList()) }
    var shopLocation by remember { mutableStateOf<ShopLocation?>(null) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }
    var selectedDate by remember { mutableStateOf(LocalDate.now()) }
    var showDatePicker by remember { mutableStateOf(false) }

    LaunchedEffect(selectedDate) {
        isLoading = true
        try {
            val dateIso = selectedDate.format(DateTimeFormatter.ISO_LOCAL_DATE)
            appointments = Repository.appointmentsByDate(dateIso).filter { it.lat != null && it.lng != null }
            technicians = Repository.listTechnicians()
            shopLocation = try { Repository.shopLocation() } catch (_: Exception) { null }
            error = null
        } catch (e: Exception) {
            error = "Harita verisi yüklenemedi: ${e.message}"
        } finally {
            isLoading = false
        }
    }

    if (showDatePicker) {
        val datePickerState = rememberDatePickerState(
            initialSelectedDateMillis = selectedDate.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    datePickerState.selectedDateMillis?.let { millis ->
                        selectedDate = Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                    }
                    showDatePicker = false
                }) { Text("Seç") }
            },
            dismissButton = { TextButton(onClick = { showDatePicker = false }) { Text("Vazgeç") } }
        ) {
            DatePicker(state = datePickerState)
        }
    }

    SimpleScreenScaffoldWithActions(
        title = "Harita",
        navController = navController,
        actions = {
            IconButton(onClick = { showDatePicker = true }) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = "Tarih seç")
            }
        }
    ) { padding ->
    Box(padding.fillMaxSize()) {
        when {
            isLoading -> CircularProgressIndicator(Modifier.align(Alignment.Center))
            error != null -> Text(error!!, Modifier.align(Alignment.Center).padding(24.dp))
            appointments.isEmpty() -> Card(Modifier.align(Alignment.TopCenter).padding(16.dp)) {
                Text("Bu tarihte konumlu randevu yok.", Modifier.padding(16.dp))
            }
            else -> { /* marker'lar haritanın üstünde ayrıca çiziliyor */ }
        }

        val center = shopLocation?.let { LatLng(it.lat, it.lng) }
            ?: appointments.firstOrNull()?.let { LatLng(it.lat!!, it.lng!!) }
            ?: LatLng(41.0082, 28.9784) // İstanbul — hiçbir konum yoksa son çare

        val cameraPositionState = rememberCameraPositionState {
            position = CameraPosition.fromLatLngZoom(center, 11f)
        }

        GoogleMap(
            modifier = Modifier.fillMaxSize(),
            cameraPositionState = cameraPositionState
        ) {
            shopLocation?.let {
                Marker(state = MarkerState(position = LatLng(it.lat, it.lng)), title = "Sita Yapı")
            }
            appointments.forEach { appt ->
                val techName = technicians.firstOrNull { it.id == appt.assignedTechnicianId }?.name
                Marker(
                    state = MarkerState(position = LatLng(appt.lat!!, appt.lng!!)),
                    title = appt.customerName ?: "(isimsiz)",
                    snippet = techName ?: "Atanmamış"
                )
            }
        }

        if (!isLoading && error == null && appointments.isNotEmpty()) {
            Card(Modifier.align(Alignment.TopCenter).padding(16.dp)) {
                Text("${appointments.size} konumlu randevu", Modifier.padding(12.dp))
            }
        }
    }
    }
}
