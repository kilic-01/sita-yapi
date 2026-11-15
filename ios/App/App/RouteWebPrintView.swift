import SwiftUI

/// Masaüstündeki src/components/PrintView.jsx ile aynı HTML çıktısı —
/// tek, yoğun yatay tablo, teknisyen başına renk şeridi + kalın kesik
/// çizgiyle ayrım (src/lib/techColors.js ile birebir aynı renk paleti).
struct RouteWebPrintView: View {
    let scheduledDate: String
    let routes: [RouteGroup]

    var body: some View {
        WebPrintView(
            title: "Günlük Rota",
            html: RoutePrintHTML.render(scheduledDate: scheduledDate, routes: routes),
            shareFileName: "Rota-\(scheduledDate)"
        )
    }
}

enum RoutePrintHTML {
    private static let techColors = [
        "#3eaca7", "#c0392b", "#8e44ad", "#2980b9", "#d35400",
        "#27ae60", "#f39c12", "#16a085", "#c2185b", "#5d4037",
    ]
    private static let unassignedColor = "#7f8c8d"

    private static func colorFor(index: Int) -> String {
        index < 0 ? unassignedColor : techColors[index % techColors.count]
    }

    static func render(scheduledDate: String, routes: [RouteGroup]) -> String {
        let h = PrintHTMLHelpers.self

        let rowsHTML = routes.enumerated().map { routeIdx, route -> String in
            let color = colorFor(index: routeIdx)
            let isLastGroup = routeIdx == routes.count - 1
            let techCellStyle = "border:0.5px solid #ccc;padding:1px 4px;text-align:left;vertical-align:top;overflow-wrap:break-word;width:9.5%;font-weight:700;border-left:4px solid \(color);"

            if route.stops.isEmpty {
                let rowBorder = isLastGroup ? "" : "border-bottom:1.5px dashed #888;"
                return """
                <tr style="\(rowBorder)">
                  <td style="\(techCellStyle)">\(h.htmlEscape(route.technician.name))</td>
                  <td colspan="5" style="border:0.5px solid #ccc;padding:1px 4px;color:#888;font-style:italic;">Bu teknisyene atanan iş yok.</td>
                </tr>
                """
            }

            let rowCount = max(route.stops.count, 1)
            return route.stops.enumerated().map { idx, s -> String in
                let isUrgent = s.urgency == "acil"
                let isGroupEnd = !isLastGroup && idx == rowCount - 1
                var rowStyle = ""
                if isUrgent { rowStyle += "background:#fdecea;" }
                if isGroupEnd { rowStyle += "border-bottom:1.5px dashed #888;" }
                let cell = "border:0.5px solid #ccc;padding:1px 4px;text-align:left;vertical-align:top;overflow-wrap:break-word;"
                let urgentTag = isUrgent ? " <span style=\"color:#c0392b;font-weight:700;\">ACİL</span>" : ""
                return """
                <tr style="\(rowStyle)font-size:7.5px;line-height:1.15;">
                  <td style="\(techCellStyle)">\(h.htmlEscape(route.technician.name))</td>
                  <td style="\(cell)width:2%;text-align:center;font-weight:700;">\(idx + 1)</td>
                  <td style="\(cell)width:13%;">\(h.htmlEscape(s.customerName))\(urgentTag)</td>
                  <td style="\(cell)width:9.5%;white-space:nowrap;">\(h.htmlEscape(s.customerPhone))</td>
                  <td style="\(cell)width:33%;">\(h.htmlEscape(s.address))</td>
                  <td style="\(cell)width:32.5%;">\(h.htmlEscape(s.complaint))</td>
                </tr>
                """
            }.joined()
        }.joined()

        let headCell = "background:#0e2a3b;color:#fff;font-size:8.5px;padding:3px 5px;text-align:left;"
        let body = """
        \(h.pageHeaderHTML(title: "Günlük Rota", subtitle: scheduledDate))
        <table style="width:100%;border-collapse:collapse;table-layout:fixed;font-size:7.5px;line-height:1.15;">
          <thead>
            <tr>
              <th style="\(headCell)width:9.5%;">Teknisyen</th>
              <th style="\(headCell)width:2%;text-align:center;">#</th>
              <th style="\(headCell)width:13%;">Müşteri</th>
              <th style="\(headCell)width:9.5%;">Telefon</th>
              <th style="\(headCell)width:33%;">Adres</th>
              <th style="\(headCell)width:32.5%;">Şikayet / Not</th>
            </tr>
          </thead>
          <tbody>
            \(rowsHTML)
          </tbody>
        </table>
        """
        return h.pageShell(bodyHTML: body, landscape: true)
    }
}
