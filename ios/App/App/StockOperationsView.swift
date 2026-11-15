import SwiftUI

/// Yeni ürün eklerken ("StockCreateView") depo dağılımını satır satır
/// düzenlemek için — Encodable "StockDepotAllocation"ın aksine burada metin
/// girişi sırasında geçersiz/boş değerler tutulabilsin diye miktar String.
struct DepotRow: Identifiable {
    let id = UUID()
    var depotId: String?
    // "0" DEĞİL boş string: metin alanı dolu bir "0" ile başlarsa (ve
    // dokunulduğunda imleç bunun SONUNA gelirse) kullanıcı yazdığı her
    // rakam o sabit "0"nın önüne ekleniyor ("5" yazınca "05", sonra "12"
    // yazınca "0512" gibi) — hiçbir zaman gerçekten temiz bir sayı elde
    // edilemiyordu ve Ekle/Kaydet butonu "miktar > 0" kontrolünden hep
    // takılı kalıyordu. Boşken TextField'ın ilk parametresi ("Miktar")
    // zaten placeholder olarak görünüyor, 0 toplam hesaplarında "Int("") ?? 0"
    // ile zaten doğru yorumlanıyor.
    var quantity: String = ""
}

/// Desktop'taki StockPage.jsx "Depo Dağılımı" satır listesi editörünün native
/// karşılığı — hem "Yeni Ürün Ekle" formunda hem (ileride) başka yerlerde
/// aynı satır ekleme/kaldırma mantığı tekrarlanmasın diye.
struct DepotRowsEditorView: View {
    @Binding var rows: [DepotRow]
    let depots: [Depot]

    var body: some View {
        ForEach($rows) { $row in
            HStack {
                // "pickerStyle(.menu)" OLMADAN varsayılan Picker, bir
                // Form satırında HStack içinde dahi görünür etiketinden çok
                // daha geniş bir dokunma alanı kaplıyordu — kullanıcı yanındaki
                // "Miktar" kutusuna dokunmak istediğinde bu Picker'ı
                // tetikliyordu (adet hiç girilemiyordu). Menü stiline
                // sabitlemek dokunma alanını kendi görünür etiketine indiriyor.
                Picker("Depo", selection: $row.depotId) {
                    Text("Seçin…").tag(String?.none)
                    ForEach(depots) { depot in
                        Text(depot.name ?? "(isimsiz)").tag(Optional(depot.id))
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
                TextField("Miktar", text: $row.quantity)
                    .keyboardType(.numberPad)
                    .frame(width: 70)
                    .multilineTextAlignment(.trailing)
            }
        }
        .onDelete { rows.remove(atOffsets: $0) }
        if rows.count < depots.count {
            Button {
                let used = Set(rows.compactMap { $0.depotId })
                if let next = depots.first(where: { !used.contains($0.id) }) {
                    rows.append(DepotRow(depotId: next.id, quantity: ""))
                }
            } label: {
                Label("Depo Ekle", systemImage: "plus")
            }
        }
        if !rows.isEmpty {
            let total = rows.reduce(0) { $0 + (Int($1.quantity) ?? 0) }
            Text("Toplam: \(total)").font(.caption).foregroundStyle(.secondary)
        }
    }
}

/// Bir depodaki ürünü başka bir depoya kaydırmak için — ör. depodaki bir
/// ürünü dükkana teşhir/satış için getirme. Desktop'taki StockPage.jsx
/// "Depo Transferi" modalının karşılığı.
struct StockTransferView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    let item: StockItem
    let depots: [Depot]
    let onDone: (StockItem) -> Void

    @State private var rows: [StockItemDepot] = []
    @State private var isLoading = true
    @State private var fromDepotId: String?
    @State private var toDepotId: String?
    @State private var qty = ""
    @State private var isSubmitting = false
    @State private var errorMessage: String?

    private var availableInFrom: Int {
        Int(rows.first { $0.depotId == fromDepotId }?.quantity ?? 0)
    }

    var body: some View {
        Form {
            if isLoading {
                ProgressView()
            } else {
                Section("Kaynak Depo") {
                    Picker("Kaynak Depo", selection: $fromDepotId) {
                        Text("Seçin…").tag(String?.none)
                        ForEach(rows.filter { ($0.quantity ?? 0) > 0 }) { row in
                            Text("\(depotName(row.depotId) ?? "Bilinmeyen depo") (\(Int(row.quantity ?? 0)) adet)")
                                .tag(Optional(row.depotId ?? ""))
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                }
                Section("Hedef Depo") {
                    Picker("Hedef Depo", selection: $toDepotId) {
                        Text("Seçin…").tag(String?.none)
                        ForEach(depots.filter { $0.id != fromDepotId }) { depot in
                            Text(depot.name ?? "(isimsiz)").tag(Optional(depot.id))
                        }
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                }
                Section("Miktar") {
                    TextField("Miktar", text: $qty)
                        .keyboardType(.numberPad)
                        .font(.title2.bold())
                    if fromDepotId != nil {
                        Text("Kaynakta \(availableInFrom) adet var.").font(.caption).foregroundStyle(.secondary)
                    }
                }
                if rows.filter({ ($0.quantity ?? 0) > 0 }).isEmpty {
                    Text("Bu ürün hiçbir depoda stokta değil — transfer edilecek bir şey yok.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Depo Transferi")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await submit() }
                } label: {
                    if isSubmitting { ProgressView() } else { Text("Kaydet").bold() }
                }
                .disabled(
                    fromDepotId == nil || toDepotId == nil || fromDepotId == toDepotId
                        || !((Int(qty) ?? 0) > 0) || (Int(qty) ?? 0) > availableInFrom || isSubmitting
                )
            }
        }
        .task {
            rows = (try? await APIClient.shared.get("/stock/\(item.id)/depots")) ?? []
            let firstWithStock = rows.first { ($0.quantity ?? 0) > 0 }
            fromDepotId = firstWithStock?.depotId
            toDepotId = depots.first { $0.id != firstWithStock?.depotId }?.id
            isLoading = false
        }
    }

    private func depotName(_ id: String?) -> String? {
        depots.first { $0.id == id }?.name
    }

    private func submit() async {
        guard let fromDepotId, let toDepotId, let qtyInt = Int(qty), qtyInt > 0 else { return }
        isSubmitting = true
        errorMessage = nil
        defer { isSubmitting = false }
        do {
            let updated: StockItem = try await APIClient.shared.post(
                "/stock/\(item.id)/transfer",
                body: StockTransferBody(
                    fromDepotId: fromDepotId,
                    toDepotId: toDepotId,
                    qty: Double(qtyInt),
                    actingUserId: appState.currentUser?.id ?? ""
                )
            )
            _ = try? await StockCache.shared.reload()
            onDone(updated)
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

/// Ürün sayfasındaki "info" butonu açıyor — kim stok adedini değiştirdi,
/// kaçtan kaça (eklendi/çıkarıldı), ya da depolar arasında ne kadar ürün
/// taşındı, hepsi burada tek tek listeleniyor. Desktop'taki StockPage.jsx
/// "Stok Geçmişi" modalının karşılığı.
struct StockHistoryView: View {
    @Environment(\.dismiss) private var dismiss
    let item: StockItem

    @State private var entries: [ActivityLogEntry] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else if entries.isEmpty {
                Text("Bu ürün için kayıtlı bir işlem yok.").foregroundStyle(.secondary)
            } else {
                ForEach(entries) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(entry.description ?? "").font(.subheadline)
                        // Sunucu ISO 8601 zaman damgası döndürüyor — uygulamanın
                        // başka hiçbir yerinde (bkz. ActivityLogEntry/ChatMessage)
                        // bunu Date'e çevirip yeniden biçimlendirmiyoruz, aynı
                        // basit yaklaşım: ilk 16 karakteri okunur hale getir.
                        if let createdAt = entry.createdAt, createdAt.count >= 16 {
                            Text(String(createdAt.prefix(16)).replacingOccurrences(of: "T", with: " "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle("Stok Geçmişi")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Kapat") { dismiss() }
            }
        }
        .task {
            do {
                entries = try await APIClient.shared.get("/stock/\(item.id)/activity")
            } catch {
                errorMessage = error.turkishMessage
            }
            isLoading = false
        }
    }
}
