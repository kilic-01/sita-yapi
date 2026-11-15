import SwiftUI
import MapKit

private let statusLabels: [String: String] = [
    "pending": "Bekliyor", "routed": "Rotalandı", "completed": "Tamamlandı", "cancelled": "İptal Edildi",
]
private func statusColor(_ status: String?) -> Color {
    switch status {
    case "completed": return .green
    case "cancelled": return .red
    default: return .secondary
    }
}

// Masaüstündeki src/lib/techColors.js ile aynı palet ve sıra: teknisyen
// listesindeki sırasına göre renk (atanmamış: gri).
private let techPalette: [UInt32] = [
    0x3EACA7, 0xC0392B, 0x8E44AD, 0x2980B9, 0xD35400, 0x27AE60, 0xF39C12, 0x16A085, 0xC2185B, 0x5D4037,
]
func technicianColor(_ id: String?, in technicians: [Technician]) -> Color {
    guard let id, let idx = technicians.firstIndex(where: { $0.id == id }) else {
        return Color(red: 0x7F / 255, green: 0x8C / 255, blue: 0x8D / 255)
    }
    let hex = techPalette[idx % techPalette.count]
    return Color(red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255, blue: Double(hex & 0xFF) / 255)
}

/// "2026-11-15" → "15 Kas 2026"
private func shortDate(_ iso: String?) -> String? {
    guard let iso else { return nil }
    let parser = DateFormatter()
    parser.dateFormat = "yyyy-MM-dd"
    guard let d = parser.date(from: iso) else { return iso }
    let out = DateFormatter()
    out.locale = Locale(identifier: "tr_TR")
    out.dateFormat = "dd/MM/yyyy"
    return out.string(from: d)
}

/// Mahalle (yoksa ilçe, o da yoksa adresin ilk parçası) — kartın ikinci satırı için kısa konum.
func shortPlace(_ a: Appointment) -> String? {
    let tr = Locale(identifier: "tr_TR")
    // "MEHMET AKİF" → "Mehmet Akif" (TV rota ekranındaki gibi; büyük harf küçük boyda zor okunur).
    func title(_ s: String) -> String { s.lowercased(with: tr).capitalized(with: tr) }
    if let m = a.addressDetail?.mahalle, !m.isEmpty { return title(m.replacingOccurrences(of: " Mahallesi", with: "").replacingOccurrences(of: " Mah.", with: "")) }
    if let i = a.addressDetail?.ilce, !i.isEmpty { return title(i) }
    return a.address?.split(separator: ",").first.map { String($0).trimmingCharacters(in: .whitespaces) }
}

/// Durum rozeti rengi: tamamlandı yeşil, rotalandı mavi, iptal kırmızı, bekliyor gri.
func statusTint(_ status: String?) -> Color {
    switch status {
    case "completed": return .green
    case "routed": return .blue
    case "cancelled": return .red
    default: return .gray
    }
}

/// Randevu kartı: solda teknisyen renginde şerit, rota sırası dairede; ad (Acil ise kırmızı
/// nokta), altında "mahalle · şikâyetin ilk satırı"; sağda küçük durum rozeti. Aynı bilgi
/// eskisinin yarı yüksekliğinde — bir ekrana iki kat randevu sığar. Aramada tarih de görünür.
struct AppointmentRow: View {
    let appt: Appointment
    let technicians: [Technician]
    var showDate = false

    var body: some View {
        let tint = technicianColor(appt.assignedTechnicianId, in: technicians)
        HStack(spacing: 12) {
            RoundedRectangle(cornerRadius: 2.5).fill(tint).frame(width: 5).padding(.vertical, 2)
            ZStack {
                Circle().fill(tint.opacity(0.14))
                Circle().strokeBorder(tint, lineWidth: 1.25)
                // stopOrder 0'dan başlıyor; masaüstündeki TV rota ekranı gibi 1'den gösterilir.
                Text(appt.stopOrder.map { "\($0 + 1)" } ?? "–").font(.subheadline.weight(.semibold).monospacedDigit())
            }
            .frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(appt.customerName ?? "(isimsiz)").font(.body.weight(.semibold)).lineLimit(1)
                    if appt.urgency == "acil" {
                        Circle().fill(.red).frame(width: 7, height: 7).accessibilityLabel("Acil")
                    }
                    if appt.geocodeIssue != nil {
                        Image(systemName: "exclamationmark.triangle.fill").font(.caption2).foregroundStyle(.orange)
                    }
                }
                let complaint = appt.complaint?.split(separator: "\n").first.map(String.init)
                let parts = [showDate ? shortDate(appt.scheduledDate) : nil, shortPlace(appt), complaint].compactMap { $0 }.filter { !$0.isEmpty }
                Text(parts.isEmpty ? "—" : parts.joined(separator: " · "))
                    .font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
            }
            Spacer(minLength: 4)
            Text(statusLabels[appt.status ?? ""] ?? appt.status ?? "—")
                .font(.caption.weight(.semibold))
                .foregroundStyle(statusTint(appt.status))
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(statusTint(appt.status).opacity(0.12), in: Capsule())
        }
        .padding(.vertical, 4)
    }
}

struct AppointmentsView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.openURL) private var openURL
    @State private var date: Date = Date()
    @State private var appointments: [Appointment] = []
    @State private var technicians: [Technician] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var loadSeq = 0
    @State private var showMap = false
    @State private var showRouteBuilder = false
    // Arama: müşteri adı ya da telefon — tarihten bağımsız (en yeni 50 randevu).
    @State private var query = ""
    @State private var searchResults: [Appointment] = []
    @State private var isSearching = false
    // Ana sayfadaki "Müşteri Ara" hızlı işlemi: arama kutusu açılır, klavye gelir.
    @Environment(TabRouter.self) private var router: TabRouter?
    @State private var isSearchPresented = false
    // Hafta şeridindeki günlerin randevu sayıları (seçili tarihin haftası).
    @State private var weekCounts: [String: Int] = [:]
    @State private var showCreate = false
    // "Geri al": durum değiştikten (tamamlandı ↔ bekliyor) sonra 5 saniye boyunca önceki duruma dönülebilir.
    // token: aynı randevu art arda değişince de 5 sn sayaç yeniden başlasın.
    @State private var undo: (appt: Appointment, previous: String, newStatus: String, token: UUID)?

    private var isSearchActive: Bool { query.trimmingCharacters(in: .whitespaces).count >= 2 }

    var body: some View {
        NavigationStack {
            List {
                if isSearchPresented && !isSearchActive && !appState.recentAppointments.isEmpty {
                    Section("Son Bakılanlar") {
                        ForEach(appState.recentAppointments) { appt in
                            NavigationLink(value: appt) {
                                AppointmentRow(appt: appt, technicians: technicians, showDate: true)
                            }
                        }
                    }
                } else if isSearchActive {
                    if isSearching && searchResults.isEmpty {
                        ProgressView()
                    } else if searchResults.isEmpty {
                        Text("“\(query)” ile eşleşen randevu yok.").foregroundStyle(.secondary)
                    } else {
                        Section("\(searchResults.count) randevu") {
                            ForEach(searchResults) { appt in
                                NavigationLink(value: appt) {
                                    AppointmentRow(appt: appt, technicians: technicians, showDate: true)
                                }
                                .swipeActions(edge: .leading) { completeAction(appt) }
                                .swipeActions(edge: .trailing) { contactActions(appt) }
                            }
                        }
                    }
                } else {
                    WeekStrip(date: $date, counts: weekCounts)
                        .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))

                    if isLoading {
                        ProgressView()
                    } else if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    } else if appointments.isEmpty {
                        ContentUnavailableView {
                            Label("Bu tarihte randevu yok", systemImage: "calendar")
                        } description: {
                            Text("Seçili gün için kayıtlı randevu bulunmuyor.")
                        } actions: {
                            Button("Randevu Oluştur") { showCreate = true }
                                .buttonStyle(.borderedProminent)
                        }
                        .listRowBackground(Color.clear)
                    } else {
                        ForEach(sortedAppointments) { appt in
                            NavigationLink(value: appt) {
                                AppointmentRow(appt: appt, technicians: technicians)
                            }
                            .swipeActions(edge: .leading) { completeAction(appt) }
                            .swipeActions(edge: .trailing) { contactActions(appt) }
                        }
                    }
                }
            }
            .navigationTitle("Randevular")
            // .always: iOS 26'da sekmeli uygulamada arama kutusu başlığın altına gizleniyor, ancak
            // liste aşağı çekilince görünüyordu (üstte hafta şeridi varken pratikte hiç görünmüyordu).
            .searchable(text: $query, isPresented: $isSearchPresented, placement: .navigationBarDrawer(displayMode: .always), prompt: "Müşteri adı veya telefon")
            .onChange(of: router?.pendingAppointmentSearch ?? false, initial: true) { _, pending in
                if pending { router?.pendingAppointmentSearch = false; isSearchPresented = true }
            }
            .task(id: query) { await search() }
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Bugün") { date = Date() }
                        .disabled(Calendar.current.isDateInToday(date))
                }
                // Kullanıcı isteği: tek bir "..." menüsü yerine iki ayrı,
                // dokunması daha kolay yuvarlak buton — Harita ve Rota
                // Oluştur'a ulaşmak için ekstra bir menü açma adımı olmasın.
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: {
                        Image(systemName: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Randevu Oluştur")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showRouteBuilder = true } label: {
                        Image(systemName: "wand.and.stars")
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Rota Oluştur")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showMap = true } label: {
                        Image(systemName: "map.fill")
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .accessibilityLabel("Harita")
                }
            }
            .navigationDestination(for: Appointment.self) { appt in
                AppointmentDetailView(
                    appointment: appt,
                    technicians: technicians,
                    onStatusChanged: { updated in replaceEverywhere(updated) },
                    onDeleted: {
                        appointments.removeAll { $0.id == appt.id }
                    }
                )
            }
            .navigationDestination(isPresented: $showMap) {
                MapTabView()
            }
            .navigationDestination(isPresented: $showRouteBuilder) {
                RouteBuilderView()
            }
            .task(id: date) { await load() }
            .overlay(alignment: .bottom) { undoToast }
            .task(id: undo?.token) {
                guard undo != nil else { return }
                try? await Task.sleep(for: .seconds(5))
                if !Task.isCancelled { withAnimation { undo = nil } }
            }
            .task(id: weekKey) { await loadWeekCounts() }
            .sheet(isPresented: $showCreate) {
                NavigationStack {
                    AppointmentCreateView(onCreated: {
                        showCreate = false
                        Task { await load(); await loadWeekCounts() }
                    })
                }
            }
            .task { technicians = (try? await APIClient.shared.get("/technicians")) ?? [] }
            .refreshable { await load() }
        }
    }

    @ViewBuilder
    private func completeAction(_ appt: Appointment) -> some View {
        // Android ile aynı: tamamlanmamışsa "Tamamlandı", tamamlanmışsa "Bekliyor"a geri al.
        if appt.status == "completed" {
            Button {
                Task { await setStatus(appt, to: "pending") }
            } label: {
                Label("Bekliyor", systemImage: "arrow.uturn.backward.circle.fill")
            }
            .tint(.orange)
        } else {
            Button {
                Task { await setStatus(appt, to: "completed") }
            } label: {
                Label("Tamamlandı", systemImage: "checkmark.circle.fill")
            }
            .tint(.green)
        }
    }

    @ViewBuilder
    private func contactActions(_ appt: Appointment) -> some View {
        if let url = appt.customerPhone?.telURL {
            Button { openURL(url) } label: { Label("Ara", systemImage: "phone.fill") }
                .tint(.blue)
        }
        if let url = appt.directionsURL {
            Button { openURL(url) } label: { Label("Yol Tarifi", systemImage: "arrow.triangle.turn.up.right.diamond.fill") }
                .tint(.orange)
        }
    }

    private func replaceEverywhere(_ updated: Appointment) {
        if let idx = appointments.firstIndex(where: { $0.id == updated.id }) { appointments[idx] = updated }
        if let idx = searchResults.firstIndex(where: { $0.id == updated.id }) { searchResults[idx] = updated }
    }

    private func setStatus(_ appt: Appointment, to newStatus: String) async {
        struct Body: Encodable { let status: String; let actingUserId: String }
        do {
            let _: Appointment = try await APIClient.shared.put(
                "/appointments/\(appt.id)/status",
                body: Body(status: newStatus, actingUserId: appState.currentUser?.id ?? "")
            )
            var updated = appt
            updated.status = newStatus
            replaceEverywhere(updated)
            Haptics.success()
            withAnimation { undo = (appt, appt.status ?? "pending", newStatus, UUID()) }
        } catch {
            errorMessage = error.turkishMessage
        }
    }

    @ViewBuilder
    private var undoToast: some View {
        if let undo {
            HStack(spacing: 12) {
                Image(systemName: undo.newStatus == "completed" ? "checkmark.circle.fill" : "arrow.uturn.backward.circle.fill")
                    .foregroundStyle(undo.newStatus == "completed" ? .green : .orange)
                Text("\(undo.appt.customerName ?? "Randevu") \(undo.newStatus == "completed" ? "tamamlandı" : "bekliyor olarak işaretlendi")").font(.subheadline).lineLimit(1)
                Spacer(minLength: 4)
                Button("Geri al") { Task { await revert(undo) } }
                    .font(.subheadline.bold())
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(.regularMaterial, in: Capsule())
            .shadow(radius: 6, y: 2)
            .padding(.horizontal, 16).padding(.bottom, 12)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func revert(_ item: (appt: Appointment, previous: String, newStatus: String, token: UUID)) async {
        struct Body: Encodable { let status: String; let actingUserId: String }
        withAnimation { undo = nil }
        do {
            let _: Appointment = try await APIClient.shared.put(
                "/appointments/\(item.appt.id)/status",
                body: Body(status: item.previous, actingUserId: appState.currentUser?.id ?? "")
            )
            var reverted = item.appt
            reverted.status = item.previous
            replaceEverywhere(reverted)
            Haptics.tap()
        } catch {
            errorMessage = error.turkishMessage
        }
    }

    /// Seçili tarihin haftasının pazartesisi (hafta şeridi bu haftayı gösterir).
    private var weekKey: String { isoString(weekStart(of: date)) }

    private func loadWeekCounts() async {
        let start = weekStart(of: date)
        var counts: [String: Int] = [:]
        await withTaskGroup(of: (String, Int).self) { group in
            for offset in 0..<7 {
                let day = isoString(Calendar.current.date(byAdding: .day, value: offset, to: start) ?? start)
                group.addTask {
                    let list: [Appointment] = (try? await APIClient.shared.get("/appointments/by-date/\(day)")) ?? []
                    return (day, list.filter { $0.status != "cancelled" }.count)
                }
            }
            for await (day, n) in group { counts[day] = n }
        }
        weekCounts = counts
    }

    private func search() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { searchResults = []; return }
        // Yazarken her harfte istek atılmasın.
        try? await Task.sleep(for: .milliseconds(350))
        guard !Task.isCancelled else { return }
        isSearching = true
        defer { isSearching = false }
        let encoded = q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? q
        if let result: [Appointment] = try? await APIClient.shared.get("/appointments/search?q=\(encoded)"),
           !Task.isCancelled {
            searchResults = result
        }
    }

    private var sortedAppointments: [Appointment] {
        appointments.sorted { ($0.stopOrder ?? 999) < ($1.stopOrder ?? 999) }
    }

    private func load() async {
        loadSeq += 1
        let seq = loadSeq
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let dateStr = formatter.string(from: date)
            let result: [Appointment] = try await APIClient.shared.get("/appointments/by-date/\(dateStr)")
            guard seq == loadSeq else { return }
            appointments = result
        } catch {
            guard seq == loadSeq else { return }
            errorMessage = error.turkishMessage
        }
    }
}

extension Appointment: Hashable {
    // Eskiden yalnız id karşılaştırılıyordu: kaydırmayla durum değişince SwiftUI
    // satırı "değişmemiş" sayıp yeniden çizmiyordu (sunucuda tamamlandı, ekranda
    // hâlâ bekliyor). Ekranda görünen alanlar da karşılaştırılır; hash yalnız id
    // (eşit olanların hash'i yine aynı — Hashable kuralı korunuyor).
    static func == (lhs: Appointment, rhs: Appointment) -> Bool {
        lhs.id == rhs.id && lhs.status == rhs.status && lhs.customerName == rhs.customerName
            && lhs.complaint == rhs.complaint && lhs.stopOrder == rhs.stopOrder
            && lhs.scheduledDate == rhs.scheduledDate && lhs.urgency == rhs.urgency
            && lhs.assignedTechnicianId == rhs.assignedTechnicianId && lhs.address == rhs.address
            && lhs.customerPhone == rhs.customerPhone && lhs.feeAmount == rhs.feeAmount
            && lhs.feePaid == rhs.feePaid && lhs.geocodeIssue == rhs.geocodeIssue
            && lhs.heldForLeave == rhs.heldForLeave
    }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct AppointmentDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let appointment: Appointment
    let onStatusChanged: (Appointment) -> Void
    let onDeleted: () -> Void

    @State private var technicians: [Technician]
    @State private var current: Appointment
    @State private var isUpdating = false
    @State private var errorMessage: String?
    @State private var showEdit = false
    @State private var showHistory = false

    init(appointment: Appointment, technicians: [Technician] = [], onStatusChanged: @escaping (Appointment) -> Void, onDeleted: @escaping () -> Void = {}) {
        self.appointment = appointment
        _technicians = State(initialValue: technicians)
        self.onStatusChanged = onStatusChanged
        self.onDeleted = onDeleted
        _current = State(initialValue: appointment)
    }

    var body: some View {
        List {
            Section {
                Text(current.customerName ?? "(isimsiz)").font(.title3.bold())
                if let address = current.address, !address.isEmpty {
                    Text(address).foregroundStyle(.secondary)
                }
            }
            if let geocodeIssue = current.geocodeIssue {
                Section {
                    Label(geocodeIssue, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote)
                        .foregroundStyle(.orange)
                }
            }
            if let lat = current.lat, let lng = current.lng {
                Section {
                    Map(initialPosition: .region(MKCoordinateRegion(
                        center: CLLocationCoordinate2D(latitude: lat, longitude: lng),
                        span: MKCoordinateSpan(latitudeDelta: 0.01, longitudeDelta: 0.01)
                    ))) {
                        Marker(current.customerName ?? "(isimsiz)", coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng))
                    }
                    .frame(height: 180)
                    .listRowInsets(EdgeInsets())
                }
            } else {
                Section {
                    Text("Bu randevu için konum belirlenemedi.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
            if let url = current.directionsURL {
                Section {
                    Link(destination: url) {
                        Label("Yol Tarifi", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                    }
                }
            }
            Section {
                if let phone = current.customerPhone, !phone.isEmpty {
                    LabeledContent("Telefon") {
                        if let url = phone.telURL {
                            Link(phone, destination: url)
                        } else {
                            Text(phone)
                        }
                    }
                }
                LabeledContent("Teknisyen") {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(technicianColor(current.assignedTechnicianId, in: technicians))
                            .frame(width: 8, height: 8)
                        Text(technicians.first { $0.id == current.assignedTechnicianId }?.name ?? "Atanmadı")
                    }
                }
                if let date = shortDate(current.scheduledDate) {
                    LabeledContent("Tarih") { Text(date) }
                }
                LabeledContent("Durum") {
                    HStack(spacing: 6) {
                        if current.urgency == "acil" {
                            Text("Acil")
                                .font(.caption.bold())
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(.red, in: Capsule())
                        }
                        Text(statusLabels[current.status ?? ""] ?? current.status ?? "—")
                    }
                }
                if let complaint = current.complaint, !complaint.isEmpty {
                    LabeledContent("Şikayet") { Text(complaint) }
                }
            }
            Section("Durumu güncelle") {
                Button {
                    Task { await updateStatus("completed") }
                } label: {
                    Label("Tamamlandı olarak işaretle", systemImage: "checkmark.circle.fill")
                }
                Button {
                    Task { await updateStatus("pending") }
                } label: {
                    Text("Bekliyor olarak işaretle")
                }
            }
            .disabled(isUpdating)
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle(current.customerName ?? "Randevu")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            appState.addRecentAppointment(current)
            if technicians.isEmpty { technicians = (try? await APIClient.shared.get("/technicians")) ?? [] }
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showEdit = true } label: {
                        Label("Düzenle", systemImage: "pencil")
                    }
                    Button { showHistory = true } label: {
                        Label("Müşteri Geçmişi", systemImage: "clock.arrow.circlepath")
                    }
                } label: {
                    Image(systemName: "ellipsis.circle")
                }
            }
        }
        .sheet(isPresented: $showEdit) {
            NavigationStack {
                AppointmentEditView(
                    appointment: current,
                    onSaved: { updated in
                        current = updated
                        onStatusChanged(updated)
                    },
                    onDeleted: {
                        onDeleted()
                        dismiss()
                    }
                )
            }
        }
        .navigationDestination(isPresented: $showHistory) {
            CustomerHistoryView(
                customerName: current.customerName ?? "",
                customerPhone: current.customerPhone ?? "",
                excludeAppointmentId: current.id
            )
        }
    }

    private func updateStatus(_ status: String) async {
        isUpdating = true
        errorMessage = nil
        defer { isUpdating = false }
        do {
            struct Body: Encodable { let status: String; let actingUserId: String }
            let _: Appointment = try await APIClient.shared.put(
                "/appointments/\(current.id)/status",
                body: Body(status: status, actingUserId: appState.currentUser?.id ?? "")
            )
            current.status = status
            onStatusChanged(current)
            Haptics.success()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

func weekStart(of date: Date) -> Date {
    var cal = Calendar(identifier: .gregorian)
    cal.firstWeekday = 2 // Pazartesi
    return cal.dateInterval(of: .weekOfYear, for: date)?.start ?? date
}

func isoString(_ date: Date) -> String {
    let f = DateFormatter()
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: date)
}

/// Randevular ekranının üstündeki hafta şeridi: 7 gün, her günün randevu sayısı;
/// oklarla hafta değişir, takvim simgesiyle uzak bir tarih seçilir.
struct WeekStrip: View {
    @Binding var date: Date
    let counts: [String: Int]

    private var days: [Date] {
        let start = weekStart(of: date)
        return (0..<7).compactMap { Calendar.current.date(byAdding: .day, value: $0, to: start) }
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button { shift(-7) } label: { Image(systemName: "chevron.left") }
                    .buttonStyle(.borderless)
                Text(monthTitle).font(.subheadline.weight(.semibold))
                Spacer()
                DatePicker("", selection: $date, displayedComponents: .date)
                    .labelsHidden()
                    .environment(\.locale, Locale(identifier: "tr_TR"))
                Button { shift(7) } label: { Image(systemName: "chevron.right") }
                    .buttonStyle(.borderless)
            }
            HStack(spacing: 4) {
                ForEach(days, id: \.self) { day in
                    let selected = Calendar.current.isDate(day, inSameDayAs: date)
                    let isToday = Calendar.current.isDateInToday(day)
                    let count = counts[isoString(day)] ?? 0
                    Button { date = day } label: {
                        VStack(spacing: 3) {
                            Text(dayName(day)).font(.caption2).foregroundStyle(selected ? .white : .secondary)
                            Text(dayNumber(day)).font(.headline).foregroundStyle(selected ? .white : (isToday ? Color.accentColor : .primary))
                            Text(count > 0 ? "\(count)" : "·")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(selected ? .white : (count > 0 ? Color.accentColor : .secondary))
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 6)
                        .background(selected ? Color.accentColor : Color.clear, in: RoundedRectangle(cornerRadius: 10))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private func shift(_ days: Int) {
        date = Calendar.current.date(byAdding: .day, value: days, to: date) ?? date
    }

    private var monthTitle: String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "LLLL yyyy"
        return f.string(from: date).capitalized(with: Locale(identifier: "tr_TR"))
    }

    private func dayName(_ d: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "tr_TR")
        f.dateFormat = "EEE"
        return f.string(from: d)
    }

    private func dayNumber(_ d: Date) -> String {
        String(Calendar.current.component(.day, from: d))
    }
}
