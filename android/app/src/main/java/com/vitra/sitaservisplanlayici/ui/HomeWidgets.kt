package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.RemoveCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Divider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.PartCheckout
import com.vitra.sitaservisplanlayici.data.Quote
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.Technician
import com.vitra.sitaservisplanlayici.data.quoteGrandTotal
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.util.Locale

/** iOS'taki Düzenle modunda her widget'ın sol üstünde çıkan kırmızı "-" düğmesi. */
@Composable
fun WidgetFrame(
    editMode: Boolean,
    onRemove: () -> Unit,
    content: @Composable () -> Unit
) {
    Box(Modifier.fillMaxWidth()) {
        content()
        if (editMode) {
            IconButton(onClick = onRemove, modifier = Modifier.size(28.dp).padding(2.dp)) {
                Icon(Icons.Filled.RemoveCircle, contentDescription = "Kaldır", tint = MaterialTheme.colorScheme.error)
            }
        }
    }
}

/** 2×2 gösterge ızgarası: büyük ince rakam, küçük etiket, altında tek satır açıklama. */
@Composable
fun StatsGrid(todayCount: Int, todayDone: Int, pendingCollection: Double, weekCompletionRate: Int, criticalStockCount: Int) {
    val good = com.vitra.sitaservisplanlayici.ui.theme.StatusGreen
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile("Bugünkü randevu", "$todayCount", if (todayCount == 0) "Boş gün" else "$todayDone tamamlandı", Modifier.weight(1f))
            StatTile("Bekleyen tahsilat", "₺${formatMoneyShort(pendingCollection)}", "Bugünkü randevulardan", Modifier.weight(1f),
                if (pendingCollection == 0.0) good else MaterialTheme.colorScheme.onSurface)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            StatTile("Bu hafta", "%$weekCompletionRate", "tamamlanan randevu", Modifier.weight(1f))
            StatTile("Kritik stok", "$criticalStockCount", if (criticalStockCount == 0) "Sorun yok" else "ürün azaldı", Modifier.weight(1f),
                if (criticalStockCount == 0) good else MaterialTheme.colorScheme.error)
        }
    }
}

@Composable
private fun StatTile(label: String, value: String, detail: String, modifier: Modifier, color: Color = MaterialTheme.colorScheme.onSurface) {
    Card(modifier) {
        Column(Modifier.padding(14.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(
                value,
                style = MaterialTheme.typography.displaySmall.copy(
                    fontWeight = androidx.compose.ui.text.font.FontWeight.Light,
                    fontFeatureSettings = "tnum"
                ),
                color = color,
                maxLines = 1
            )
            Text(detail, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
        }
    }
}

@Composable
fun StatsRow(pendingCollection: Double, weekCompletionRate: Int, criticalStockCount: Int) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
        StatItem(
            value = "₺${formatMoneyShort(pendingCollection)}",
            label = "Bekleyen Tahsilat",
            color = if (pendingCollection == 0.0) Color(0xFF2E7D32) else MaterialTheme.colorScheme.onSurface
        )
        StatItem(value = "%$weekCompletionRate", label = "Bu Hafta Tamamlandı")
        StatItem(
            value = "$criticalStockCount",
            label = "Kritik Stok",
            color = if (criticalStockCount == 0) Color(0xFF2E7D32) else MaterialTheme.colorScheme.error
        )
    }
}

@Composable
private fun StatItem(value: String, label: String, color: Color = MaterialTheme.colorScheme.onSurface) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = color)
        Text(label, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun formatMoneyShort(n: Double): String {
    val rounded = Math.round(n)
    return "%,d".format(rounded).replace(",", ".")
}

@Composable
fun ProgramWidgetCard(
    weekStart: LocalDate,
    dayCounts: Map<LocalDate, Int>,
    selectedDay: LocalDate,
    onSelectDay: (LocalDate) -> Unit,
    selectedDayAppointments: List<Appointment>,
    technicians: List<Technician>,
    onToggleCompleted: (Appointment) -> Unit
) {
    Card(Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Color(0xFF8E44AD))
                Spacer(Modifier.width(8.dp))
                Text("Program", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(12.dp))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                for (i in 0..6) {
                    val day = weekStart.plusDays(i.toLong())
                    val isSelected = day == selectedDay
                    val count = dayCounts[day] ?: 0
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.clickable { onSelectDay(day) }
                    ) {
                        Box(
                            modifier = Modifier
                                .size(40.dp)
                                .then(
                                    if (isSelected) Modifier
                                        .background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape)
                                    else Modifier
                                ),
                            contentAlignment = Alignment.Center
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Text(
                                    day.dayOfWeek.getDisplayName(TextStyle.SHORT, Locale("tr")).take(2),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                                Text(
                                    "${day.dayOfMonth}",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurface
                                )
                            }
                        }
                        if (count > 0) {
                            Text("$count", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
                        }
                    }
                }
            }
            Spacer(Modifier.height(12.dp))
            if (selectedDayAppointments.isEmpty()) {
                Text("Bu gün için randevu yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Column {
                    selectedDayAppointments.sortedBy { it.stopOrder ?: 0 }.forEachIndexed { index, appt ->
                        if (index > 0) Divider()
                        val completed = appt.status == "completed"
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { onToggleCompleted(appt) }
                                .padding(vertical = 10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(Modifier.weight(1f)) {
                                Text(
                                    (appt.customerName ?: "(isimsiz)") + if (completed) " ✔" else "",
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis
                                )
                                val techName = technicians.firstOrNull { it.id == appt.assignedTechnicianId }?.name
                                if (techName != null) {
                                    Text(techName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun TodayAppointmentsWidgetCard(upcoming: List<Appointment>, technicians: List<Technician>, count: Int, completed: Int, routed: Int, pending: Int, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(Modifier.width(8.dp))
                Text("Bugünün Randevuları", style = MaterialTheme.typography.titleMedium)
            }
            Text("$count", style = MaterialTheme.typography.displaySmall)
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("✔ $completed tamamlandı", style = MaterialTheme.typography.bodySmall)
                Text("➜ $routed yolda", style = MaterialTheme.typography.bodySmall)
                Text("⏳ $pending bekliyor", style = MaterialTheme.typography.bodySmall)
            }
            UpcomingList(upcoming, technicians)
        }
    }
}

@Composable
fun TomorrowAppointmentsWidgetCard(upcoming: List<Appointment>, technicians: List<Technician>, count: Int, tomorrow: LocalDate, notRouted: Int, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.CalendarMonth, contentDescription = null, tint = Color(0xFF2E7D32))
                Spacer(Modifier.width(8.dp))
                Text("Yarının Randevuları", style = MaterialTheme.typography.titleMedium)
            }
            Text("$count", style = MaterialTheme.typography.displaySmall)
            Text(
                tomorrow.format(DateTimeFormatter.ofPattern("d MMMM yyyy", Locale("tr"))) + " " +
                    tomorrow.dayOfWeek.getDisplayName(TextStyle.FULL, Locale("tr")),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (notRouted > 0) {
                Spacer(Modifier.height(4.dp))
                Text("$notRouted iş henüz rotalanmadı", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
            }
            UpcomingList(upcoming, technicians)
        }
    }
}

@Composable
fun LowStockWidgetCard(items: List<StockItem>, onSeeAll: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Inventory2, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.width(8.dp))
                Text("Az Stoklu Ürünler (${items.size})", style = MaterialTheme.typography.titleMedium)
            }
            if (items.isEmpty()) {
                Text("Az stoklu ürün yok.", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                items.take(6).forEachIndexed { index, item ->
                    if (index > 0) Divider()
                    Row(
                        Modifier.padding(horizontal = 16.dp, vertical = 10.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(item.name ?: item.code ?: "(isimsiz)", Modifier.weight(1f), maxLines = 1, overflow = TextOverflow.Ellipsis)
                        Spacer(Modifier.width(8.dp))
                        Text("${item.quantity ?: 0} ${item.unit ?: "adet"}", color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
                if (items.size > 6) {
                    Divider()
                    TextButton(onClick = onSeeAll, modifier = Modifier.fillMaxWidth()) {
                        Text("Tümünü Gör (${items.size})")
                        Icon(Icons.Filled.ChevronRight, contentDescription = null)
                    }
                }
            }
        }
    }
}

@Composable
fun QuotesWidgetCard(quotes: List<Quote>, onSeeAll: () -> Unit) {
    Card(Modifier.fillMaxWidth()) {
        Column {
            Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Description, contentDescription = null)
                Spacer(Modifier.width(8.dp))
                Text("Fiyat Teklifleri", style = MaterialTheme.typography.titleMedium)
            }
            val recent = quotes.sortedByDescending { it.quoteDate ?: "" }.take(5)
            if (recent.isEmpty()) {
                Text("Henüz teklif oluşturulmadı.", Modifier.padding(horizontal = 16.dp, vertical = 8.dp), color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                recent.forEachIndexed { index, quote ->
                    if (index > 0) Divider()
                    Row(
                        Modifier.clickable { onSeeAll() }.padding(horizontal = 16.dp, vertical = 10.dp).fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(Modifier.weight(1f)) {
                            Text(quote.customerName ?: "(isimsiz)", maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text("${quote.quoteNo ?: "-"} · ${quote.quoteDate ?: "-"}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Text("₺${formatMoneyShort(quoteGrandTotal(quote.items))}", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun OutstandingCheckoutsWidgetCard(checkouts: List<PartCheckout>, technicians: List<Technician>, onSeeAll: () -> Unit) {
    Card(onClick = onSeeAll, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Filled.Warning, contentDescription = null, tint = MaterialTheme.colorScheme.error)
                Spacer(Modifier.width(8.dp))
                Text("Mutabakatı Bekleyen Zimmetler", style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(8.dp))
            if (checkouts.isEmpty()) {
                Text("Bekleyen mutabakat yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                // Teknisyene göre gruplu: aynı kişi alt alta tekrarlanmasın.
                checkouts.groupBy { it.technicianId }.entries
                    .sortedBy { (_, list) -> list.minOf { it.date ?: "" } }
                    .take(6)
                    .forEach { (techId, list) ->
                        val techName = technicians.firstOrNull { it.id == techId }?.name ?: "Bilinmeyen teknisyen"
                        Row(Modifier.fillMaxWidth().padding(vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) {
                                Text(techName, style = MaterialTheme.typography.bodyMedium)
                                Text("En eskisi: ${list.minOf { it.date ?: "-" }}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                            Text(
                                "${list.size} zimmet",
                                style = MaterialTheme.typography.labelMedium,
                                color = MaterialTheme.colorScheme.error,
                                modifier = Modifier.background(MaterialTheme.colorScheme.errorContainer, androidx.compose.foundation.shape.RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 4.dp)
                            )
                        }
                    }
            }
        }
    }
}

/** Widget içindeki sıradaki randevular: teknisyen rengi nokta + müşteri + şikâyet. */
@Composable
private fun UpcomingList(upcoming: List<Appointment>, technicians: List<Technician>) {
    if (upcoming.isEmpty()) return
    Spacer(Modifier.height(8.dp))
    Divider()
    upcoming.forEach { appt ->
        Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).background(technicianColor(appt.assignedTechnicianId, technicians), androidx.compose.foundation.shape.CircleShape))
            Spacer(Modifier.width(8.dp))
            Text(appt.customerName ?: "(isimsiz)", style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
            if (appt.urgency == "acil") {
                Spacer(Modifier.width(6.dp))
                Text("Acil", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.error)
            }
            appt.complaint?.lineSequence()?.firstOrNull()?.takeIf { it.isNotBlank() }?.let {
                Spacer(Modifier.width(6.dp))
                Text("· $it", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f))
            }
        }
    }
}
