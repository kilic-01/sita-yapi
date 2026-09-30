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
                Text("Bugün konumlu randevu yok.").font(.caption).padding(10).background(.regularMaterial, in: Capsule()).padding(.top, 8)
            }
        }
        .navigationTitle("Harita")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(item: $selected) { appt in
            MapAppointmentSheet(appointment: appt)
                .presentationDetents([.height(220)])
        }
        .task { await load() }
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
            async let apptsReq: [Appointment] = APIClient.shared.get("/appointments/by-date/\(todayISODate())")
            async let shopReq: ShopLocation = APIClient.shared.get("/shop-location")
            let (appts, shop) = try await (apptsReq, shopReq)
            appointments = appts
            shopLocation = shop
            cameraPosition = .region(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: shop.lat, longitude: shop.lng), span: MKCoordinateSpan(latitudeDelta: 0.15, longitudeDelta: 0.15)))
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Harita verisi yüklenemedi."
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
            Spacer()
        }
        .padding(20)
    }
}
