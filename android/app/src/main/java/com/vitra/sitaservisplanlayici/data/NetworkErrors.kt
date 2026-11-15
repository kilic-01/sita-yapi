package com.vitra.sitaservisplanlayici.data

import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Ekranlardaki `catch (e: Exception) { error = "... ${e.message}" }` deseni
 * ham/İngilizce exception metnini (ör. "Unable to resolve host") direkt
 * kullanıcıya gösteriyordu — bu, ApiException (sunucunun Türkçe mesajı) ve
 * ağ bağlantısı hatalarını (Türkçe'ye çevrilmesi gereken) ayırt eder.
 */
fun Throwable.toUserMessage(): String = when {
    this is ApiException -> message ?: "Bir hata oluştu, lütfen tekrar deneyin."
    this is UnknownHostException || this is SocketTimeoutException || this is IOException ->
        "İnternet bağlantınızı kontrol edin."
    else -> "Bir hata oluştu, lütfen tekrar deneyin."
}
