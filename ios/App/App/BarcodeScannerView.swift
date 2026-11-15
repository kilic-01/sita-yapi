import SwiftUI
import VisionKit
import UIKit
import AVFoundation

/// Stok/Zimmet/Satış ekranlarının ortak barkod tarama sayfası — VisionKit'in
/// canlı DataScannerViewController'ını tam ekran sunar. Simülatörde gerçek
/// kamera olmadığı için DataScannerViewController.isSupported daima false
/// döner — bu yüzden aynı sayfa, kamera yoksa/izin yoksa elle barkod girişine
/// düşen bir yedek sunuyor (fiziksel cihazda hiç görünmez).
///
/// Bilerek tek okumalık: bir barkod okunduğunda sayfa hemen kapanıyor. Hızlı
/// Satış'ta birden fazla ürün eklemek için "sürekli açık kalan tarayıcı"
/// denendi, ama kamera aynı barkodu görmeye devam ettikçe art arda/kontrolsüz
/// okuyordu — kullanıcı her ürün için bilerek "Barkod ile Ürün Ekle"ye
/// tekrar basmayı tercih etti, bu çok daha öngörülebilir.
struct BarcodeScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    let onScan: (String) -> Void

    @State private var manualCode = ""
    @State private var scanStartFailed = false

    // "isAvailable" sadece donanım/yazılım desteğini kontrol ediyor, kamera
    // İZNİNİ DEĞİL — izin reddedilmişse bu hâlâ true dönüyor, tarayıcı açılıp
    // kameradan hiç görüntü gelmeden sessizce takılı kalıyordu (ne ürün
    // ekleniyor ne "bulunamadı" uyarısı çıkıyordu, çünkü hiçbir barkod asla
    // okunamıyordu). İzin durumunu burada AYRICA kontrol ediyoruz.
    private var cameraAvailable: Bool {
        DataScannerViewController.isSupported
            && DataScannerViewController.isAvailable
            && AVCaptureDevice.authorizationStatus(for: .video) != .denied
            && AVCaptureDevice.authorizationStatus(for: .video) != .restricted
    }

    var body: some View {
        NavigationStack {
            Group {
                if scanStartFailed {
                    cameraErrorFallback
                } else if cameraAvailable {
                    ScannerRepresentable(
                        onScan: { code in dismissThenReport(code) },
                        onStartFailed: { scanStartFailed = true }
                    )
                    .ignoresSafeArea()
                } else {
                    manualEntryFallback
                }
            }
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("İptal") { dismiss() }
                }
            }
        }
    }

    private var manualEntryFallback: some View {
        Form {
            Section {
                if AVCaptureDevice.authorizationStatus(for: .video) == .denied
                    || AVCaptureDevice.authorizationStatus(for: .video) == .restricted {
                    Label("Kameraya erişim izni verilmemiş.", systemImage: "camera.fill.badge.ellipsis")
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                    Button("Ayarlar'da İzni Aç") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                } else {
                    Label("Bu cihazda/simülatörde kamera taraması kullanılamıyor.", systemImage: "camera.fill.badge.ellipsis")
                        .foregroundStyle(.secondary)
                        .font(.footnote)
                }
            }
            Section("Barkod Numarasını Gir") {
                TextField("Barkod", text: $manualCode)
                    .keyboardType(.numberPad)
                    .submitLabel(.search)
                    .onSubmit { submitManual() }
                Button("Ara") { submitManual() }
                    .disabled(manualCode.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    /// `startScanning()` beklenmedik şekilde başarısız olursa (ör. izin tam o
    /// sırada reddedildiyse) — önceden sessizce yutulan (`try?`) bu hata artık
    /// kullanıcıya gösteriliyor, elle giriş alanına yönlendiriyor.
    private var cameraErrorFallback: some View {
        Form {
            Section {
                Label("Kamera başlatılamadı.", systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.red)
                    .font(.footnote)
            }
            Section("Barkod Numarasını Gir") {
                TextField("Barkod", text: $manualCode)
                    .keyboardType(.numberPad)
                    .submitLabel(.search)
                    .onSubmit { submitManual() }
                Button("Ara") { submitManual() }
                    .disabled(manualCode.trimmingCharacters(in: .whitespaces).isEmpty)
            }
        }
    }

    private func submitManual() {
        let trimmed = manualCode.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return }
        dismissThenReport(trimmed)
    }

    /// Okunan kodu çağırana HEMEN iletmek yerine önce bu sayfayı kapatıp
    /// kapanma animasyonunun bitmesini bekliyoruz. Önceki haliyle (önce
    /// onScan, hemen ardından dismiss) çağıranın barkod bulunamadı
    /// uyarısı/yeni bir sayfa açması bu sayfanın kendi kapanma geçişiyle
    /// çakışıyordu — iOS ikisini aynı anda işleyemediği için uyarı bazen
    /// hiç çıkmıyor, bazen gözle görülür gecikiyordu (telefonda "yanlış
    /// barkod okutunca tepki vermiyor/çok geç tepki veriyor" olarak
    /// bildirildi).
    private func dismissThenReport(_ code: String) {
        dismiss()
        Task {
            try? await Task.sleep(for: .milliseconds(400))
            onScan(code)
        }
    }
}

private struct ScannerRepresentable: UIViewControllerRepresentable {
    let onScan: (String) -> Void
    let onStartFailed: () -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let vc = DataScannerViewController(
            recognizedDataTypes: [.barcode()],
            qualityLevel: .balanced,
            recognizesMultipleItems: false,
            isHighFrameRateTrackingEnabled: false,
            isPinchToZoomEnabled: true,
            isGuidanceEnabled: true,
            isHighlightingEnabled: true
        )
        vc.delegate = context.coordinator
        return vc
    }

    // ÖNEMLİ: `startScanning()` kamera izni tam bu anda reddedilmişse (ya da
    // başka bir sebeple) hata fırlatabiliyor — önceden `try?` ile sessizce
    // yutuluyordu, kamera görüntüsü hiç gelmeden ekran takılı kalıyor,
    // kullanıcı ne barkod okutabiliyor ne de bir hata görüyordu. Artık hata
    // durumunda elle giriş ekranına düşüyoruz (bkz. onStartFailed).
    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        if !uiViewController.isScanning {
            do {
                try uiViewController.startScanning()
            } catch {
                // View güncelleme döngüsü SIRASINDA SwiftUI state'i değiştirmek
                // tanımsız davranışa yol açabiliyor — bir sonraki run loop
                // turuna erteliyoruz.
                DispatchQueue.main.async { onStartFailed() }
            }
        }
    }

    static func dismantleUIViewController(_ uiViewController: DataScannerViewController, coordinator: Coordinator) {
        uiViewController.stopScanning()
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScan: onScan) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onScan: (String) -> Void
        private var handled = false
        init(onScan: @escaping (String) -> Void) { self.onScan = onScan }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            guard !handled else { return }
            for item in addedItems {
                if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue {
                    handled = true
                    // VisionKit'in kendi "hedef kutusu" vurgusu var ama dokunsal
                    // bir onay yok — başarılı okumayı kullanıcı ekrana bakmadan
                    // da hissedebilsin.
                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                    onScan(payload)
                    break
                }
            }
        }
    }
}
