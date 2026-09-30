import SwiftUI

/// Desktop'taki RouteBuilder.jsx'in native karşılığı — POST /api/routes,
/// backend'de Google Maps geocoding + en yakın-komşu kümeleme ile o günün
/// randevularını teknisyenlere otomatik dağıtıp sıralıyor (bkz.
/// electron/handlers.js buildRoutes). Google Maps API anahtarı tanımlı
/// değilse backend açık bir hata mesajıyla reddediyor, aynen gösteriyoruz.
struct RouteGroup: Decodable, Identifiable {
    let technician: Technician
    let stops: [Appointment]
    var id: String { technician.id }
}

struct BuildRoutesResponse: Decodable {
    let routes: [RouteGroup]
    let skippedCount: Int?
    let skippedCustomers: [String]?
}

struct RouteBuilderView: View {
    @Environment(AppState.self) private var appState
    @State private var date: Date = Calendar.current.date(byAdding: .day, value: 1, to: Date()) ?? Date()
    @State private var isBuilding = false
    @State private var result: BuildRoutesResponse?
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                DatePicker("Tarih", selection: $date, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "tr_TR"))
                Button {
                    Task { await build() }
                } label: {
                    if isBuilding {
                        HStack { ProgressView(); Text("Rota oluşturuluyor…") }
                    } else {
                        Label("Rota Oluştur", systemImage: "wand.and.stars")
                    }
                }
                .disabled(isBuilding)
            } footer: {
                Text("Konumu belirlenmiş, henüz tamamlanmamış randevuları müsait teknisyenlere en yakın komşu mantığıyla otomatik dağıtır.")
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }

            if let result {
                if let skippedCount = result.skippedCount, skippedCount > 0 {
                    Section {
                        Label("\(skippedCount) randevu atanamadı", systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                        ForEach(result.skippedCustomers ?? [], id: \.self) { name in
                            Text(name).font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                ForEach(result.routes) { group in
                    Section("\(group.technician.name) · \(group.stops.count) durak") {
                        if group.stops.isEmpty {
                            Text("Durak yok").foregroundStyle(.secondary)
                        } else {
                            ForEach(sortedStops(group.stops)) { stop in
                                NavigationLink(value: stop) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text("\((stop.stopOrder ?? 0) + 1). \(stop.customerName ?? "(isimsiz)")")
                                            .font(.subheadline.bold())
                                        Text(stop.address ?? "").font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Rota Oluştur")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func sortedStops(_ stops: [Appointment]) -> [Appointment] {
        stops.sorted { ($0.stopOrder ?? 0) < ($1.stopOrder ?? 0) }
    }

    private func build() async {
        isBuilding = true
        errorMessage = nil
        result = nil
        defer { isBuilding = false }
        do {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            let dateStr = formatter.string(from: date)
            struct Body: Encodable { let scheduledDate: String; let actingUserId: String }
            result = try await APIClient.shared.post(
                "/routes",
                body: Body(scheduledDate: dateStr, actingUserId: appState.currentUser?.id ?? "")
            )
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Rota oluşturulamadı."
        }
    }
}
