import SwiftUI

/// Desktop'taki HOME_WIDGETS'ın (src/components/homeWidgets.jsx) native
/// karşılığı — sürükle-bırak ızgara mobilde anlamsız olduğu için widget'lar
/// sabit, dikey bir sırada. Kapsam dışı bırakılanlar (bilinçli): "İzin
/// Dönüşü Bekleyen Randevular" (verimli çekmek için ayrı bir backend ucu
/// gerekir, telefonda tüm randevu tablosunu taramak istemedik) ve "Gün Sonu
/// Özeti" (sadece yönetici, düşük öncelik).

struct HomeView: View {
    @Environment(AppState.self) private var appState
    @Environment(TabRouter.self) private var router

    @State private var todayAppts: [Appointment] = []
    @State private var tomorrowAppts: [Appointment] = []
    @State private var weekAppts: [Appointment] = []
    @State private var quotes: [Quote] = []
    @State private var checkouts: [PartCheckout] = []
    @State private var technicians: [Technician] = []
    @State private var lowStockItems: [StockItem] = []
    @State private var showCreateAppointment = false
    @State private var showQuickSale = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    Text("Merhaba, \(appState.currentUser?.name ?? "")")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)

                    statsStrip

                    ProgramWidgetView()

                    HomeWidgetCard(title: "Bugünün Randevuları", systemImage: "calendar.badge.clock", tint: .blue) {
                        router.selection = .appointments
                    } content: {
                        Text("\(todayAppts.count)").font(.system(size: 34, weight: .bold))
                        HStack(spacing: 10) {
                            statPill("✔ \(todayAppts.filter { $0.status == "completed" }.count) tamamlandı")
                            statPill("➜ \(todayAppts.filter { $0.status == "routed" }.count) yolda")
                            statPill("⏳ \(todayAppts.filter { $0.status == "pending" }.count) bekliyor")
                        }
                        let urgent = todayAppts.filter { $0.urgency == "acil" && $0.status != "completed" && $0.status != "cancelled" }.count
                        if urgent > 0 {
                            Text("\(urgent) acil").font(.caption.bold()).foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3).background(.red, in: Capsule())
                        }
                    }

                    HomeWidgetCard(title: "Yarının Randevuları", systemImage: "calendar.badge.plus", tint: .green) {
                        router.selection = .appointments
                    } content: {
                        Text("\(tomorrowAppts.count)").font(.system(size: 34, weight: .bold))
                        let notRouted = tomorrowAppts.filter { $0.status == "pending" }.count
                        if notRouted > 0 {
                            Text("\(notRouted) iş henüz rotalanmadı").font(.caption.bold()).foregroundStyle(.white)
                                .padding(.horizontal, 8).padding(.vertical, 3).background(.orange, in: Capsule())
                        }
                    }

                    HomeWidgetCard(title: "Az Stoklu Ürünler", systemImage: "shippingbox.fill", tint: .orange) {
                        router.selection = .stock
                    } content: {
                        if lowStockItems.isEmpty {
                            Label("Az stoklu ürün yok.", systemImage: "checkmark.circle.fill").foregroundStyle(.green).font(.subheadline)
                        } else {
                            ForEach(lowStockItems.prefix(5)) { item in
                                HStack {
                                    Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(.red).font(.caption)
                                    Text(item.name ?? item.code ?? "(isimsiz)").font(.subheadline)
                                    Spacer()
                                    Text("\(Int(item.quantity ?? 0)) \(item.unit ?? "adet")").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                            if lowStockItems.count > 5 {
                                Text("+\(lowStockItems.count - 5) ürün daha").font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }

                    HomeWidgetCard(title: "Fiyat Teklifleri", systemImage: "doc.text.fill", tint: .gray) {
                        router.selection = .more
                    } content: {
                        if quotes.isEmpty {
                            Text("Henüz teklif oluşturulmadı.").font(.subheadline).foregroundStyle(.secondary)
                        } else {
                            ForEach(quotes.prefix(5)) { q in
                                HStack {
                                    VStack(alignment: .leading) {
                                        Text(q.customerName ?? "(isimsiz)").font(.subheadline)
                                        Text([q.quoteNo, q.quoteDate].compactMap { $0 }.joined(separator: " · ")).font(.caption).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                }
                            }
                        }
                    }

                    HomeWidgetCard(title: "Mutabakatı Bekleyen Zimmetler", systemImage: "exclamationmark.triangle.fill", tint: .red) {
                        router.selection = .more
                    } content: {
                        if overdueCheckouts.isEmpty {
                            Label("Bekleyen mutabakat yok.", systemImage: "checkmark.circle.fill").foregroundStyle(.green).font(.subheadline)
                        } else {
                            ForEach(overdueCheckouts.prefix(5)) { c in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(technicians.first { $0.id == c.technicianId }?.name ?? "Bilinmeyen teknisyen").font(.subheadline)
                                    Text("\(c.date ?? "") tarihli zimmet hâlâ mutabakatsız").font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
                .padding(16)
            }
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Sita Yapı")
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button { showCreateAppointment = true } label: {
                            Label("Randevu Oluştur", systemImage: "calendar.badge.plus")
                        }
                        Button { showQuickSale = true } label: {
                            Label("Satış", systemImage: "turkishlirasign.circle")
                        }
                    } label: {
                        Image(systemName: "plus.circle.fill")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        appState.requestLogoutConfirmation = true
                    } label: {
                        Text(String(appState.currentUser?.name.first ?? "?"))
                            .font(.caption.bold())
                            .foregroundStyle(.white)
                            .frame(width: 30, height: 30)
                            .background(.tint, in: Circle())
                    }
                }
            }
            .confirmationDialog("Çıkış yapmak istiyor musunuz?", isPresented: Binding(
                get: { appState.requestLogoutConfirmation },
                set: { appState.requestLogoutConfirmation = $0 }
            ), titleVisibility: .visible) {
                Button("Çıkış Yap", role: .destructive) { appState.logout() }
                Button("Vazgeç", role: .cancel) {}
            }
            .sheet(isPresented: $showCreateAppointment) {
                NavigationStack {
                    AppointmentCreateView(onCreated: { showCreateAppointment = false; Task { await load() } })
                }
            }
            .sheet(isPresented: $showQuickSale) {
                NavigationStack {
                    QuickSaleView()
                }
            }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var overdueCheckouts: [PartCheckout] {
        let today = todayISODate()
        return checkouts.filter { $0.status == "outstanding" && ($0.date ?? "") < today }
    }

    @ViewBuilder
    private func statPill(_ text: String) -> some View {
        Text(text).font(.caption).foregroundStyle(.secondary)
    }

    private var pendingCollection: Double {
        todayAppts
            .filter { $0.status != "cancelled" && $0.feeAmount != nil && $0.feePaid != true }
            .reduce(0) { $0 + ($1.feeAmount ?? 0) }
    }

    private var weekCompletionRate: Int {
        let relevant = weekAppts.filter { $0.status != "cancelled" }
        guard !relevant.isEmpty else { return 0 }
        let completed = relevant.filter { $0.status == "completed" }.count
        return Int((Double(completed) / Double(relevant.count) * 100).rounded())
    }

    private var statsStrip: some View {
        HStack(spacing: 0) {
            statItem(value: pendingCollection.formatted(.currency(code: "TRY").precision(.fractionLength(0))), label: "Bekleyen Tahsilat", color: pendingCollection == 0 ? .green : .primary)
            Divider().frame(height: 30)
            statItem(value: "%\(weekCompletionRate)", label: "Bu Hafta Tamamlandı", color: .primary)
            Divider().frame(height: 30)
            statItem(value: "\(lowStockItems.count)", label: "Kritik Stok", color: lowStockItems.isEmpty ? .green : .red)
        }
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }

    private func statItem(value: String, label: String, color: Color) -> some View {
        VStack(spacing: 2) {
            Text(value).font(.headline).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private func load() async {
        let today = todayISODate()
        let tomorrow = isoDate(daysFromToday: 1)
        async let todayReq: [Appointment] = APIClient.shared.get("/appointments/by-date/\(today)")
        async let tomorrowReq: [Appointment] = APIClient.shared.get("/appointments/by-date/\(tomorrow)")
        async let weekReq: [[Appointment]] = withThrowingTaskGroup(of: (Int, [Appointment]).self) { group in
            for offset in 0...6 {
                group.addTask {
                    let date = isoDate(daysFromToday: -offset)
                    let appts: [Appointment] = (try? await APIClient.shared.get("/appointments/by-date/\(date)")) ?? []
                    return (offset, appts)
                }
            }
            var results = [Int: [Appointment]]()
            for try await (offset, appts) in group { results[offset] = appts }
            return (0...6).map { results[$0] ?? [] }
        }
        async let quotesReq: [Quote] = APIClient.shared.get("/quotes")
        async let checkoutsReq: [PartCheckout] = APIClient.shared.get("/part-checkouts")
        async let techsReq: [Technician] = APIClient.shared.get("/technicians")
        async let stockReq = StockCache.shared.all()

        todayAppts = (try? await todayReq) ?? []
        tomorrowAppts = (try? await tomorrowReq) ?? []
        weekAppts = ((try? await weekReq) ?? []).flatMap { $0 }
        quotes = ((try? await quotesReq) ?? []).sorted { ($0.quoteDate ?? "") > ($1.quoteDate ?? "") }
        checkouts = (try? await checkoutsReq) ?? []
        technicians = (try? await techsReq) ?? []
        let stock = (try? await stockReq) ?? []
        lowStockItems = stock.filter { item in
            let threshold = item.lowStockThreshold ?? 2
            return (item.quantity ?? 0) <= threshold
        }
    }
}

func isoDate(daysFromToday offset: Int) -> String {
    let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    return formatter.string(from: date)
}

func todayISODate() -> String {
    isoDate(daysFromToday: 0)
}

private struct HomeWidgetCard<Content: View>: View {
    let title: String
    let systemImage: String
    let tint: Color
    let onTap: () -> Void
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onTap) {
                Label(title, systemImage: systemImage)
                    .font(.subheadline.bold())
                    .foregroundStyle(tint)
            }
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
    }
}

/// ~10 binlik stok listesinin web sürümündeki gibi tek seferlik önbelleği.
actor StockCache {
    static let shared = StockCache()
    private var cached: [StockItem]?

    func all() async throws -> [StockItem] {
        if let cached { return cached }
        let items: [StockItem] = try await APIClient.shared.get("/stock")
        cached = items
        return items
    }

    func invalidate(id: String, newQuantity: Double) {
        guard var items = cached, let idx = items.firstIndex(where: { $0.id == id }) else { return }
        items[idx].quantity = newQuantity
        cached = items
    }
}
