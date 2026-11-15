package com.vitra.sitaservisplanlayici.ui.more

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.text.KeyboardActions
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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusDirection
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.QuoteItem
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.StockCache
import com.vitra.sitaservisplanlayici.data.StockItem
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
    val code: String = "",
    val description: String = "",
    val qty: String = "1",
    val unitPrice: String = "",
    val vatRate: String = "20",
    // Formda gösterilmeyen ama düzenlemede korunması gereken alanlar
    // (masaüstünde girilen birim ve satır iskontosu).
    val unit: String = "Adet",
    val discountRate: Double = 0.0,
    val stockItemId: String? = null
) {
    fun toItem() = QuoteItem(
        qty = qty.toLocaleDoubleOrNull() ?: 1.0,
        code = code.trim(),
        unit = unit,
        vatRate = vatRate.toLocaleDoubleOrNull() ?: 20.0,
        unitPrice = unitPrice.toLocaleDoubleOrNull() ?: 0.0,
        description = description.trim(),
        discountRate = discountRate,
        stockItemId = stockItemId
    )
}

/** Sayıyı formdaki gibi yazar: 1500.0 → "1500", 12.5 → "12,5". */
private fun Double.toDraftText(): String =
    if (this % 1.0 == 0.0) this.toLong().toString() else this.toString().replace('.', ',')

private fun QuoteItem.toDraft() = QuoteLineDraft(
    code = code.orEmpty(),
    description = description.orEmpty(),
    qty = (qty ?: 1.0).toDraftText(),
    unitPrice = unitPrice?.takeIf { it != 0.0 }?.toDraftText().orEmpty(),
    vatRate = (vatRate ?: 20.0).toDraftText(),
    unit = unit ?: "Adet",
    discountRate = discountRate ?: 0.0,
    stockItemId = stockItemId
)

/**
 * iOS'taki QuoteCreateView'ın (QuoteViews.swift) Android karşılığı.
 * editQuoteId verilirse aynı form o teklifi düzenler.
 */
@Composable
fun QuoteCreateScreen(appState: AppState, navController: NavController, editQuoteId: String? = null) {
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
    val isEditing = editQuoteId != null
    var isLoadingQuote by remember { mutableStateOf(isEditing) }
    LaunchedEffect(editQuoteId) {
        if (editQuoteId == null) return@LaunchedEffect
        try {
            val q = Repository.listQuotes().firstOrNull { it.id == editQuoteId }
            if (q == null) {
                error = "Teklif bulunamadı."
            } else {
                customerName = q.customerName.orEmpty()
                contactName = q.contactName.orEmpty()
                customerPhone = q.customerPhone.orEmpty()
                customerAddress = q.customerAddress.orEmpty()
                validityDays = q.validityDays ?: 15
                lines = q.items.map { it.toDraft() }.ifEmpty { listOf(QuoteLineDraft()) }
            }
        } catch (e: Exception) {
            error = e.toUserMessage()
        } finally {
            isLoadingQuote = false
        }
    }
    // Ürün kodu önerileri — masaüstündeki QuoteForm.jsx ile aynı kural: kod ya da barkod içerir, ilk 8.
    var stock by remember { mutableStateOf<List<StockItem>>(emptyList()) }
    var focusedCodeLine by remember { mutableStateOf<Int?>(null) }
    val focusManager = LocalFocusManager.current
    LaunchedEffect(Unit) { stock = runCatching { StockCache.all() }.getOrDefault(emptyList()) }
    fun codeMatches(code: String): List<StockItem> {
        val q = code.trim().lowercase()
        if (q.isEmpty()) return emptyList()
        return stock.asSequence()
            .filter { (it.code ?: "").lowercase().contains(q) || (it.barcode ?: "").lowercase().contains(q) }
            .take(8).toList()
    }
    // Sayı alanları tek satır: Enter alt satıra geçmez, sonraki alana geçer (son alanda klavye kapanır).
    val nextField = KeyboardActions(onNext = { focusManager.moveFocus(FocusDirection.Next) })
    // Son alanda yalnız klavye kapanır (odak temizlenirse donanım Enter'ı geri butonuna düşüp formu kapatabiliyordu).
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val doneField = KeyboardActions(onDone = { keyboard?.hide() })

    SimpleScreenScaffold(title = if (isEditing) "Teklifi Düzenle" else "Yeni Teklif", navController = navController) { padding ->
        if (isLoadingQuote) {
            androidx.compose.foundation.layout.Box(padding.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            return@SimpleScreenScaffold
        }
        val scrollState = rememberScrollState()
        var viewportTop by remember { mutableStateOf(0f) }
        Column(
            padding.fillMaxSize().imePadding()
                .onGloballyPositioned { viewportTop = it.positionInWindow().y }
                .padding(16.dp).verticalScroll(scrollState)
        ) {
            Text("Müşteri", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = customerName, onValueChange = { customerName = it }, label = { Text("Müşteri Adı") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next), keyboardActions = nextField, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(value = contactName, onValueChange = { contactName = it }, label = { Text("Yetkili Kişi") }, singleLine = true, keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next), keyboardActions = nextField, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(
                value = customerPhone,
                onValueChange = { customerPhone = it },
                label = { Text("Telefon") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone, imeAction = ImeAction.Next),
                keyboardActions = nextField,
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
                        var codeFieldTop by remember { mutableStateOf(0f) }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            OutlinedTextField(
                                value = line.code,
                                onValueChange = { update(line.copy(code = it)) },
                                label = { Text("Ürün Kodu") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Characters, autoCorrectEnabled = false, imeAction = ImeAction.Next),
                                keyboardActions = nextField,
                                modifier = Modifier.weight(1f)
                                    .onGloballyPositioned { codeFieldTop = it.positionInWindow().y }
                                    .onFocusChanged {
                                    if (it.isFocused) focusedCodeLine = index
                                    else if (focusedCodeLine == index) focusedCodeLine = null
                                }
                            )
                            IconButton(onClick = { lines = lines.filterIndexed { i, _ -> i != index } }, enabled = lines.size > 1) {
                                Icon(Icons.Filled.Delete, contentDescription = "Kalemi sil")
                            }
                        }
                        val matches = if (focusedCodeLine == index) codeMatches(line.code) else emptyList()
                        // Öneriler klavyenin altında kalmasın: liste açılınca Ürün Kodu alanı
                        // görünür alanın üstüne gelecek kadar kaydır; öneriler hemen altında görünür.
                        // Her harfte yeniden tetiklenir (metin alanının kendi kaydırması öncekini
                        // iptal edebiliyor); yazma durunca bir kez kaydırır, alan zaten üstteyse dokunmaz.
                        LaunchedEffect(matches.isNotEmpty(), line.code) {
                            if (matches.isNotEmpty()) {
                                kotlinx.coroutines.delay(250)
                                val offset = codeFieldTop - viewportTop - 60f
                                if (offset > 1f) scrollState.animateScrollBy(offset)
                            }
                        }
                        if (matches.isNotEmpty()) {
                            Column(
                                Modifier.fillMaxWidth().padding(top = 4.dp)
                                    .clip(MaterialTheme.shapes.small)
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                            ) {
                                matches.forEach { s ->
                                    Column(
                                        Modifier.fillMaxWidth().clickable {
                                            // Seçilen ürün: kod, açıklama (ürün adı) ve birim fiyat otomatik dolar.
                                            update(line.copy(
                                                code = s.code.orEmpty(),
                                                description = s.name.orEmpty(),
                                                unitPrice = s.price?.let { p -> if (p % 1.0 == 0.0) p.toLong().toString() else p.toString().replace('.', ',') } ?: line.unitPrice
                                            ))
                                            focusedCodeLine = null
                                            focusManager.clearFocus()
                                        }.padding(horizontal = 12.dp, vertical = 8.dp)
                                    ) {
                                        Text(s.code.orEmpty(), style = MaterialTheme.typography.labelLarge)
                                        Text(s.name.orEmpty(), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                    }
                                }
                            }
                        }
                        OutlinedTextField(
                            value = line.description,
                            onValueChange = { update(line.copy(description = it)) },
                            label = { Text("Açıklama") },
                            modifier = Modifier.fillMaxWidth()
                        )
                        Row {
                            OutlinedTextField(
                                value = line.qty,
                                onValueChange = { update(line.copy(qty = it)) },
                                label = { Text("Adet") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                                keyboardActions = nextField,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(
                                value = line.unitPrice,
                                onValueChange = { update(line.copy(unitPrice = it)) },
                                label = { Text("Birim Fiyat") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Next),
                                keyboardActions = nextField,
                                modifier = Modifier.weight(2f)
                            )
                            Spacer(Modifier.width(8.dp))
                            OutlinedTextField(
                                value = line.vatRate,
                                onValueChange = { update(line.copy(vatRate = it)) },
                                label = { Text("KDV %") },
                                singleLine = true,
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal, imeAction = ImeAction.Done),
                                keyboardActions = doneField,
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
                            // iOS ile aynı: tamamen boş satırlar gönderilmez.
                            val items = lines.map { it.toItem() }
                                .filter { !it.description.isNullOrEmpty() || !it.code.isNullOrEmpty() || (it.unitPrice ?: 0.0) > 0 }
                            if (editQuoteId != null) {
                                Repository.updateQuote(
                                    editQuoteId,
                                    Repository.QuotePatch(
                                        customerName = customerName.trim(),
                                        contactName = contactName.trim(),
                                        customerPhone = customerPhone.trim(),
                                        customerAddress = customerAddress.trim(),
                                        validityDays = validityDays,
                                        items = items,
                                        actingUserId = user?.id.orEmpty()
                                    )
                                )
                                navController.previousBackStackEntry?.savedStateHandle?.set("quoteUpdated", System.currentTimeMillis())
                                navController.popBackStack()
                                return@launch
                            }
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
                                    items = items,
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
