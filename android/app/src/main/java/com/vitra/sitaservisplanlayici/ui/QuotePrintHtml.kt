package com.vitra.sitaservisplanlayici.ui

import com.vitra.sitaservisplanlayici.data.Quote
import com.vitra.sitaservisplanlayici.data.QuoteItem
import com.vitra.sitaservisplanlayici.data.computeQuoteTotals
import java.util.Locale

/**
 * Masaüstündeki src/components/QuotePrintView.jsx'in HTML/CSS yapısının
 * birebir Kotlin karşılığı — bir WebView'da gösterilip oradan gerçek
 * yazdırma/PDF paylaşımı tetiklenir (bkz. PrintableWebView.kt). Renkler,
 * kutu/tablo yapısı ve metinler masaüstüyle aynı kalsın diye JSX'teki
 * değerler birebir kopyalandı.
 */
object QuotePrintHtml {
    private const val HEADER_DARKEST = "#3f3f3f"
    private const val HEADER_DARK = "#595959"
    private const val LABEL_BG = "#e9e9e9"
    private const val VALUE_BG = "#ffffff"
    private const val ITEM_NO_COL_BG = "#e9e9e9"
    private const val ITEM_BODY_BG = "#fafafa"
    private const val ITEM_LAST_COL_BG = "#f2f2f2"
    private const val BORDER = "#2d2d2d"

    private val CURRENCY_SYMBOLS = mapOf("TRY" to "₺", "USD" to "$", "EUR" to "€")

    private fun esc(s: String?): String =
        (s ?: "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private fun formatDate(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        val parts = iso.split("-")
        if (parts.size != 3) return iso
        return "${parts[2]}/${parts[1]}/${parts[0]}"
    }

    private fun formatMoney(n: Double): String =
        String.format(Locale("tr", "TR"), "%,.2f", n)

    private fun infoBox(title: String, rows: List<Pair<String, String>>, extraStyle: String = ""): String {
        val rowsHtml = rows.mapIndexed { idx, (label, value) ->
            val borderStyle = if (idx == rows.size - 1) "border-bottom:none;" else "border-bottom:1px solid $BORDER;"
            """
            <div style="display:flex;$borderStyle">
              <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:$LABEL_BG;border-right:1px solid $BORDER;white-space:nowrap;">${esc(label)}</div>
              <div style="flex:1;padding:0.22rem 0.55rem;background:$VALUE_BG;">${esc(value)}</div>
            </div>
            """.trimIndent()
        }.joinToString("")
        return """
        <div style="border:1px solid $BORDER;overflow:hidden;font-size:0.7rem;$extraStyle">
          <div style="background:$HEADER_DARK;color:white;padding:0.28rem 0.55rem;font-weight:700;font-size:0.64rem;letter-spacing:0.02em;white-space:nowrap;border-bottom:1px solid $BORDER;">${esc(title)}</div>
          $rowsHtml
        </div>
        """.trimIndent()
    }

    private fun itemTableRows(items: List<QuoteItem>): String {
        return items.mapIndexed { i, item ->
            val gross = (item.qty ?: 0.0) * (item.unitPrice ?: 0.0)
            val lineTotal = gross * (1 - (item.discountRate ?: 0.0) / 100.0)
            val cell = "padding:0.26rem 0.35rem;border:1px solid $BORDER;background:$ITEM_BODY_BG;"
            val noCell = "padding:0.26rem 0.35rem;border:1px solid $BORDER;background:$ITEM_NO_COL_BG;"
            val lastCell = "padding:0.26rem 0.35rem;border:1px solid $BORDER;background:$ITEM_LAST_COL_BG;"
            """
            <tr>
              <td style="$noCell">${i + 1}</td>
              <td style="$cell">${esc(item.code)}</td>
              <td style="$cell">${esc(item.description)}</td>
              <td style="$cell;text-align:center;">${item.qty ?: ""}</td>
              <td style="$cell;text-align:center;">${esc(item.unit)}</td>
              <td style="$cell;text-align:right;">${formatMoney(item.unitPrice ?: 0.0)}</td>
              <td style="$cell;text-align:center;">%${(item.discountRate ?: 0.0).let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }}</td>
              <td style="$cell;text-align:center;">%${(item.vatRate ?: 0.0).let { if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString() }}</td>
              <td style="$lastCell;text-align:right;">${formatMoney(lineTotal)}</td>
            </tr>
            """.trimIndent()
        }.joinToString("")
    }

    fun render(quote: Quote): String {
        val totals = computeQuoteTotals(quote.items)
        val currency = quote.currency ?: "TRY"
        val currencySymbol = CURRENCY_SYMBOLS[currency] ?: currency
        val headCell = "padding:0.26rem 0.35rem;border:1px solid $BORDER;background:$HEADER_DARKEST;white-space:nowrap;font-size:0.66rem;color:white;"

        val customerBox = infoBox(
            "MÜŞTERİ BİLGİLERİ",
            listOf(
                "Firma / Kişi" to (quote.customerName ?: ""),
                "Yetkili" to (quote.contactName ?: ""),
                "Telefon" to (quote.customerPhone ?: ""),
                "E-posta" to (quote.customerEmail ?: ""),
                "Adres" to (quote.customerAddress ?: "")
            ),
            "flex:1;"
        )
        val quoteBox = infoBox(
            "TEKLİF BİLGİLERİ",
            listOf(
                "Teklif No" to (quote.quoteNo ?: ""),
                "Tarih" to formatDate(quote.quoteDate),
                "Geçerlilik" to "${quote.validityDays ?: 0} gün",
                "Hazırlayan" to (quote.preparedBy ?: ""),
                "Para Birimi" to "$currency ($currencySymbol)"
            ),
            "flex:1;"
        )

        val termsBox = infoBox(
            "TEKLİF ŞARTLARI",
            listOf(
                "Ödeme" to (quote.paymentTerms ?: ""),
                "Garanti" to (quote.warranty ?: ""),
                "Açıklama" to (quote.notes ?: ""),
                "IBAN" to (quote.iban ?: "")
            ),
            "flex:1.4;height:fit-content;"
        )

        val discountRateDisplay = (quote.discountRate ?: 0.0).let {
            if (it == it.toLong().toDouble()) it.toLong().toString() else it.toString()
        }
        val totalsRows = listOf(
            "Ara Toplam" to formatMoney(totals.araToplam),
            "İndirim Oranı" to "%$discountRateDisplay",
            "İndirim Tutarı" to formatMoney(totals.indirimTutari),
            "KDV Matrahı" to formatMoney(totals.kdvMatrahi),
            "KDV Toplamı" to formatMoney(totals.kdvToplami)
        ).joinToString("") { (label, value) ->
            """
            <div style="display:flex;border-bottom:1px solid $BORDER;">
              <div style="width:40%;padding:0.22rem 0.55rem;font-weight:600;background:$LABEL_BG;border-right:1px solid $BORDER;white-space:nowrap;">${esc(label)}</div>
              <div style="flex:1;padding:0.22rem 0.55rem;background:$VALUE_BG;text-align:right;">${esc(value)}</div>
            </div>
            """.trimIndent()
        }

        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin:0; font-family: 'Inter', -apple-system, sans-serif; background:#ffffff; color:#1a1a1a; }
          .print-page { padding:15mm; }
          table { border-collapse: collapse; }
        </style>
        </head>
        <body>
          <div class="print-page">
            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid $HEADER_DARK;padding-bottom:0.3rem;margin-bottom:0.6rem;">
              <img src="data:image/svg+xml;base64,${BrandLogo.BASE64}" alt="Sita Yapı" style="width:245px;height:auto;display:block;margin-left:-4px;" />
              <h2 style="font-weight:400;color:$HEADER_DARK;font-size:1.3rem;margin:0;">Fiyat Teklifi</h2>
            </div>

            <div style="display:flex;gap:1rem;margin-bottom:0.7rem;">
              $customerBox
              $quoteBox
            </div>

            <div style="border:1px solid $BORDER;overflow:hidden;margin-bottom:0.75rem;">
              <table style="width:100%;font-size:0.68rem;">
                <colgroup>
                  <col style="width:4%" /><col style="width:12%" /><col style="width:27%" />
                  <col style="width:7%" /><col style="width:7%" /><col style="width:12%" />
                  <col style="width:10%" /><col style="width:8%" /><col style="width:13%" />
                </colgroup>
                <thead>
                  <tr style="background:$HEADER_DARKEST;color:white;">
                    <th style="$headCell;text-align:left;">No</th>
                    <th style="$headCell;text-align:left;">Ürün/Kod</th>
                    <th style="$headCell;text-align:left;">Açıklama</th>
                    <th style="$headCell;text-align:center;">Miktar</th>
                    <th style="$headCell;text-align:center;">Birim</th>
                    <th style="$headCell;text-align:right;">Birim Fiyat</th>
                    <th style="$headCell;text-align:center;">İskonto (%)</th>
                    <th style="$headCell;text-align:center;">KDV (%)</th>
                    <th style="$headCell;text-align:right;">Tutar</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemTableRows(quote.items)}
                </tbody>
              </table>
            </div>

            <div style="display:flex;gap:1rem;">
              $termsBox
              <div style="flex:1;border:1px solid $BORDER;overflow:hidden;font-size:0.7rem;height:fit-content;">
                $totalsRows
                <div style="display:flex;color:white;font-weight:700;font-size:0.76rem;">
                  <div style="width:40%;background:$HEADER_DARKEST;padding:0.28rem 0.55rem;white-space:nowrap;border-right:1px solid $BORDER;">GENEL TOPLAM</div>
                  <div style="background:$HEADER_DARK;flex:1;padding:0.28rem 0.55rem;text-align:right;">${formatMoney(totals.genelToplam)} $currency</div>
                </div>
              </div>
            </div>

            <div style="text-align:center;font-size:0.64rem;opacity:0.65;margin-top:1rem;line-height:1.5;">
              <div>Zeytinoğlu Cad. Beyaz köşk Apt. No:67 80630 Akatlar - Beşiktaş / İstanbul</div>
              <div>0 (212) 351 76 33 - 0 (212) 351 76 88</div>
              <div>info@sitayapi.com - www.sitayapi.com</div>
            </div>
          </div>
        </body>
        </html>
        """.trimIndent()
    }
}
