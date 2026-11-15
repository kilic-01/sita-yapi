package com.vitra.sitaservisplanlayici.ui.more

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.QuoteItem
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.computeQuoteTotals
import com.vitra.sitaservisplanlayici.data.toLocaleDoubleOrNull
import com.vitra.sitaservisplanlayici.data.toUserMessage
import kotlinx.coroutines.launch
import java.text.NumberFormat
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Form satırı — sayılar kullanıcının yazdığı metin olarak tutulur ("1,5" gibi). */
private data class QuoteLineDraft(
    val description: String = "",
    val qty: String = "1",
    val unitPrice: String = "",
    val vatRate: String = "20"
) {
    fun toItem() = QuoteItem(
        qty = qty.toLocaleDoubleOrNull() ?: 1.0,
        unit = "Adet",
        vatRate = vatRate.toLocaleDoubleOrNull() ?: 20.0,
        unitPrice = unitPrice.toLocaleDoubleOrNull() ?: 0.0,
        description = description.trim(),
        discountRate = 0.0
    )
}

/** iOS'taki QuoteCreateView'ın (QuoteViews.swift) Android karşılığı. */
@Composable
fun QuoteCreateScreen(appState: AppState, navController: NavController) {
    var customerName by remember { mutableStateOf("") }
    var contactName by remember { mutableStateOf("") }
    var customerPhone by remember { mutableStateOf("") }
    var customerAddress by remember { mutableStateOf("") }
    var validityDays by remember { mutableStateOf(15) }
    var lines by remember { mutableStateOf(listOf(QuoteLineDraft())) }
    var isSaving by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val money = remember { NumberFormat.getCurrencyInstance(Locale.forLanguageTag("tr-TR")) }
    val totals = computeQuoteTotals(lines.map { it.toItem() })

    SimpleScreenScaffold(title = "Yeni Teklif", navController = navController) { padding ->
        Column(padding.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()).imePadding()) {
            Text("Müşteri", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Müşteri Adı") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = contactName, onValueChange = { contactName = it }, label = { Text("Yetkili Kişi") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                value = customerPhone,
                onValueChange = { customerPhone = it },
                label = { Text("Telefon") },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                modifier = Modifier.fillMaxWidth()
            )
            OutlinedTextField(value = customerAddress, onValueChange = { customerAddress = it }, label = { Text("Adres") }, minLines = 2, modifier = Modifier.fillMaxWidth())
            Spacer(Modifier.height(12.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Geçerlilik: $validityDays gün", Modifier.weight(1f))
                OutlinedButton(onClick = { if (validityDays > 1) validityDays-- }) { Text("-") }
                Spacer(Modifier.width(8.dp))
                OutlinedButton(onClick = { if (validityDays < 90) validityDays++ }) { Text("+") }
            }
            Spacer(Modifier.height(12.dp))
            Text("Kalemler", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            lines.forEachIndexed { index, line ->
                fun update(new: QuoteLineDraft) { lines = lines.toMutableList().also { it[index] = new } }
                Card(Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
                    Column(Modifier.padding(8.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = line.description,
                                onValueChange = { update(line.copy(description = it)) },
                                label = { Text("Açıklama") },
                                modifier = Modifier.weight(1f)
                            )
                            IconButton(onClick = { lines = lines.filterIndexed { i, _ -> i != index } }, enabled = lines.size > 1) {
                                Icon(Icons.Filled.Delete, contentDescription = "Kalemi sil")
                            }
                        }
                        Row {
                            OutlinedTextField(
                                value = line.qty,
                                onValueChange = { update(line.copy(qty = it)) },
                                label = { Text("Adet") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(
                                value = line.unitPrice,
                                onValueChange = { update(line.copy(unitPrice = it)) },
                                label = { Text("Birim Fiyat") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(2f)
                            )
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(
                                value = line.vatRate,
                                onValueChange = { update(line.copy(vatRate = it)) },
                                label = { Text("KDV %") },
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                                modifier = Modifier.weight(1f)
                            )
                        }
                    }
                }
            }
            OutlinedButton(onClick = { lines = lines + QuoteLineDraft() }) { Text("Kalem Ekle") }
            Spacer(Modifier.height(12.dp))
            Row {
                Text("Genel Toplam", Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Text(money.format(totals.genelToplam), style = MaterialTheme.typography.titleMedium)
            }
            if (error != null) {
                Spacer(Modifier.height(8.dp))
                Text(error!!, color = MaterialTheme.colorScheme.error)
            }
            Spacer(Modifier.height(16.dp))
            Button(
                onClick = {
                    isSaving = true
                    error = null
                    scope.launch {
                        try {
                            val user = appState.currentUser
                            Repository.createQuote(
                                Repository.NewQuote(
                                    customerName = customerName.trim(),
                                    contactName = contactName.trim(),
                                    customerPhone = customerPhone.trim(),
                                    customerEmail = "",
                                    currency = "TRY",
                                    customerAddress = customerAddress.trim(),
                                    quoteDate = LocalDate.now().format(DateTimeFormatter.ISO_LOCAL_DATE),
                                    validityDays = validityDays,
                                    preparedBy = user?.name.orEmpty(),
                                    // iOS ile aynı: tamamen boş satırlar gönderilmez.
                                    items = lines.map { it.toItem() }
                                        .filter { !it.description.isNullOrEmpty() || (it.unitPrice ?: 0.0) > 0 },
                                    actingUserId = user?.id.orEmpty()
                                )
                            )
                            navController.popBackStack()
                        } catch (e: Exception) {
                            error = e.toUserMessage()
                        } finally {
                            isSaving = false
                        }
                    }
                },
                enabled = customerName.isNotBlank() && !isSaving,
                modifier = Modifier.fillMaxWidth()
            ) {
                if (isSaving) CircularProgressIndicator(Modifier.height(20.dp)) else Text("Kaydet")
            }
        }
    }
}
