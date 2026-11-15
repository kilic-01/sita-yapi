package com.vitra.sitaservisplanlayici.data

/**
 * `String.toDoubleOrNull()` yalnızca nokta (".") ondalık ayırıcıyı kabul
 * eder — Türkçe klavyede kullanıcı virgül ("12,5") yazdığında sessizce
 * null/0.0 döner. Bu, satış satırının hiç fark edilmeden listeden düşmesine
 * ya da mevcut bir stok fiyatının null'a sıfırlanmasına (veri kaybı) yol
 * açıyordu — bkz. QuickSaleScreen/StockCreateScreen/StockDetailScreen.
 */
fun String.toLocaleDoubleOrNull(): Double? = replace(",", ".").toDoubleOrNull()
