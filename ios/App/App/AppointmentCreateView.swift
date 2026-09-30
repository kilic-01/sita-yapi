import SwiftUI

/// Desktop'taki AppointmentForm.jsx'in tam eşdeğeri değil — ücret kalemleri,
/// il/ilçe/mahalle adres ayrıştırması, müşteri geçmişi eşleştirme gibi
/// kapsamlı özellikler burada yok (bunlar iş zamanlanırken değil, iş
/// tamamlanırken/masaüstünde girilen ayrıntılar). Bu, sahadan hızlıca yeni
/// bir randevu açmak için gereken temel alanları içerir — backend'in kabul
/// ettiği minimum zorunlu alanlar zaten sadece customerName + address +
/// scheduledDate (bkz. electron/db.js addAppointment).
struct AppointmentCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var customerName = ""
    @State private var customerPhone = ""
    @State private var address = ""
    @State private var complaint = ""
    @State private var date = Date()
    @State private var isUrgent = false
    @State private var technicians: [Technician] = []
    @State private var assignedTechId: String?
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        Form {
            Section("Müşteri") {
                TextField("Müşteri Adı", text: $customerName)
                TextField("Telefon", text: $customerPhone)
                    .keyboardType(.phonePad)
            }
            Section("Adres") {
                TextField("Adres", text: $address, axis: .vertical)
                    .lineLimit(3...6)
            }
            Section("İş") {
                TextField("Şikayet / Not", text: $complaint, axis: .vertical)
                    .lineLimit(2...4)
                DatePicker("Tarih", selection: $date, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "tr_TR"))
                Toggle("Acil", isOn: $isUrgent)
                Picker("Teknisyen", selection: $assignedTechId) {
                    Text("Atanmamış").tag(String?.none)
                    ForEach(technicians) { tech in
                        Text(tech.name).tag(Optional(tech.id))
                    }
                }
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
        }
        .navigationTitle("Randevu Oluştur")
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
                .disabled(customerName.trimmingCharacters(in: .whitespaces).isEmpty || address.trimmingCharacters(in: .whitespaces).isEmpty || isSaving)
            }
        }
        .task {
            technicians = ((try? await APIClient.shared.get("/technicians")) ?? []).filter { $0.assignable != false }
        }
    }

    private func submit() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        do {
            let body = NewAppointment(
                customerName: customerName.trimmingCharacters(in: .whitespaces),
                address: address.trimmingCharacters(in: .whitespacesAndNewlines),
                scheduledDate: formatter.string(from: date),
                customerPhone: customerPhone,
                complaint: complaint,
                urgency: isUrgent ? "acil" : "normal",
                assignedTechnicianId: assignedTechId,
                actingUserId: appState.currentUser?.id ?? ""
            )
            let _: Appointment = try await APIClient.shared.post("/appointments", body: body)
            onCreated()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Randevu oluşturulamadı."
        }
    }
}
