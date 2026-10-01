import SwiftUI
import VisionKit

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

    private var cameraAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    var body: some View {
        NavigationStack {
            Group {
                if cameraAvailable {
                    ScannerRepresentable { code in
                        onScan(code)
                        dismiss()
                    }
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
                Label("Bu cihazda/simülatörde kamera taraması kullanılamıyor.", systemImage: "camera.fill.badge.ellipsis")
                    .foregroundStyle(.secondary)
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
        onScan(trimmed)
        dismiss()
    }
}

private struct ScannerRepresentable: UIViewControllerRepresentable {
    let onScan: (String) -> Void

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

    func updateUIViewController(_ uiViewController: DataScannerViewController, context: Context) {
        if !uiViewController.isScanning {
            try? uiViewController.startScanning()
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
                    onScan(payload)
                    break
                }
            }
        }
    }
}
