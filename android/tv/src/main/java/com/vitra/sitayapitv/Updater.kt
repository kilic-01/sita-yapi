package com.vitra.sitayapitv

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.util.concurrent.TimeUnit

/**
 * Uzaktan güncelleme — yeni sürümler GitHub'daki (kilic-01/sita-yapi, herkese
 * açık) "tv-v<sürüm>" etiketli ön sürümlere APK olarak konur (bkz.
 * scripts/release-tv.sh). Ön sürüm oldukları için masaüstünün otomatik
 * güncellemesi (yalnız "latest" sürüme bakar) bunları görmez.
 *
 * Android, mağaza dışı uygulamaların kendini sessizce güncellemesine izin
 * vermez: bekleme ekranında "Yeni sürüm" yazısı çıkar, kumandada OK'e basınca
 * APK indirilir ve sistemin kurulum onayı açılır (bir kez daha OK).
 */
sealed interface UpdateState {
    data object None : UpdateState
    data class Available(val version: String, val apkUrl: String) : UpdateState
    data class Downloading(val version: String) : UpdateState
    /** Sistemin kurulum onayı ekranda ("Güncelle" seçilip OK). */
    data class Confirming(val version: String) : UpdateState
    /** İptal/hata — OK ile yeniden denenebilir. */
    data class Failed(val message: String, val retry: Available) : UpdateState
}

object Updater {
    private const val RELEASES_URL = "https://api.github.com/repos/kilic-01/sita-yapi/releases?per_page=30"
    private const val TAG_PREFIX = "tv-v"
    private val json = Json { ignoreUnknownKeys = true }
    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()

    private val _state = MutableStateFlow<UpdateState>(UpdateState.None)
    val state: StateFlow<UpdateState> = _state

    /** "1.0.10" > "1.0.9" — sayısal karşılaştırma. */
    internal fun isNewer(candidate: String, current: String): Boolean {
        val a = candidate.split('.').map { it.toIntOrNull() ?: 0 }
        val b = current.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(a.size, b.size)) {
            val x = a.getOrElse(i) { 0 }
            val y = b.getOrElse(i) { 0 }
            if (x != y) return x > y
        }
        return false
    }

    suspend fun check() = withContext(Dispatchers.IO) {
        if (_state.value is UpdateState.Downloading || _state.value is UpdateState.Confirming) return@withContext
        runCatching {
            val request = Request.Builder().url(RELEASES_URL)
                .header("Accept", "application/vnd.github+json")
                .header("User-Agent", "SitaYapiTV/${BuildConfig.VERSION_NAME}")
                .build()
            val body = client.newCall(request).execute().use { res ->
                if (!res.isSuccessful) error("GitHub yanıt vermedi (${res.code})")
                res.body?.string().orEmpty()
            }
            val newest = json.parseToJsonElement(body).jsonArray
                .map { it.jsonObject }
                .filter { it["draft"]?.jsonPrimitive?.contentOrNull != "true" }
                .mapNotNull { release ->
                    val tag = release["tag_name"]?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                    if (!tag.startsWith(TAG_PREFIX)) return@mapNotNull null
                    val apk = (release["assets"]?.jsonArray ?: return@mapNotNull null)
                        .map { it.jsonObject }
                        .firstOrNull { (it["name"]?.jsonPrimitive?.contentOrNull ?: "").endsWith(".apk") }
                        ?.get("browser_download_url")?.jsonPrimitive?.contentOrNull ?: return@mapNotNull null
                    tag.removePrefix(TAG_PREFIX) to apk
                }
                .reduceOrNull { best, next -> if (isNewer(next.first, best.first)) next else best }
            _state.value = if (newest != null && isNewer(newest.first, BuildConfig.VERSION_NAME)) {
                UpdateState.Available(newest.first, newest.second)
            } else {
                UpdateState.None
            }
        }.onFailure { Log.w("SitaTv", "güncelleme kontrolü: ${it.message}") }
    }

    /** OK'e basıldı: APK'yı indirip sistemin kurulum onayını açar. */
    suspend fun install(context: Context) {
        val available = when (val s = _state.value) {
            is UpdateState.Available -> s
            is UpdateState.Failed -> s.retry
            else -> return
        }
        val app = context.applicationContext
        // "Bilinmeyen uygulamaları yükle" izni yoksa ayar sayfası açılır (kurulumda
        // "adb shell appops set com.vitra.sitayapitv REQUEST_INSTALL_PACKAGES allow" ile de verilebilir).
        if (!app.packageManager.canRequestPackageInstalls()) {
            context.startActivity(
                Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${app.packageName}"))
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            )
            return
        }
        lastAttempt = available
        _state.value = UpdateState.Downloading(available.version)
        val result = withContext(Dispatchers.IO) {
            runCatching {
                val installer = app.packageManager.packageInstaller
                val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL)
                    .apply { setAppPackageName(app.packageName) }
                val sessionId = installer.createSession(params)
                installer.openSession(sessionId).use { session ->
                    val request = Request.Builder().url(available.apkUrl)
                        .header("User-Agent", "SitaYapiTV/${BuildConfig.VERSION_NAME}").build()
                    client.newCall(request).execute().use { res ->
                        if (!res.isSuccessful) error("APK indirilemedi (${res.code})")
                        val body = res.body ?: error("APK boş")
                        session.openWrite("sita-yapi-tv.apk", 0, body.contentLength()).use { out ->
                            body.byteStream().copyTo(out)
                            session.fsync(out)
                        }
                    }
                    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
                        (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
                    val callback = PendingIntent.getBroadcast(app, sessionId, Intent(app, InstallReceiver::class.java), flags)
                    session.commit(callback.intentSender)
                }
            }
        }
        result.onFailure {
            Log.w("SitaTv", "güncelleme kurulamadı: ${it.message}")
            _state.value = UpdateState.Failed("Güncelleme indirilemedi", available)
        }
    }

    private var lastAttempt: UpdateState.Available? = null

    internal fun onConfirming() {
        lastAttempt?.let { _state.value = UpdateState.Confirming(it.version) }
    }

    internal fun onInstallFailed(message: String) {
        lastAttempt?.let { _state.value = UpdateState.Failed(message, it) }
    }
}

/** Kurulum oturumunun sonucu: onay gerekiyorsa sistemin onay ekranını açar. */
class InstallReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                @Suppress("DEPRECATION")
                val confirm = intent.getParcelableExtra<Intent>(Intent.EXTRA_INTENT) ?: return
                Updater.onConfirming()
                context.startActivity(confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
            PackageInstaller.STATUS_SUCCESS -> Unit // uygulama yeni sürümle yeniden açılır (MY_PACKAGE_REPLACED)
            PackageInstaller.STATUS_FAILURE_ABORTED -> Updater.onInstallFailed("Güncelleme iptal edildi")
            else -> {
                Log.w("SitaTv", "güncelleme kurulamadı: ${intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE)}")
                Updater.onInstallFailed("Güncelleme kurulamadı")
            }
        }
    }
}
