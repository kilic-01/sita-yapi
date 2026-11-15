import SwiftUI

/// Desktop'taki QuotesWidget + QuotePrintView.jsx'in native karşılığı —
/// tam yazdırma şablonu değil ama aynı kalem/toplam mantığı (bkz.
/// computeQuoteTotals, src/lib/orderTotals.js ile birebir aynı).
struct QuoteListView: View {
    @State private var quotes: [Quote] = []
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var showCreate = false

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if quotes.isEmpty {
                Text("Henüz teklif oluşturulmadı.").foregroundStyle(.secondary)
            } else {
                ForEach(quotes) { quote in
                    NavigationLink(value: quote) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(quote.customerName ?? "(isimsiz)").font(.body)
                            Text([quote.quoteNo, quote.quoteDate].compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Teklifler")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showCreate = true } label: { Image(systemName: "plus.circle.fill") }
            }
        }
        .navigationDestination(for: Quote.self) { quote in
            QuoteDetailView(quote: quote, onDeleted: {
                quotes.removeAll { $0.id == quote.id }
            })
        }
        .sheet(isPresented: $showCreate) {
            NavigationStack {
                QuoteCreateView(onCreated: { Task { await load() } })
            }
        }
        .task { await load() }
        .refreshable { await load() }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            let all: [Quote] = try await APIClient.shared.get("/quotes")
            quotes = all.sorted { ($0.quoteDate ?? "") > ($1.quoteDate ?? "") }
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

extension Quote: Hashable {
    static func == (lhs: Quote, rhs: Quote) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct QuoteDetailView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let quote: Quote
    var onDeleted: () -> Void = {}
    @State private var showPrintPreview = false
    // "TV'de Göster": teklif ofis TV'sinde müşteriye gösterilir (masaüstündeki gibi).
    @State private var isBroadcasting = false
    @State private var tvMessage: String?
    @State private var showDeleteConfirm = false
    @State private var isDeleting = false

    private var totals: QuoteTotals { computeQuoteTotals(quote.items ?? []) }

    var body: some View {
        List {
            Section {
                Button {
                    showPrintPreview = true
                } label: {
                    Label("Çıktı Formatını Görüntüle", systemImage: "doc.richtext")
                }
                // TV'ye gönderilemezse küçük uyarı (başarıda alttaki yayın şeridi çıkar).
                if let tvMessage {
                    Label(tvMessage, systemImage: "exclamationmark.triangle.fill")
                        .font(.footnote).foregroundStyle(.orange)
                }
            }
            Section {
                Text(quote.customerName ?? "(isimsiz)").font(.title3.bold())
                if let contact = quote.contactName, !contact.isEmpty {
                    Text(contact).font(.subheadline).foregroundStyle(.secondary)
                }
                if let address = quote.customerAddress, !address.isEmpty {
                    Text(address).font(.subheadline).foregroundStyle(.secondary)
                }
                if let phone = quote.customerPhone, !phone.isEmpty {
                    if let url = phone.telURL {
                        Link(destination: url) {
                            Label(phone, systemImage: "phone.fill")
                        }
                    } else {
                        Label(phone, systemImage: "phone.fill")
                    }
                }
            }
            Section("Teklif Bilgisi") {
                LabeledContent("Teklif No", value: quote.quoteNo ?? "—")
                LabeledContent("Tarih", value: quote.quoteDate ?? "—")
                if let validity = quote.validityDays {
                    LabeledContent("Geçerlilik", value: "\(validity) gün")
                }
                if let preparedBy = quote.preparedBy, !preparedBy.isEmpty {
                    LabeledContent("Hazırlayan", value: preparedBy)
                }
            }
            Section("Kalemler") {
                ForEach(quote.items ?? []) { item in
                    VStack(alignment: .leading, spacing: 3) {
                        Text(item.description ?? item.code ?? "(isimsiz)").font(.subheadline)
                        HStack {
                            Text("\(formattedQty(item.qty ?? 0)) \(item.unit ?? "Adet") × \(money(item.unitPrice ?? 0))")
                                .font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Text(money(lineTotal(item))).font(.caption.bold())
                        }
                    }
                }
            }
            Section("Toplam") {
                LabeledContent("Ara Toplam", value: money(totals.araToplam))
                if totals.indirimTutari > 0 {
                    LabeledContent("İndirim", value: "-" + money(totals.indirimTutari))
                }
                LabeledContent("KDV", value: money(totals.kdvToplami))
                LabeledContent("Genel Toplam") {
                    Text(money(totals.genelToplam)).font(.headline)
                }
            }
            Section {
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    if isDeleting { ProgressView() } else { Text("Teklifi Sil") }
                }
                .disabled(isDeleting)
            }
        }
        .confirmationDialog("\(quote.quoteNo ?? "Bu teklif") silinsin mi?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Sil", role: .destructive) { Task { await deleteQuote() } }
            Button("Vazgeç", role: .cancel) {}
        } message: {
            Text("Bu işlem geri alınamaz.")
        }
        .navigationTitle(quote.quoteNo ?? "Teklif")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // "TV'de Göster": yalnız ikon (masaüstündeki AirPlay düğmesi gibi).
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await broadcastToTv() }
                } label: {
                    if isBroadcasting { ProgressView() } else { Image(systemName: "airplayvideo") }
                }
                .disabled(isBroadcasting)
                .accessibilityLabel("TV'de Göster")
            }
        }
        .navigationDestination(isPresented: $showPrintPreview) {
            QuoteWebPrintView(quote: quote)
        }
    }

    private func broadcastToTv() async {
        struct Body: Encodable { let quoteId: String; let actingUserId: String; let deviceName: String }
        struct Payload: Decodable { let sentAt: String?; let warning: String? }
        isBroadcasting = true
        tvMessage = nil
        defer { isBroadcasting = false }
        do {
            let device = [UIDevice.current.name, appState.currentUser?.name].compactMap { $0 }.joined(separator: " · ")
            let payload: Payload = try await APIClient.shared.post(
                "/tv/broadcast-quote",
                body: Body(quoteId: quote.id, actingUserId: appState.currentUser?.id ?? "", deviceName: device)
            )
            // Bazı TV'ler gösteremediyse (internet yok vb.) sunucunun uyarısı kalır.
            tvMessage = payload.warning
            if payload.warning == nil { Haptics.success() } else { Haptics.warning() }
            if let sentAt = payload.sentAt {
                appState.tvOnAir = TvOnAir(sentAt: sentAt, title: "Teklif \(quote.quoteNo ?? "")", subtitle: quote.customerName)
            }
        } catch {
            tvMessage = error.turkishMessage
        }
    }

    private func deleteQuote() async {
        isDeleting = true
        defer { isDeleting = false }
        do {
            _ = try await APIClient.shared.delete("/quotes/\(quote.id)")
            onDeleted()
            dismiss()
        } catch {
            tvMessage = error.turkishMessage
        }
    }

    private func lineTotal(_ item: QuoteItem) -> Double {
        let gross = (item.qty ?? 0) * (item.unitPrice ?? 0)
        let net = gross * (1 - (item.discountRate ?? 0) / 100)
        return net * (1 + (item.vatRate ?? 0) / 100)
    }

    private func formattedQty(_ q: Double) -> String {
        q == q.rounded() ? String(Int(q)) : String(q)
    }

    private func money(_ n: Double) -> String {
        n.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR")))
    }
}

struct QuoteCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var customerName = ""
    @State private var contactName = ""
    @State private var customerPhone = ""
    @State private var customerAddress = ""
    @State private var validityDays = 15
    @State private var items: [QuoteItem] = [QuoteItem(qty: 1, unit: "Adet", vatRate: 20, unitPrice: 0, description: "", discountRate: 0)]
    @State private var isSaving = false
    @State private var errorMessage: String?

    private var totals: QuoteTotals { computeQuoteTotals(items) }

    var body: some View {
        Form {
            Section("Müşteri") {
                TextField("Müşteri Adı", text: $customerName)
                TextField("Yetkili Kişi", text: $contactName)
                TextField("Telefon", text: $customerPhone).keyboardType(.phonePad)
                TextField("Adres", text: $customerAddress, axis: .vertical).lineLimit(2...4)
            }
            Section("Geçerlilik") {
                Stepper("Geçerlilik: \(validityDays) gün", value: $validityDays, in: 1...90)
            }
            Section("Kalemler") {
                ForEach($items) { $item in
                    VStack(alignment: .leading, spacing: 6) {
                        TextField("Açıklama", text: Binding(get: { item.description ?? "" }, set: { item.description = $0 }))
                        HStack {
                            TextField("Adet", value: Binding(get: { item.qty ?? 1 }, set: { item.qty = $0 }), format: .number)
                                .keyboardType(.decimalPad)
                                .frame(width: 60)
                            TextField("Birim Fiyat", value: Binding(get: { item.unitPrice ?? 0 }, set: { item.unitPrice = $0 }), format: .number)
                                .keyboardType(.decimalPad)
                            Text("KDV %")
                            TextField("20", value: Binding(get: { item.vatRate ?? 20 }, set: { item.vatRate = $0 }), format: .number)
                                .keyboardType(.decimalPad)
                                .frame(width: 40)
                        }
                    }
                }
                .onDelete { items.remove(atOffsets: $0) }
                Button {
                    items.append(QuoteItem(qty: 1, unit: "Adet", vatRate: 20, unitPrice: 0, description: "", discountRate: 0))
                } label: {
                    Label("Kalem Ekle", systemImage: "plus")
                }
            }
            Section("Toplam") {
                LabeledContent("Genel Toplam") {
                    Text(totals.genelToplam.formatted(.currency(code: "TRY").locale(Locale(identifier: "tr_TR")))).font(.headline)
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Yeni Teklif")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Kaydet").bold() }
                }
                .disabled(customerName.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        do {
            let body = NewQuote(
                customerName: customerName.trimmingCharacters(in: .whitespaces),
                contactName: contactName,
                customerPhone: customerPhone,
                customerEmail: "",
                customerAddress: customerAddress,
                quoteDate: formatter.string(from: Date()),
                validityDays: validityDays,
                preparedBy: appState.currentUser?.name ?? "",
                currency: "TRY",
                items: items.filter { !($0.description ?? "").isEmpty || ($0.unitPrice ?? 0) > 0 },
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: Quote = try await APIClient.shared.post("/quotes", body: body)
            onCreated()
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}
