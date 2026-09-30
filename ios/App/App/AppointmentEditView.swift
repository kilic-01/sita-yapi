import SwiftUI

/// Desktop'taki AppointmentForm'un (düzenleme modu) native karşılığı.
/// Teknisyen değişikliği bilerek PUT /appointments/:id/reassign üzerinden
/// gönderiliyor — o uç, izinli bir teknisyene atamayı sunucu tarafında
/// reddediyor ve o teknisyenin günündeki son durağa göre stopOrder'ı otomatik
/// hesaplıyor (bkz. electron/handlers.js reassignAppointment); genel PUT ile
/// bunu atlamak bu garantileri kaybettirirdi.
struct AppointmentEditView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onSaved: (Appointment) -> Void
    let onDeleted: () -> Void

    @State private var appointment: Appointment
    @State private var customerName: String
    @State private var customerPhone: String
    @State private var address: String
    @State private var complaint: String
    @State private var scheduledDate: Date
    @State private var isUrgent: Bool
    @State private var technicianId: String?

    @State private var technicians: [Technician] = []
    @State private var isSaving = false
    @State private var isDeleting = false
    @State private var errorMessage: String?
    @State private var showDeleteConfirm = false

    init(appointment: Appointment, onSaved: @escaping (Appointment) -> Void, onDeleted: @escaping () -> Void) {
        self.appointment = appointment
        self.onSaved = onSaved
        self.onDeleted = onDeleted
        _customerName = State(initialValue: appointment.customerName ?? "")
        _customerPhone = State(initialValue: appointment.customerPhone ?? "")
        _address = State(initialValue: appointment.address ?? "")
        _complaint = State(initialValue: appointment.complaint ?? "")
        _isUrgent = State(initialValue: appointment.urgency == "acil")
        _technicianId = State(initialValue: appointment.assignedTechnicianId)
        if let iso = appointment.scheduledDate, let date = Self.dateFormatter.date(from: iso) {
            _scheduledDate = State(initialValue: date)
        } else {
            _scheduledDate = State(initialValue: Date())
        }
    }

    private static let dateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    var body: some View {
        Form {
            Section("Müşteri") {
                TextField("Ad Soyad", text: $customerName)
                TextField("Telefon", text: $customerPhone).keyboardType(.phonePad)
                TextField("Adres", text: $address, axis: .vertical).lineLimit(2...5)
            }
            Section("İş") {
                TextField("Şikayet", text: $complaint, axis: .vertical).lineLimit(2...4)
                DatePicker("Tarih", selection: $scheduledDate, displayedComponents: .date)
                    .environment(\.locale, Locale(identifier: "tr_TR"))
                Toggle("Acil", isOn: $isUrgent)
            }
            Section("Teknisyen") {
                Picker("Teknisyen", selection: $technicianId) {
                    Text("Otomatik rota").tag(String?.none)
                    ForEach(technicians) { tech in
                        Text(tech.name).tag(Optional(tech.id))
                    }
                }
                .pickerStyle(.menu)
            }
            if let errorMessage {
                Text(errorMessage).foregroundStyle(.red)
            }
            Section {
                Button(role: .destructive) {
                    showDeleteConfirm = true
                } label: {
                    if isDeleting { ProgressView() } else { Text("Randevuyu Sil") }
                }
                .disabled(isDeleting || isSaving)
            }
        }
        .navigationTitle("Randevuyu Düzenle")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("İptal") { dismiss() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Task { await save() }
                } label: {
                    if isSaving { ProgressView() } else { Text("Kaydet").bold() }
                }
                .disabled(isSaving || isDeleting || customerName.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
        .confirmationDialog(
            "Bu randevu kalıcı olarak silinecek. Emin misiniz?",
            isPresented: $showDeleteConfirm,
            titleVisibility: .visible
        ) {
            Button("Sil", role: .destructive) { Task { await delete() } }
            Button("Vazgeç", role: .cancel) {}
        }
        .task {
            technicians = (try? await APIClient.shared.get("/technicians")) ?? []
        }
    }

    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let dateStr = Self.dateFormatter.string(from: scheduledDate)
            let body = EditBody(
                customerName: customerName.trimmingCharacters(in: .whitespaces),
                customerPhone: customerPhone,
                address: address,
                complaint: complaint,
                scheduledDate: dateStr,
                urgency: isUrgent ? "acil" : "normal",
                actingUserId: appState.currentUser?.id ?? "",
                technicianChanged: technicianId != appointment.assignedTechnicianId,
                assignedTechnicianId: technicianId
            )
            // PUT /appointments/:id, POST ile aynı {appointment, ...}
            // sarmalayıcısını dönüyor (bkz. Models.swift AppointmentSaveResponse).
            let response: AppointmentSaveResponse = try await APIClient.shared.put(
                "/appointments/\(appointment.id)",
                body: body
            )
            onSaved(response.appointment)
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kaydedilemedi."
        }
    }

    /// Desktop'taki AppointmentForm.jsx ile aynı davranış: assignedTechnicianId
    /// alanı sadece GERÇEKTEN değiştiyse gövdeye dahil ediliyor (`technicianChanged`
    /// false ise anahtar hiç yazılmıyor). Değiştiyse "Otomatik rota" (nil)
    /// seçimi JSON `null` olarak gönderilmeli — synthesize edilen Encodable
    /// Optional alanlarda `encodeIfPresent` kullanıp bunu sessizce atlardı,
    /// bu yüzden `encode(to:)` elle yazılıyor.
    private struct EditBody: Encodable {
        let customerName: String
        let customerPhone: String
        let address: String
        let complaint: String
        let scheduledDate: String
        let urgency: String
        let actingUserId: String
        let technicianChanged: Bool
        let assignedTechnicianId: String?

        enum CodingKeys: String, CodingKey {
            case customerName, customerPhone, address, complaint, scheduledDate, urgency, actingUserId, assignedTechnicianId
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            try c.encode(customerName, forKey: .customerName)
            try c.encode(customerPhone, forKey: .customerPhone)
            try c.encode(address, forKey: .address)
            try c.encode(complaint, forKey: .complaint)
            try c.encode(scheduledDate, forKey: .scheduledDate)
            try c.encode(urgency, forKey: .urgency)
            try c.encode(actingUserId, forKey: .actingUserId)
            if technicianChanged {
                try c.encode(assignedTechnicianId, forKey: .assignedTechnicianId)
            }
        }
    }

    private func delete() async {
        isDeleting = true
        errorMessage = nil
        defer { isDeleting = false }
        do {
            _ = try await APIClient.shared.delete("/appointments/\(appointment.id)")
            onDeleted()
            dismiss()
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Silinemedi."
        }
    }
}
