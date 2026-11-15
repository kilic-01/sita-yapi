package com.vitra.sitaservisplanlayici.ui

import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material.icons.filled.Done
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.data.ChatMessage
import com.vitra.sitaservisplanlayici.data.Repository
import com.vitra.sitaservisplanlayici.ui.more.SimpleScreenScaffold
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

@Composable
fun ChatScreen(appState: AppState, contactId: String, contactName: String, navController: NavController) {
    val myId = appState.currentUser?.id.orEmpty()
    var messages by remember { mutableStateOf<List<ChatMessage>>(emptyList()) }
    var draft by remember { mutableStateOf("") }
    var isSending by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()
    val listState = rememberLazyListState()

    suspend fun load() {
        try {
            Repository.markRead(myId, contactId)
            val all = Repository.messages(myId)
            messages = all.filter {
                (it.senderId == contactId && it.recipientId == myId) || (it.senderId == myId && it.recipientId == contactId)
            }
            error = null
        } catch (e: Exception) {
            if (messages.isEmpty()) error = "Sohbet yüklenemedi: ${e.message}"
        }
    }

    LaunchedEffect(contactId) {
        while (true) {
            load()
            delay(4000)
        }
    }

    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    SimpleScreenScaffold(title = contactName, navController = navController) { padding ->
    Column(padding.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 12.dp),
            // DİKKAT: mesaj sayısı az olduğunda weight(1f) ile ayrılan alanın
            // KULLANILMAYAN kısmı, varsayılan Arrangement.spacedBy(8.dp) ile
            // listenin EN ÜSTÜNDE boşluk olarak kalıyor — mesaj kutusunun
            // (input Row) hemen ÜZERİNDE "anlamsız" bir boşluk gibi
            // görünüyordu. Alignment.Bottom ile mesajlar her zaman alta,
            // mesaj kutusuna yakın yaslanır; boş alan varsa EN ÜSTTE kalır.
            verticalArrangement = Arrangement.spacedBy(8.dp, Alignment.Bottom)
        ) {
            items(messages, key = { it.id }) { message ->
                val mine = message.senderId == myId
                Row(Modifier.fillMaxWidth(), horizontalArrangement = if (mine) Arrangement.End else Arrangement.Start) {
                    Box(
                        Modifier
                            .background(
                                if (mine) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
                                RoundedCornerShape(16.dp)
                            )
                            .padding(horizontal = 14.dp, vertical = 9.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.End) {
                            Text(message.body, color = if (mine) Color.White else MaterialTheme.colorScheme.onSurfaceVariant)
                            // Saat + (benim mesajımsa) okundu bilgisi: tek tik gönderildi,
                            // yeşil çift tik okundu — masaüstündeki MessagesDock ile aynı.
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                val meta = if (mine) Color.White.copy(alpha = 0.75f) else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                                Text(chatTime(message.createdAt), style = MaterialTheme.typography.labelSmall, color = meta)
                                if (mine) {
                                    Spacer(Modifier.width(3.dp))
                                    if (message.readAt != null) {
                                        Icon(androidx.compose.material.icons.Icons.Filled.DoneAll, contentDescription = "Okundu", tint = Color(0xFF8CF5A8), modifier = Modifier.size(15.dp))
                                    } else {
                                        Icon(androidx.compose.material.icons.Icons.Filled.Done, contentDescription = "Gönderildi", tint = meta, modifier = Modifier.size(15.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (error != null) {
            Text(error!!, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 16.dp))
        }
        Row(
            Modifier.fillMaxWidth().padding(10.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                placeholder = { Text("Mesaj yazın...") },
                modifier = Modifier.weight(1f)
            )
            Spacer(Modifier.width(8.dp))
            IconButton(
                onClick = {
                    val body = draft.trim()
                    if (body.isEmpty()) return@IconButton
                    isSending = true
                    scope.launch {
                        try {
                            Repository.sendMessage(myId, contactId, body)
                            draft = ""
                            load()
                        } catch (e: Exception) {
                            error = e.message ?: "Gönderilemedi."
                        } finally {
                            isSending = false
                        }
                    }
                },
                enabled = draft.isNotBlank() && !isSending
            ) {
                if (isSending) CircularProgressIndicator(modifier = Modifier.width(20.dp)) else Icon(Icons.Filled.ArrowUpward, contentDescription = "Gönder")
            }
        }
    }
    }
}

/** ISO zaman damgası → yerel saat "HH:mm". */
private fun chatTime(iso: String?): String = runCatching {
    com.vitra.sitaservisplanlayici.data.serverTimeLocal(iso)!!.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))
}.getOrDefault("")
