import SwiftUI

/// Desktop'taki ProgramWidget'ın (src/components/homeWidgets.jsx) aynı
/// hafta şeridi görünümü: üstte 7 günlük seçilebilir gün şeridi (gün
/// sayısı rozetiyle), altında seçili günün randevu listesi (stopOrder'a
/// göre sıralı). Dokununca aynı masaüstündeki gibi randevu detayını açar.
struct ProgramWidgetView: View {
    @Environment(TabRouter.self) private var router
    @State private var weekDays: [String] = []
    @State private var appointmentsByDay: [String: [Appointment]] = [:]
    @State private var technicians: [Technician] = []
    @State private var selectedDay: String = todayISODate()
    @State private var isLoading = true
    @State private var detailAppointment: Appointment?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Button {
                router.selection = .appointments
            } label: {
                Label("Program", systemImage: "calendar.day.timeline.left")
                    .font(.subheadline.bold())
                    .foregroundStyle(.purple)
            }

            weekStrip

            if isLoading {
                ProgressView().frame(maxWidth: .infinity)
            } else {
                let dayAppointments = (appointmentsByDay[selectedDay] ?? []).sorted { ($0.stopOrder ?? 999) < ($1.stopOrder ?? 999) }
                if dayAppointments.isEmpty {
                    Text("Bu gün için randevu yok.").font(.subheadline).foregroundStyle(.secondary)
                } else {
                    VStack(spacing: 8) {
                        ForEach(dayAppointments) { appt in
                            programRow(appt)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        .sheet(item: $detailAppointment) { appt in
            NavigationStack {
                AppointmentDetailView(
                    appointment: appt,
                    onStatusChanged: { updated in
                        appointmentsByDay[selectedDay] = (appointmentsByDay[selectedDay] ?? []).map { $0.id == updated.id ? updated : $0 }
                    },
                    onDeleted: {
                        appointmentsByDay[selectedDay]?.removeAll { $0.id == appt.id }
                    }
                )
            }
        }
        .task { await load() }
    }

    private var weekStrip: some View {
        HStack(spacing: 6) {
            ForEach(weekDays, id: \.self) { iso in
                let isSelected = iso == selectedDay
                let count = appointmentsByDay[iso]?.count ?? 0
                Button {
                    selectedDay = iso
                } label: {
                    VStack(spacing: 2) {
                        if count > 0 {
                            Text("\(count)")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white)
                                .padding(3)
                                .background(isSelected ? .white.opacity(0.3) : Color.accentColor, in: Circle())
                        } else {
                            Color.clear.frame(width: 14, height: 14)
                        }
                        Text(dowShort(iso)).font(.caption2).foregroundStyle(isSelected ? .white : .secondary)
                        Text(dayNumber(iso)).font(.subheadline.bold()).foregroundStyle(isSelected ? .white : .primary)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(isSelected ? AnyShapeStyle(Color.accentColor) : AnyShapeStyle(.clear), in: RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func programRow(_ appt: Appointment) -> some View {
        let tech = technicians.first { $0.id == appt.assignedTechnicianId }
        return Button {
            detailAppointment = appt
        } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 2)
                    .fill(tech != nil ? Color.accentColor : Color.gray.opacity(0.3))
                    .frame(width: 4)
                Image(systemName: "clock").font(.caption).foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 2) {
                    Text((appt.customerName ?? "(isimsiz)") + (appt.status == "completed" ? " ✔" : ""))
                        .font(.subheadline)
                        .foregroundStyle(.primary)
                        .opacity(appt.status == "completed" ? 0.55 : 1)
                    Text(appt.complaint?.isEmpty == false ? String((appt.complaint ?? "").prefix(70)) : (appt.address ?? ""))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
                Spacer()
                if let tech {
                    Text(String(tech.name.first ?? "?"))
                        .font(.caption2.bold())
                        .foregroundStyle(.white)
                        .frame(width: 24, height: 24)
                        .background(Color.accentColor, in: Circle())
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func dowShort(_ iso: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: iso) else { return "" }
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.setLocalizedDateFormatFromTemplate("EEE")
        return formatter.string(from: date)
    }

    private func dayNumber(_ iso: String) -> String {
        String(iso.suffix(2))
    }

    private func load() async {
        isLoading = true
        let monday = startOfWeekISODate()
        let days = (0...6).map { isoDate(fromISO: monday, plusDays: $0) }
        weekDays = days
        async let techsReq: [Technician] = APIClient.shared.get("/technicians")
        var results: [String: [Appointment]] = [:]
        await withTaskGroup(of: (String, [Appointment]).self) { group in
            for day in days {
                group.addTask {
                    let appts: [Appointment] = (try? await APIClient.shared.get("/appointments/by-date/\(day)")) ?? []
                    return (day, appts)
                }
            }
            for await (day, appts) in group { results[day] = appts }
        }
        appointmentsByDay = results
        technicians = (try? await techsReq) ?? []
        isLoading = false
    }
}

/// Pazartesi başlangıçlı hafta — desktop'taki startOfWeekISO ile aynı mantık.
func startOfWeekISODate() -> String {
    var calendar = Calendar(identifier: .gregorian)
    calendar.firstWeekday = 2 // Pazartesi
    let today = Date()
    let weekday = calendar.component(.weekday, from: today) // 1=Paz..7=Cmt
    let diff = weekday == 1 ? -6 : 2 - weekday
    let monday = calendar.date(byAdding: .day, value: diff, to: today) ?? today
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    return formatter.string(from: monday)
}

func isoDate(fromISO iso: String, plusDays days: Int) -> String {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd"
    formatter.timeZone = .current
    guard let base = formatter.date(from: iso) else { return iso }
    let date = Calendar.current.date(byAdding: .day, value: days, to: base) ?? base
    return formatter.string(from: date)
}
