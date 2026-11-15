package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronLeft
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale

/** "15/11/2026 Pazar" — formlarda gösterilen tarih biçimi (GG/AA/YYYY + gün adı). */
fun trLongDate(date: LocalDate): String =
    date.format(DateTimeFormatter.ofPattern("dd/MM/yyyy EEEE", Locale("tr")))

/** Takvimden gün seçtiren pencere (iOS'taki DatePicker'ın karşılığı). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DatePickerModal(date: LocalDate, onDismiss: () -> Unit, onPick: (LocalDate) -> Unit) {
    val state = rememberDatePickerState(
        initialSelectedDateMillis = date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
                onDismiss()
            }) { Text("Seç") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Vazgeç") } }
    ) {
        DatePicker(state = state)
    }
}

/** Form tarih alanı: dokununca takvim açılır, oklar bir gün geri/ileri alır. */
@Composable
fun DateField(date: LocalDate, onChange: (LocalDate) -> Unit, modifier: Modifier = Modifier) {
    var showPicker by remember { mutableStateOf(false) }
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { onChange(date.minusDays(1)) }) { Icon(Icons.Filled.ChevronLeft, contentDescription = "Önceki gün") }
        OutlinedButton(onClick = { showPicker = true }, modifier = Modifier.weight(1f)) {
            Icon(Icons.Filled.CalendarMonth, contentDescription = null, modifier = Modifier.size(18.dp))
            androidx.compose.foundation.layout.Spacer(Modifier.width(8.dp))
            Text(trLongDate(date), maxLines = 1)
        }
        IconButton(onClick = { onChange(date.plusDays(1)) }) { Icon(Icons.Filled.ChevronRight, contentDescription = "Sonraki gün") }
    }
    if (showPicker) {
        DatePickerModal(date, onDismiss = { showPicker = false }, onPick = onChange)
    }
}
