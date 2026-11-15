package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.vitra.sitaservisplanlayici.data.AddressDetail
import com.vitra.sitaservisplanlayici.data.TurkeyAddressData
import java.text.Collator
import java.util.Locale

// Kotlin'in varsayılan String sıralaması Unicode kod noktasına göre çalışıyor —
// Türkçe "İ" harfi bu sırada "Z"den sonra geldiği için "İSTANBUL" ve "İZMİR"
// listenin en altına düşüyordu. Türk alfabesi kurallarına göre sıralamak için
// Collator şart. Ayrıca iş akışında en sık kullanılan İstanbul/Beşiktaş en üste
// sabitleniyor — her açılışta listede aramak yerine hemen görünüyor.
private val trCollator: Collator = Collator.getInstance(Locale("tr", "TR"))

private fun Collection<String>.sortedTurkish(): List<String> = sortedWith(trCollator)

private fun List<String>.withPinnedFirst(pinned: String): List<String> =
    if (contains(pinned)) listOf(pinned) + filter { it != pinned } else this

/**
 * Masaüstündeki AddressDetailInput (AppointmentForm.jsx) ile aynı il -> ilçe
 * -> mahalle kademeli seçimi — bkz. TurkeyAddressData.kt'deki üst yorum:
 * backend geocoding'i bu alanlar olmadan hiç denemiyor.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AddressDetailFields(value: AddressDetail, onChange: (AddressDetail) -> Unit) {
    val context = LocalContext.current
    var data by remember { mutableStateOf<Map<String, Map<String, List<String>>>>(emptyMap()) }

    LaunchedEffect(Unit) {
        data = try { TurkeyAddressData.load(context) } catch (_: Exception) { emptyMap() }
    }

    val ilceler = value.il?.let { data[it] } ?: emptyMap()
    val mahalleler = value.ilce?.let { ilceler[it] } ?: emptyList()

    Column {
        Row(Modifier.fillMaxWidth()) {
            SimpleDropdownField(
                label = "İl",
                selected = value.il,
                options = data.keys.sortedTurkish().withPinnedFirst("İSTANBUL"),
                modifier = Modifier.weight(1f),
                onSelect = { onChange(value.copy(il = it, ilce = null, mahalle = null)) }
            )
            Spacer(Modifier.width(8.dp))
            SimpleDropdownField(
                label = "İlçe",
                selected = value.ilce,
                options = ilceler.keys.sortedTurkish().withPinnedFirst("BEŞİKTAŞ"),
                modifier = Modifier.weight(1f),
                enabled = value.il != null,
                onSelect = { onChange(value.copy(ilce = it, mahalle = null)) }
            )
        }
        Spacer(Modifier.height(8.dp))
        SimpleDropdownField(
            label = "Mahalle",
            selected = value.mahalle,
            options = mahalleler.sortedTurkish(),
            enabled = value.ilce != null,
            onSelect = { onChange(value.copy(mahalle = it)) }
        )
        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = value.street ?: "",
            onValueChange = { onChange(value.copy(street = it)) },
            label = { Text("Sokak / Cadde") },
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth()) {
            OutlinedTextField(
                value = value.buildingName ?: "",
                onValueChange = { onChange(value.copy(buildingName = it)) },
                label = { Text("Bina Adı (opsiyonel)") },
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(8.dp))
            OutlinedTextField(
                value = value.apartmentNo ?: "",
                onValueChange = { onChange(value.copy(apartmentNo = it)) },
                label = { Text("Daire No") },
                modifier = Modifier.weight(1f)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SimpleDropdownField(
    label: String,
    selected: String?,
    options: List<String>,
    modifier: Modifier = Modifier,
    enabled: Boolean = true,
    onSelect: (String) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(
        expanded = expanded && enabled,
        onExpandedChange = { if (enabled) expanded = it },
        modifier = modifier
    ) {
        OutlinedTextField(
            value = selected ?: "",
            onValueChange = {},
            readOnly = true,
            enabled = enabled,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded && enabled) },
            modifier = Modifier.fillMaxWidth().menuAnchor()
        )
        DropdownMenu(expanded = expanded && enabled, onDismissRequest = { expanded = false }) {
            if (options.isEmpty()) {
                DropdownMenuItem(text = { Text("Seçenek yok", color = MaterialTheme.colorScheme.onSurfaceVariant) }, onClick = { expanded = false })
            }
            options.forEach { option ->
                DropdownMenuItem(text = { Text(option) }, onClick = {
                    onSelect(option)
                    expanded = false
                })
            }
        }
    }
}
