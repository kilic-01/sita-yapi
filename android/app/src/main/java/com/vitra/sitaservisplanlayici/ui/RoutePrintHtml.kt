package com.vitra.sitaservisplanlayici.ui

import com.vitra.sitaservisplanlayici.data.Appointment
import com.vitra.sitaservisplanlayici.data.RouteGroup
import com.vitra.sitaservisplanlayici.data.Technician

/**
 * Masaüstündeki src/components/PrintView.jsx'in (Günlük Rota, yatay A4)
 * HTML/CSS yapısının birebir Kotlin karşılığı. Teknisyen başına bir renk
 * (col-tech sol kenarlığı) atanır — src/styles.css'teki colorForTechnician
 * mantığıyla aynı: teknisyen listesindeki sırasına göre sabit bir palet.
 */
object RoutePrintHtml {
    private val TECH_COLORS = listOf(
        "#3ea7a3", "#c0392b", "#8e44ad", "#2980b9", "#d35400", "#16a085", "#2c3e50", "#b8860b"
    )

    private fun esc(s: String?): String =
        (s ?: "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    private fun formatDateTR(iso: String?): String {
        if (iso.isNullOrBlank()) return ""
        val parts = iso.split("-")
        if (parts.size != 3) return iso
        return "${parts[2]}.${parts[1]}.${parts[0]}"
    }

    private fun colorFor(technicianId: String, allTechnicians: List<Technician>): String {
        val idx = allTechnicians.indexOfFirst { it.id == technicianId }.coerceAtLeast(0)
        return TECH_COLORS[idx % TECH_COLORS.size]
    }

    fun render(scheduledDate: String?, routes: List<RouteGroup>): String {
        val allTechnicians = routes.map { it.technician }
        val rowsHtml = routes.mapIndexed { groupIdx, group ->
            val color = colorFor(group.technician.id, allTechnicians)
            val stops = group.stops.sortedBy { it.stopOrder ?: 0 }
            val isLastGroup = groupIdx == routes.size - 1

            if (stops.isEmpty()) {
                """
                <tr>
                  <td class="col-tech" style="border-left-color:$color;">${esc(group.technician.name)}</td>
                  <td class="empty-row" colspan="5">Bu teknisyene atanan iş yok.</td>
                </tr>
                """.trimIndent()
            } else {
                stops.mapIndexed { stopIdx, stop ->
                    val isUrgent = stop.urgency == "acil"
                    val rowClasses = mutableListOf<String>()
                    if (isUrgent) rowClasses += "urgent-row"
                    if (!isLastGroup && stopIdx == stops.size - 1) rowClasses += "group-end"
                    val rowClassAttr = if (rowClasses.isNotEmpty()) " class=\"${rowClasses.joinToString(" ")}\"" else ""
                    val techCell = if (stopIdx == 0) {
                        """<td class="col-tech" style="border-left-color:$color;" rowspan="${stops.size}">${esc(group.technician.name)}</td>"""
                    } else ""
                    val customerNameHtml = esc(stop.customerName ?: "") + if (isUrgent) """ <span class="urgent-tag">ACİL</span>""" else ""
                    """
                    <tr$rowClassAttr>
                      $techCell
                      <td class="col-order">${stopIdx + 1}</td>
                      <td class="col-customer">$customerNameHtml</td>
                      <td class="col-phone">${esc(stop.customerPhone ?: "")}</td>
                      <td class="col-address">${esc(stop.address ?: "")}</td>
                      <td class="col-note">${esc(stop.complaint ?: "")}</td>
                    </tr>
                    """.trimIndent()
                }.joinToString("")
            }
        }.joinToString("")

        return """
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="UTF-8" />
        <style>
          * { box-sizing: border-box; }
          body { margin:0; font-family:'Inter', -apple-system, sans-serif; background:#fff; color:#1a1a1a; }
          .print-page.landscape { padding:8mm; }
          .print-header { display:flex; align-items:center; gap:0.6rem; border-bottom:2px solid #0e2a3b; padding-bottom:0.3rem; margin-bottom:0.4rem; }
          .print-header img { height:30px; }
          .print-header h2 { margin:0; font-size:1.2rem; color:#0e2a3b; }
          .print-header > div > div { font-size:0.75rem; }
          .print-route-table { width:100%; border-collapse:collapse; table-layout:fixed; font-size:10px; line-height:1.15; }
          .print-route-table th, .print-route-table td { border:0.5px solid #ccc; padding:2px 5px; text-align:left; vertical-align:top; overflow-wrap:break-word; }
          .print-route-table thead th { background:#0e2a3b; color:#fff; font-size:11px; padding:4px 6px; }
          .print-route-table .col-tech { width:9.5%; font-weight:700; border-left:4px solid transparent; }
          .print-route-table .col-order { width:2%; text-align:center; font-weight:700; }
          .print-route-table .col-customer { width:13%; }
          .print-route-table .col-phone { width:9.5%; white-space:nowrap; }
          .print-route-table .col-address { width:33%; }
          .print-route-table .col-note { width:32.5%; }
          .print-route-table .empty-row { color:#888; font-style:italic; }
          .print-route-table .urgent-row { background:#fdecea; }
          .print-route-table .urgent-tag { color:#c0392b; font-weight:700; }
          .print-route-table tr.group-end td { border-bottom:1.5px dashed #888; }
        </style>
        </head>
        <body>
          <div class="print-page landscape">
            <div class="print-header">
              <img src="data:image/svg+xml;base64,${BrandLogo.BASE64}" alt="Sita Yapı" />
              <div>
                <h2>Günlük Rota</h2>
                <div>${formatDateTR(scheduledDate)}</div>
              </div>
            </div>
            <table class="print-route-table">
              <thead>
                <tr>
                  <th class="col-tech">Teknisyen</th>
                  <th class="col-order">#</th>
                  <th class="col-customer">Müşteri</th>
                  <th class="col-phone">Telefon</th>
                  <th class="col-address">Adres</th>
                  <th class="col-note">Şikayet / Not</th>
                </tr>
              </thead>
              <tbody>
                $rowsHtml
              </tbody>
            </table>
          </div>
        </body>
        </html>
        """.trimIndent()
    }
}
