package com.vitra.sitaservisplanlayici

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.fragment.app.FragmentActivity
import com.vitra.sitaservisplanlayici.data.ApiClient
import com.vitra.sitaservisplanlayici.data.AppState
import com.vitra.sitaservisplanlayici.ui.RootApp
import com.vitra.sitaservisplanlayici.ui.theme.SitaYapiTheme

/**
 * iOS'taki RootView/App.swift'in Android karşılığı — Capacitor'ın WebView
 * kabuğu yerine tamamen native Jetpack Compose arayüzü başlatır.
 *
 * ComponentActivity değil FragmentActivity'den türetiliyor — BiometricPrompt
 * (Face ID/parmak izi kilidi, bkz. data/AppLockState.kt) bunu şart koşuyor;
 * FragmentActivity zaten ComponentActivity'nin bir alt sınıfı olduğu için
 * setContent {} ve Compose entegrasyonu değişmeden çalışmaya devam ediyor.
 */
class MainActivity : FragmentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // installSplashScreen() super.onCreate()'ten ÖNCE çağrılmalı — aksi
        // halde aktivite styles.xml'deki Theme.SplashScreen'de sonsuza kadar
        // takılı kalıyor (gerçek uygulama temasına hiç geçmiyor). Bunun
        // eksikliği, üst çubukta uygulama simgesinin yatay gerilmiş/bozulmuş
        // görünmesine ve başlığın kesilmesine sebep oluyordu.
        installSplashScreen()
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        ApiClient.init(applicationContext)
        val appState = AppState(applicationContext)
        setContent {
            SitaYapiTheme {
                RootApp(appState = appState)
            }
        }
    }
}
