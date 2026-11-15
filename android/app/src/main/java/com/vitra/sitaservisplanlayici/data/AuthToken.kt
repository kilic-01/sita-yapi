package com.vitra.sitaservisplanlayici.data

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Sunucunun girişte verdiği oturum anahtarı (iOS'taki Keychain'li AuthToken'ın
 * karşılığı). Düz metin saklanmaz: Android Keystore'da üretilen, cihazdan
 * dışarı çıkarılamayan bir AES-GCM anahtarıyla şifrelenip SharedPreferences'a
 * yazılır. Uygulama yedeği (allowBackup) başka cihaza taşınsa bile şifreli
 * kopya orada çözülemez; kullanıcı yeniden giriş yapar.
 */
object AuthToken {
    private const val KEY_ALIAS = "sita_api_session_key"
    private const val PREFS = "sita-yapi-auth"
    private const val PREF_TOKEN = "token_enc"
    private const val TRANSFORMATION = "AES/GCM/NoPadding"

    private var prefs: SharedPreferences? = null
    @Volatile private var cached: String? = null

    fun init(context: Context) {
        if (prefs == null) prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    }

    val value: String?
        get() {
            cached?.let { return it }
            val stored = prefs?.getString(PREF_TOKEN, null) ?: return null
            return runCatching { decrypt(stored) }.getOrNull()?.also { cached = it }
                ?: run { clear(); null } // anahtar kaybolmuş/bozuk: yeniden giriş gerekir
        }

    fun save(token: String) {
        val enc = encrypt(token)
        prefs?.edit()?.putString(PREF_TOKEN, enc)?.apply()
        cached = token
    }

    fun clear() {
        prefs?.edit()?.remove(PREF_TOKEN)?.apply()
        cached = null
    }

    private fun secretKey(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    /** "base64(iv):base64(şifreli)" */
    private fun encrypt(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
    }

    private fun decrypt(stored: String): String {
        val (ivB64, ctB64) = stored.split(":", limit = 2)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)))
        return String(cipher.doFinal(Base64.decode(ctB64, Base64.NO_WRAP)), Charsets.UTF_8)
    }
}
