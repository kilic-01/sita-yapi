import SwiftUI

/// Desktop'taki CustomerProfilePage'in native karşılığı — GET
/// /api/appointments/by-customer (telefonla, yoksa isimle eşleştirir; bkz.
/// electron/db.js getAppointmentsByCustomer) ile o müşterinin geçmiş
/// randevularını, ve bekleyen parçalar listesini isim/telefonla filtreleyerek
/// gösterir.
struct CustomerHistoryView: View {
    let customerName: String
    let customerPhone: String
    let excludeAppointmentId: String?

    @State private var appointments: [Appointment] = []
    @State private var pendingParts: [PendingPart] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                Text(customerName).font(.title3.bold())
                if !customerPhone.isEmpty {
                    if let url = customerPhone.telURL {
                        Link(customerPhone, destination: url)
                    } else {
                        Text(customerPhone)
                    }
                }
            }
            if isLoading {
                ProgressView()
            } else if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            } else {
                if !pendingParts.isEmpty {
                    Section("Bekleyen Parçalar") {
                        ForEach(pendingParts) { part in
                            VStack(alignment: .leading, spacing: 2) {
                                Text(part.description ?? "").font(.subheadline)
                                Text(part.status == "geldi" ? "Geldi" : "Bekliyor")
                                    .font(.caption)
                                    .foregroundStyle(part.status == "geldi" ? .green : .orange)
                            }
                        }
                    }
                }
                Section("Geçmiş Randevular (\(appointments.count))") {
                    if appointments.isEmpty {
                        Text("Bu müşteriye ait başka randevu bulunamadı.").foregroundStyle(.secondary)
                    } else {
                        ForEach(appointments) { appt in
                            VStack(alignment: .leading, spacing: 2) {
                                HStack {
                                    Text(appt.scheduledDate ?? "—").font(.subheadline.bold())
                                    Spacer()
                                    Text(statusLabel(appt.status))
                                        .font(.caption.bold())
                                        .foregroundStyle(appt.status == "completed" ? .green : .secondary)
                                }
                                if let complaint = appt.complaint, !complaint.isEmpty {
                                    Text(complaint).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
        }
        .navigationTitle("Müşteri Geçmişi")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func statusLabel(_ status: String?) -> String {
        switch status {
        case "completed": return "Tamamlandı"
        case "routed": return "Rotalandı"
        case "cancelled": return "İptal"
        default: return "Bekliyor"
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            var components = URLComponents()
            components.queryItems = [
                URLQueryItem(name: "name", value: customerName),
                URLQueryItem(name: "phone", value: customerPhone),
                URLQueryItem(name: "excludeId", value: excludeAppointmentId ?? ""),
            ]
            let query = components.percentEncodedQuery ?? ""
            async let apptsTask: [Appointment] = APIClient.shared.get("/appointments/by-customer?\(query)")
            async let partsTask: [PendingPart] = APIClient.shared.get("/pending-parts")
            let (fetchedAppts, allParts) = try await (apptsTask, partsTask)
            appointments = fetchedAppts
            let normalizedPhone = customerPhone.filter(\.isNumber)
            pendingParts = allParts.filter { part in
                if !normalizedPhone.isEmpty, let partPhone = part.customerPhone, !partPhone.isEmpty {
                    return partPhone.filter(\.isNumber) == normalizedPhone
                }
                return (part.customerName ?? "").caseInsensitiveCompare(customerName) == .orderedSame
            }
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Yüklenemedi."
        }
    }
}
