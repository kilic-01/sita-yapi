package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.AppUser
import com.vitra.sitaservisplanlayici.data.ChatMessage
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.data.decodeDataUrlBitmap
import kotlinx.coroutines.delay

@Composable
fun MessagesScreen(appState: AppState, navController: NavController) {
    val myId = appState.currentUser?.id
    var contacts by remember { mutableStateOf<List<AppUser>>(emptyList()) }
    var unread by remember { mutableStateOf<Map<String, Int>>(emptyMap()) }
    // Kişi başına son mesaj — satırda önizleme ve saat (WhatsApp benzeri).
    var lastMessages by remember { mutableStateOf<Map<String, com.vitra.sitaservisplanlayici.data.ChatMessage>>(emptyMap()) }
    var isLoading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf<String?>(null) }

    // iOS'taki gibi sekme açıkken periyodik olarak sessizce yeniliyoruz
    // (gerçek zamanlı bir bağlantı yok).
    LaunchedEffect(Unit) {
        while (true) {
            try {
                if (myId != null) {
                    val users = Repository.listUsers()
                    val messages = Repository.messages(myId)
                    // En son mesajın zamanını, sohbetin iki tarafından da
                    // (gönderen/alan) bakarak kişi id'sine göre topluyoruz —
                    // en yeni sohbet en üstte.
                    val lastMessageAt = mutableMapOf<String, String>()
                    val last = mutableMapOf<String, com.vitra.sitaservisplanlayici.data.ChatMessage>()
                    for (m in messages) {
                        val otherId = when {
                            m.senderId == myId -> m.recipientId
                            m.recipientId == myId -> m.senderId
                            else -> null
                        }
                        val createdAt = m.createdAt
                        if (otherId != null && createdAt != null && createdAt > (lastMessageAt[otherId] ?: "")) {
                            lastMessageAt[otherId] = createdAt
                            last[otherId] = m
                        }
                    }
                    lastMessages = last
                    contacts = users.filter { it.id != myId }
                        .sortedByDescending { lastMessageAt[it.id] ?: "" }
                    unread = messages.filter { it.senderId != myId && it.recipientId == myId && it.readAt == null }
                        .groupingBy { it.senderId }.eachCount()
                }
                error = null
            } catch (e: Exception) {
                if (isLoading) error = "Kişiler yüklenemedi: ${e.message}"
            } finally {
                isLoading = false
            }
            delay(8000)
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Mesajlar", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(8.dp))
        when {
            isLoading -> CircularProgressIndicator()
            error != null -> Text(error!!, color = MaterialTheme.colorScheme.error)
            contacts.isEmpty() -> Text("Mesajlaşılacak kimse yok.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            else -> LazyColumn {
                items(contacts, key = { it.id }) { contact ->
                    Card(
                        Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                            .clickable { navController.navigate(chatRoute(contact.id, contact.name)) }
                    ) {
                        Row(
                            Modifier.padding(12.dp).fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            val photoBitmap = remember(contact.photo) { decodeDataUrlBitmap(contact.photo) }
                            if (photoBitmap != null) {
                                androidx.compose.foundation.Image(
                                    bitmap = photoBitmap.asImageBitmap(),
                                    contentDescription = contact.name,
                                    modifier = Modifier.size(38.dp).clip(CircleShape)
                                )
                            } else {
                                Box(
                                    Modifier.size(38.dp).clip(CircleShape).background(MaterialTheme.colorScheme.primary),
                                    contentAlignment = Alignment.Center
                                ) {
                                    Text(contact.name.firstOrNull()?.toString() ?: "?", color = Color.White)
                                }
                            }
                            Spacer(Modifier.width(12.dp))
                            val count = unread[contact.id] ?: 0
                            val lastMsg = lastMessages[contact.id]
                            Column(Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Text(
                                        contact.name,
                                        fontWeight = if (count > 0) androidx.compose.ui.text.font.FontWeight.SemiBold else null,
                                        modifier = Modifier.weight(1f)
                                    )
                                    if (lastMsg != null) {
                                        Text(
                                            messageTimeLabel(lastMsg.createdAt),
                                            style = MaterialTheme.typography.bodySmall,
                                            color = if (count > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }
                                }
                                if (lastMsg != null) {
                                    Text(
                                        (if (lastMsg.senderId == myId) "Sen: " else "") + lastMsg.body,
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = if (count > 0) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                                        maxLines = 1,
                                        overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis
                                    )
                                }
                            }
                            if (count > 0) {
                                Spacer(Modifier.width(8.dp))
                                Box(
                                    Modifier.clip(CircleShape).background(MaterialTheme.colorScheme.error).padding(horizontal = 8.dp, vertical = 2.dp)
                                ) {
                                    Text("$count", color = Color.White, style = MaterialTheme.typography.labelSmall)
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

/** Mesaj listesindeki saat: bugün "14:05", dün "Dün", bu hafta gün adı, daha eski "3 Kas". */
fun messageTimeLabel(iso: String?): String = runCatching {
    val tr = java.util.Locale("tr")
    val time = com.vitra.sitaservisplanlayici.data.serverTimeLocal(iso)!!
    val days = java.time.temporal.ChronoUnit.DAYS.between(time.toLocalDate(), java.time.LocalDate.now())
    when {
        days == 0L -> time.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
        days == 1L -> "Dün"
        days < 7 -> time.format(java.time.format.DateTimeFormatter.ofPattern("EEEE", tr))
        else -> time.format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy", tr))
    }
}.getOrDefault("")
