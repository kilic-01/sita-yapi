import SwiftUI
import MapKit

/// Desktop'taki MapPage.jsx Google Maps JS SDK + API anahtarı kullanıyor;
/// native tarafta buna hiç gerek yok — Apple'ın kendi MapKit'i (gerçek
/// "Apple uygulaması" deneyiminin bir parçası) ve randevularda zaten var
/// olan lat/lng alanları yeterli, yeniden geocode etmiyoruz.
struct MapTabView: View {
    @State private var appointments: [Appointment] = []
    @State private var shopLocation: ShopLocation?
    @State private var isLoading = true
    @State private var errorMessage: String?
    @State private var selected: Appointment?
    @State private var cameraPosition: MapCameraPosition = .automatic
    // Masaüstündeki MapPage.jsx'te zaten bir tarih seçici var (bkz.
    // selectedDate) — burada sadece "bugün" sabit kodlanmıştı, dev
    // veritabanında bugüne ait randevu yoksa harita hep boş görünüyordu ve
    // kullanıcının başka bir güne geçmesinin hiçbir yolu yoktu.
    @State private var selectedDate = Date()
    private var selectedDateISO: String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.timeZone = .current
        return formatter.string(from: selectedDate)
    }

    var body: some View {
        ZStack(alignment: .top) {
            Map(position: $cameraPosition, selection: $selected) {
                if let shop = shopLocation {
                    Marker("Sita Yapı", systemImage: "wrench.and.screwdriver.fill", coordinate: CLLocationCoordinate2D(latitude: shop.lat, longitude: shop.lng))
                        .tint(.indigo)
                }
                ForEach(pinned) { appt in
                    Marker(appt.customerName ?? "Randevu", systemImage: "mappin", coordinate: CLLocationCoordinate2D(latitude: appt.lat!, longitude: appt.lng!))
                        .tint(color(for: appt.status))
                        .tag(appt)
                }
            }
            .mapControls {
                MapUserLocationButton()
                MapCompass()
            }
            .ignoresSafeArea(edges: .bottom)

            if isLoading {
                ProgressView().padding(10).background(.regularMaterial, in: Capsule()).padding(.top, 8)
            } else if let errorMessage {
                Text(errorMessage).font(.caption).padding(10).background(.regularMaterial, in: Capsule()).padding(.top, 8)
            } else if pinned.isEmpty {
                Text("Bu tarihte konumlu randevu yok.").font(.caption).padding(10).background(.regularMaterial, in: Capsule()).padding(.top, 8)
            }
        }
        .navigationTitle("Harita")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                DatePicker("Tarih", selection: $selectedDate, displayedComponents: .date)
                    .labelsHidden()
            }
        }
        .sheet(item: $selected) { appt in
            MapAppointmentSheet(appointment: appt)
                .presentationDetents([.height(220)])
        }
        .task(id: selectedDateISO) { await load() }
    }

    private var pinned: [Appointment] {
        appointments.filter { $0.lat != nil && $0.lng != nil }
    }

    private func color(for status: String?) -> Color {
        switch status {
        case "completed": return .green
        case "cancelled": return .red
        case "routed": return .blue
        default: return .orange
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let apptsReq: [Appointment] = APIClient.shared.get("/appointments/by-date/\(selectedDateISO)")
            async let shopReq: ShopLocation = APIClient.shared.get("/shop-location")
            let (appts, shop) = try await (apptsReq, shopReq)
            appointments = appts
            // Kamera SADECE dükkan konumu ilk yüklendiğinde ortalanır — tarih
            // değiştirmek kullanıcının o anki yakınlaştırma/kaydırmasını
            // sıfırlamamalı.
            if shopLocation == nil {
                cameraPosition = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: shop.lat, longitude: shop.lng), span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)))
            }
            shopLocation = shop
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

private struct MapAppointmentSheet: View {
    let appointment: Appointment

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(appointment.customerName ?? "(isimsiz)").font(.title3.bold())
            if let address = appointment.address, !address.isEmpty {
                Label(address, systemImage: "mappin.circle.fill").font(.subheadline).foregroundStyle(.secondary)
            }
            if let phone = appointment.customerPhone, !phone.isEmpty {
                if let url = phone.telURL {
                    Link(destination: url) {
                        Label(phone, systemImage: "phone.fill")
                    }
                } else {
                    Label(phone, systemImage: "phone.fill")
                }
            }
            if let url = appointment.directionsURL {
                Link(destination: url) {
                    Label("Yol Tarifi", systemImage: "arrow.triangle.turn.up.right.diamond.fill")
                }
            }
            Spacer()
        }
        .padding(20)
    }
}
