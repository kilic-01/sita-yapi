package com.vitra.sitaservisplanlayici.ui

import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.PartCheckout
import com.vitra.sitaservisplanlayici.data.StockItem
import com.vitra.sitaservisplanlayici.data.Technician

/** Bir zimmet yazdırma grubu — src/components/PartCheckoutsPage.jsx'teki printGroups ile aynı şekil. */
data class CheckoutPrintGroup(
    val groupKey: String,
    val technicians: List<Technician>,
    val rows: List<CheckoutPrintRow>
)

data class CheckoutPrintRow(
    val checkout: PartCheckout,
    val stock: StockItem?,
    val appointment: Appointment?
)

/**
 * Masaüstündeki src/components/PartCheckoutsPrintView.jsx'in HTML/CSS
 * yapısının birebir Kotlin karşılığı. "thead her fiziksel sayfada tekrar
 * eder" tablo sarmalayıcısı (logo/başlık her sayfada tekrarlansın diye)
 * masaüstüyle aynı mekanizma kullanılarak korunuyor.
 */
object PartCheckoutsPrintHtml {
    private fun esc(s: String?): String =
        (s ?: "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private fun formatDateTR(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        val parts = iso.split("-")
        if (parts.size != 3) return iso
        return "${parts[2]}.${parts[1]}.${parts[0]}"
    }

    private fun reconcileSummary(checkout: PartCheckout, appointment: Appointment?): String? {
        if (checkout.status != "reconciled") return "Mutabakat bekleniyor"
        val parts = mutableListOf<String>()
        if ((checkout.qtyUsed ?: 0) > 0) {
            parts += if (appointment != null) "Kullanıldı: (${appointment.customerName ?: ""})" else "Kullanıldı: ${checkout.qtyUsed}"
        }
        if ((checkout.qtyReturned ?: 0) > 0) parts += "İade: ${checkout.qtyReturned}"
        if ((checkout.qtyStoredInVehicle ?: 0) > 0) parts += "Arabada: ${checkout.qtyStoredInVehicle}"
        return if (parts.isNotEmpty()) parts.joinToString("  ·  ") else null
    }

    fun render(dateIso: String, groups: List<CheckoutPrintGroup>): String {
        val bodyHtml = if (groups.isEmpty()) {
            "<p>Bu tarih için zimmet yok.</p>"
        } else {
            groups.joinToString("") { group ->
                val techLabel = if (group.technicians.isNotEmpty()) {
                    esc(group.technicians.joinToString(", ") { it.name })
                } else "Bilinmeyen teknisyen"

                val itemsHtml = group.rows.joinToString("") { row ->
                    val checkout = row.checkout
                    val stock = row.stock
                    val summary = reconcileSummary(checkout, row.appointment)
                    val isPending = checkout.status != "reconciled"
                    val summaryHtml = if (summary != null) {
                        val cls = if (isPending) "checkout-print-item-summary pending" else "checkout-print-item-summary"
                        """<div class="$cls">${esc(summary)}</div>"""
                    } else ""
                    val itemName = if (stock != null) "${esc(stock.code)} — ${esc(stock.name)}" else "Bilinmeyen ürün"
                    """
                    <div class="checkout-print-item">
                      <div class="checkout-print-item-main">
                        <span class="checkout-print-item-qty">${checkout.qtyTaken ?: 0} ${esc(stock?.unit ?: "adet")}</span>
                        <span class="checkout-print-item-name">$itemName</span>
                      </div>
                      $summaryHtml
                    </div>
                    """.trimIndent()
                }

                """
                <div class="checkout-print-group">
                  <div class="checkout-print-tech">
                    <span>$techLabel</span>
                    <span class="checkout-print-tech-count">${group.rows.size} kalem</span>
                  </div>
                  $itemsHtml
                </div>
                """.trimIndent()
            }
        }

        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin:0; font-family:'Inter', -apple-system, sans-serif; background:#fff; color:#1a1a1a; }
          .print-page { padding:15mm; }
          .print-header { display:flex; align-items:center; gap:0.6rem; border-bottom:2px solid #0e2a3b; padding-bottom:0.3rem; margin-bottom:0.4rem; }
          .print-header img { height:30px; }
          .print-header h2 { margin:0; font-size:1.2rem; color:#0e2a3b; }
          .print-header > div > div { font-size:0.75rem; }
          .checkout-print-page-table { width:100%; border-collapse:collapse; }
          .checkout-print-page-table td { padding:0; border:none; }
          .checkout-print-group { margin-bottom:1rem; }
          .checkout-print-tech { display:flex; align-items:baseline; justify-content:space-between; gap:0.5rem; font-weight:700; font-size:0.95rem; border-bottom:1px solid #1a1a1a; padding-bottom:0.15rem; margin-bottom:0.3rem; }
          .checkout-print-tech-count { font-weight:400; font-size:0.75rem; color:#666; }
          .checkout-print-item { padding:0.25rem 0; border-bottom:0.5px solid #ddd; }
          .checkout-print-item-main { display:flex; align-items:baseline; gap:0.6rem; }
          .checkout-print-item-name { font-size:0.85rem; }
          .checkout-print-item-qty { flex-shrink:0; font-size:0.82rem; font-weight:700; white-space:nowrap; min-width:3.5rem; }
          .checkout-print-item-summary { margin-top:0.1rem; font-size:0.75rem; color:#555; }
          .checkout-print-item-summary.pending { color:#888; font-style:italic; }
        </style>
        </head>
        <body>
          <div class="print-page paginated">
            <table class="checkout-print-page-table">
              <thead>
                <tr><td>
                  <div class="print-header">
                    <img src="data:image/svg+xml;base64,${BrandLogo.BASE64}" alt="Sita Yapı" />
                    <div>
                      <h2>Parça Zimmeti</h2>
                      <div>${formatDateTR(dateIso)}</div>
                    </div>
                  </div>
                </td></tr>
              </thead>
              <tbody>
                <tr><td>$bodyHtml</td></tr>
              </tbody>
            </table>
          </div>
        </body>
        </html>
        """.trimIndent()
    }
}
