package com.vitra.sitaservisplanlayici.data

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.vitra.sitaservisplanlayici.MainActivity
import com.vitra.sitaservisplanlayici.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

private const val CHANNEL_ID = "messages"

/**
 * iOS'taki AppDelegate'in APNs token kaydı ile aynı görevi görür — google-
 * services.json eklenip plugin etkinleşmeden bu sınıfın hiçbir metodu
 * (onNewToken/onMessageReceived) ASLA tetiklenmez, FCM kayıt bile olmaz.
 * Push bildirimi sadece mesajlaşmada kullanılıyor (bkz. electron/handlers.js
 * notifyUserPush) — teknisyenlerin giriş hesabı yok.
 */
class FcmService : FirebaseMessagingService() {
    override fun onNewToken(token: String) {
        super.onNewToken(token)
        // Bu servis MainActivity hiç açılmadan (süreç FCM tarafından
        // başlatılınca) çalışabilir — kayıtlı sunucu adresini okuyabilmek için.
        ApiClient.init(applicationContext)
        AuthToken.init(applicationContext) // servis uygulama açılmadan başlayabilir; istek anahtarlı gitsin
        val userId = SessionHolder.userId ?: return
        CoroutineScope(Dispatchers.IO).launch {
            try {
                Repository.registerDeviceToken(userId, token, "android", userId)
            } catch (_: Exception) {
                // Token kaydı başarısız olsa bile uygulama normal çalışmaya devam
                // etmeli — bir sonraki token yenilemesinde tekrar denenir.
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: "Yeni mesaj"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        showNotification(title, body, message.data)
    }

    private fun showNotification(title: String, body: String, data: Map<String, String> = emptyMap()) {
        val manager = getSystemService(NotificationManager::class.java)
        ensureMessageChannel(this)
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            // Basılınca doğrudan gönderenle olan sohbet açılsın (bkz. AppState.handleNotificationIntent).
            data.forEach { (k, v) -> putExtra(k, v) }
        }
        val pendingIntent = PendingIntent.getActivity(
            this, (data["senderId"] ?: "").hashCode(), intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_notification)
            .setColor(getColor(R.color.notification_accent))
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()
        manager.notify(System.currentTimeMillis().toInt(), notification)
    }
}

/** "Mesajlar" bildirim kanalı (varsa dokunmaz). MainActivity açılışında ve bildirim gösterirken çağrılır. */
fun ensureMessageChannel(context: android.content.Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val manager = context.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(CHANNEL_ID, "Mesajlar", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Uygulama içi mesajlar"
        }
        manager.createNotificationChannel(channel)
    }
}
