package com.vitra.sitaservisplanlayici.data

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * iOS'taki StockCache actor'ının karşılığı — ~10 binlik stok listesini bir
 * kez çekip bellekte tutar. Eşzamanlı çağrılar aynı mutex'te sıraya girer;
 * ilk çağrı sunucudan çekip belleğe yazdıktan sonra diğerleri ikinci bir
 * istek atmadan doğrudan önbellekten okur (iOS'taki inFlightTask ile aynı
 * amaç, daha basit bir uygulaması).
 */
object StockCache {
    private val mutex = Mutex()
    private var cached: List<StockItem>? = null

    fun peek(): List<StockItem>? = cached

    suspend fun all(): List<StockItem> {
        cached?.let { return it }
        return mutex.withLock {
            cached?.let { return@withLock it }
            val result = Repository.allStock()
            cached = result
            result
        }
    }

    suspend fun reload(): List<StockItem> = mutex.withLock {
        val result = Repository.allStock()
        cached = result
        result
    }

    suspend fun invalidateQuantity(id: String, newQuantity: Int) {
        mutex.withLock {
            cached = cached?.map { if (it.id == id) it.copy(quantity = newQuantity) else it }
        }
    }

    suspend fun upsert(item: StockItem) {
        mutex.withLock {
            val list = cached ?: return@withLock
            cached = if (list.any { it.id == item.id }) {
                list.map { if (it.id == item.id) item else it }
            } else {
                list + item
            }
        }
    }

    suspend fun remove(id: String) {
        mutex.withLock {
            cached = cached?.filterNot { it.id == id }
        }
    }
}
