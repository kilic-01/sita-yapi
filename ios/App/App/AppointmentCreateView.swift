import SwiftUI

/// Desktop'taki AppointmentForm.jsx'in tam eşdeğeri değil — ücret kalemleri,
/// müşteri geçmişi eşleştirme gibi kapsamlı özellikler burada yok (bunlar iş
/// zamanlanırken değil, iş tamamlanırken/masaüstünde girilen ayrıntılar).
/// İl/ilçe/mahalle seçimi İSE var — electron/geocodeQuery.js'teki
/// buildGeocodeAttempts bu alanlar olmadan geocoding'i hiç denemiyor, düz
/// metin adres tek başına Harita özelliğini kullanılamaz kılıyordu.
struct AppointmentCreateView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss
    let onCreated: () -> Void

    @State private var customerName = ""
    @State private var customerPhone = ""
    @State private var contactName = ""
    @State private var internalNote = ""
    // Telefon/isim yazılınca aynı müşterinin önceki servisleri (masaüstündeki uyarı gibi).
    @State private var history: [Appointment] = []
    @State private var addressDetail = AddressDetail()
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
                TextField("Muhatap Kişi (opsiyonel)", text: $contactName)
            }
            if !history.isEmpty {
                Section {
                    ForEach(history.prefix(3)) { a in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(a.scheduledDate ?? "—").font(.caption.bold())
                            Text(a.complaint?.isEmpty == false ? a.complaint! : "(şikâyet yok)")
                                .font(.caption).foregroundStyle(.secondary).lineLimit(2)
                        }
                    }
                    if history.count > 3 {
                        Text("+\(history.count - 3) ziyaret daha").font(.caption).foregroundStyle(.secondary)
                    }
                } header: {
                    Label("Bu müşteri daha önce \(history.count) kez servis almış", systemImage: "clock.arrow.circlepath")
                        .foregroundStyle(.orange)
                }
            }
            Section("Adres") {
                AddressDetailFields(detail: $addressDetail)
            }
            Section("İş") {
                TextField("Şikayet / Not", text: $complaint, axis: .vertical)
                    .lineLimit(2...4)
                TextField("Not (yalnız bize görünür, müşteriye gösterilmez)", text: $internalNote, axis: .vertical)
                    .lineLimit(1...3)
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
                .disabled(customerName.trimmingCharacters(in: .whitespaces).isEmpty || composeAddress(addressDetail).isEmpty || isSaving)
            }
        }
        .task {
            technicians = ((try? await APIClient.shared.get("/technicians")) ?? []).filter { $0.assignable != false }
        }
        .task(id: customerPhone + "|" + customerName) { await loadHistory() }
    }

    private func loadHistory() async {
        let phone = customerPhone.filter(\.isNumber)
        let name = customerName.trimmingCharacters(in: .whitespaces)
        guard phone.count >= 10 || name.count >= 3 else { history = []; return }
        try? await Task.sleep(for: .milliseconds(500))
        guard !Task.isCancelled else { return }
        var query = URLComponents()
        query.queryItems = phone.count >= 10
            ? [URLQueryItem(name: "phone", value: customerPhone.trimmingCharacters(in: .whitespaces))]
            : [URLQueryItem(name: "name", value: name)]
        if let result: [Appointment] = try? await APIClient.shared.get("/appointments/by-customer?\(query.percentEncodedQuery ?? "")"),
           !Task.isCancelled {
            history = result
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
                address: composeAddress(addressDetail),
                addressDetail: addressDetail,
                scheduledDate: formatter.string(from: date),
                customerPhone: customerPhone,
                complaint: complaint,
                urgency: isUrgent ? "acil" : "normal",
                assignedTechnicianId: assignedTechId,
                actingUserId: appState.currentUser?.id ?? "",
                contactName: contactName.trimmingCharacters(in: .whitespaces),
                internalNote: internalNote.trimmingCharacters(in: .whitespaces)
            )
            // POST /appointments düz Appointment değil {appointment, ...}
            // sarmalayıcısı dönüyor (bkz. Models.swift AppointmentSaveResponse)
            // — bunu atlayıp doğrudan Appointment'a decode etmeye çalışmak
            // (önceki hal) her randevu oluşturmada "Sunucu yanıtı okunamadı"
            // hatası veriyordu, oysa kayıt aslında sunucuda oluşuyordu.
            let _: AppointmentSaveResponse = try await APIClient.shared.post("/appointments", body: body)
            Haptics.success()
            onCreated()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}
