package com.vitra.sitaservisplanlayici.data

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * StockCache ile aynı amaç: tarih başına randevu listesini bellekte tutar.
 * HomeScreen her sekme değişiminde (navigasyon artık ekranı sıfırdan
 * oluşturduğu için — bkz. RootApp.kt'deki sekme geçişi düzeltmesi) baştan
 * 10'dan fazla tarih için paralel istek atıyordu; bu da her sekme geçişinde
 * gözle görülür bir bekleme yaratıyordu. Artık ekranlar ÖNCE önbellekteki
 * (varsa) veriyi anında gösterip ardından arkaplanda sessizce tazeliyor
 * ("stale-while-revalidate") — ilk açılış hâlâ ağ isteği gerektirir, ama
 * tekrar ziyaretlerde bekleme hissi olmaz.
 */
object AppointmentsCache {
    // forDate() doğrudan önbellekten dönüyor (stale-while-revalidate yapmayan
    // tek çağıran: Zimmet yazdırma) — süresiz tutulunca başka bir kullanıcının
    // yaptığı değişiklikler hiç görünmüyordu. 60 sn'den eski kayıt tazelenir.
    private const val MAX_AGE_MS = 60_000L

    private class Entry(val list: List<Appointment>, val fetchedAt: Long)

    private val mutex = Mutex()
    // invalidate()/peek() kilitsiz (UI thread'inden) çağrılıyor, forDate()
    // ise IO'dan — düz HashMap eşzamanlı erişimde bozulabilirdi.
    private val cached = java.util.concurrent.ConcurrentHashMap<String, Entry>()

    fun peek(date: String): List<Appointment>? = cached[date]?.list

    private fun fresh(date: String): List<Appointment>? =
        cached[date]?.takeIf { System.currentTimeMillis() - it.fetchedAt < MAX_AGE_MS }?.list

    suspend fun forDate(date: String): List<Appointment> {
        fresh(date)?.let { return it }
        return mutex.withLock {
            fresh(date)?.let { return@withLock it }
            val result = Repository.appointmentsByDate(date)
            cached[date] = Entry(result, System.currentTimeMillis())
            result
        }
    }

    suspend fun refresh(date: String): List<Appointment> {
        val result = Repository.appointmentsByDate(date)
        cached[date] = Entry(result, System.currentTimeMillis())
        return result
    }

    fun invalidate(date: String) {
        cached.remove(date)
    }
}
