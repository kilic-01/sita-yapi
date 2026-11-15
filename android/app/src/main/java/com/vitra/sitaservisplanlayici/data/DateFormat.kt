package com.vitra.sitaservisplanlayici.data

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Uygulamanın her yerinde tarih GG/AA/YYYY (ör. 09/11/2026) gösterilir.
 * iOS'taki DateFormat.swift ile aynı kurallar.
 */
val TR_DATE: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy")
val TR_DATE_TIME: DateTimeFormatter = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")

fun LocalDate.trDate(): String = format(TR_DATE)

/**
 * Sunucudan gelen tarih metni → "dd/MM/yyyy".
 * "2026-11-09", "2026-11-09T10:15:00Z" ya da "2026-11-09 10:15" kabul edilir;
 * tanınmayan metin olduğu gibi, boşsa [empty] döner.
 */
fun trDate(raw: String?, empty: String = "—"): String {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return empty
    return runCatching { LocalDate.parse(s.take(10)).format(TR_DATE) }.getOrDefault(s)
}

/**
 * Sunucunun zaman damgası → Instant. Supabase "2026-11-15T20:44:41.274+00:00"
 * gönderir; Android 8–11'deki Instant.parse yalnız "Z" sonekini kabul ettiği için
 * bu biçimi okuyamıyordu (mesaj saatleri boş, aktivite tarihleri ham görünüyordu).
 * Önce saat dilimli (OffsetDateTime), olmazsa "Z"li biçim denenir.
 */
fun parseServerInstant(raw: String?): Instant? {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return null
    return runCatching { java.time.OffsetDateTime.parse(s).toInstant() }.getOrNull()
        ?: runCatching { Instant.parse(s) }.getOrNull()
}

/** Sunucu zaman damgası → telefonun saat diliminde ZonedDateTime. */
fun serverTimeLocal(raw: String?): java.time.ZonedDateTime? = parseServerInstant(raw)?.atZone(ZoneId.systemDefault())

/** ISO zaman damgası → yerel saatle "dd/MM/yyyy HH:mm". */
fun trDateTime(raw: String?, empty: String = "—"): String {
    val s = raw?.trim().orEmpty()
    if (s.isEmpty()) return empty
    return serverTimeLocal(s)?.format(TR_DATE_TIME) ?: s
}
