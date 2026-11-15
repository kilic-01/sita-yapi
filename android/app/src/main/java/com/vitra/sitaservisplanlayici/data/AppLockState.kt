package com.vitra.sitaservisplanlayici.data

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity

/**
 * iOS'taki AppLock.swift'teki AppLockState'in karşılığı — Face ID yerine
 * Android'in BiometricPrompt'u (parmak izi / yüz tanıma, cihaza göre)
 * kullanıyor. "isEnabled" kalıcı bir tercih (SharedPreferences); "isUnlocked"
 * sadece bu oturum için geçerli ve uygulama arka plana her gittiğinde
 * sıfırlanır (bkz. RootApp.kt'deki ON_STOP gözlemcisi).
 */
class AppLockState(private val context: Context) {
    private val prefs = context.getSharedPreferences("sita-yapi-app-lock", Context.MODE_PRIVATE)

    var isEnabled by mutableStateOf(prefs.getBoolean("enabled", false))
        private set

    var isUnlocked by mutableStateOf(!isEnabled)
        private set

    // Biyometriye ek olarak cihaz PIN/desen/şifresi de kabul ediliyor —
    // aksi halde kilit açıkken kullanıcı parmak izini silerse (ya da sensör
    // art arda hatadan kilitlenirse) BiometricPrompt hep hata verip uygulamaya
    // bir daha HİÇ girilemiyordu.
    private val authenticators =
        BiometricManager.Authenticators.BIOMETRIC_WEAK or BiometricManager.Authenticators.DEVICE_CREDENTIAL

    val canUseBiometrics: Boolean
        get() = BiometricManager.from(context).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS

    // Kotlin "var isEnabled" zaten JVM'de "setEnabled(boolean)" ürettiği için
    // (is-önekli Boolean property kuralı) bu fonksiyon farklı adlandırıldı,
    // aksi halde imza çakışması derlemeyi bozuyordu.
    fun setLockEnabled(value: Boolean) {
        isEnabled = value
        prefs.edit().putBoolean("enabled", value).apply()
        if (!value) isUnlocked = true
    }

    fun lock() {
        if (isEnabled) isUnlocked = false
    }

    fun authenticate(activity: FragmentActivity, onResult: (Boolean) -> Unit) {
        if (!canUseBiometrics) {
            // Cihazda artık hiç ekran kilidi yok (biyometri de PIN de) — korunacak
            // bir kimlik kalmadığı için kullanıcıyı dışarıda bırakmak yerine
            // kilidi kapatıyoruz; Diğer ekranından tekrar açılabilir.
            setLockEnabled(false)
            onResult(true)
            return
        }
        val executor = ContextCompat.getMainExecutor(activity)
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Sita Yapı")
            .setSubtitle("Devam etmek için kimliğinizi doğrulayın")
            // DEVICE_CREDENTIAL ile birlikte setNegativeButtonText KULLANILAMAZ
            // (BiometricPrompt IllegalArgumentException fırlatır).
            .setAllowedAuthenticators(authenticators)
            .build()
        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    isUnlocked = true
                    onResult(true)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onResult(false)
                }

                override fun onAuthenticationFailed() {
                    // Kullanıcı tekrar deneyebilir — prompt kendiliğinden kapanmıyor.
                }
            }
        )
        prompt.authenticate(promptInfo)
    }
}
