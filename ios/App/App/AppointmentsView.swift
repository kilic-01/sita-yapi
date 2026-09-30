import SwiftUI

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

struct AppointmentsView: View {
    @Environment(AppState.self) private var appState
    @State private var date: Date = Date()
    @State private var appointments: [Appointment] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var loadSeq = 0

    var body: some View {
        NavigationStack {
            List {
                DatePicker("Tarih", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.compact)
                    .environment(\.locale, Locale(identifier: "tr_TR"))

                if isLoading {
                    ProgressView()
                } else if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else if appointments.isEmpty {
                    Text("Bu tarihte randevu yok.").foregroundStyle(.secondary)
                } else {
                    ForEach(sortedAppointments) { appt in
                        NavigationLink(value: appt) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(appt.customerName ?? "(isimsiz)").font(.headline)
                                Text(appt.address ?? "").font(.subheadline).foregroundStyle(.secondary)
                                Text(statusLabels[appt.status ?? ""] ?? appt.status ?? "—")
                                    .font(.caption.bold())
                                    .foregroundStyle(statusColor(appt.status))
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
            .navigationTitle("Randevular")
            .navigationDestination(for: Appointment.self) { appt in
                AppointmentDetailView(appointment: appt, onStatusChanged: { updated in
                    if let idx = appointments.firstIndex(where: { $0.id == updated.id }) {
                        appointments[idx] = updated
                    }
                })
            }
            .task(id: date) { await load() }
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
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Randevular yüklenemedi."
        }
    }
}

extension Appointment: Hashable {
    static func == (lhs: Appointment, rhs: Appointment) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct AppointmentDetailView: View {
    @Environment(AppState.self) private var appState
    let appointment: Appointment
    let onStatusChanged: (Appointment) -> Void

    @State private var current: Appointment
    @State private var isUpdating = false
    @State private var errorMessage: String?

    init(appointment: Appointment, onStatusChanged: @escaping (Appointment) -> Void) {
        self.appointment = appointment
        self.onStatusChanged = onStatusChanged
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
            Section {
                if let phone = current.customerPhone, !phone.isEmpty {
                    LabeledContent("Telefon") {
                        Link(phone, destination: URL(string: "tel:\(phone)")!)
                    }
                }
                LabeledContent("Durum") {
                    Text(statusLabels[current.status ?? ""] ?? current.status ?? "—")
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
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Durum güncellenemedi."
        }
    }
}
