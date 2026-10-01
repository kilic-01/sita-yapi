import SwiftUI
import VisionKit

/// Stok/Zimmet/Satış ekranlarının ortak barkod tarama sayfası — VisionKit'in
/// canlı DataScannerViewController'ını tam ekran sunar. Simülatörde gerçek
/// kamera olmadığı için DataScannerViewController.isSupported daima false
/// döner — bu yüzden aynı sayfa, kamera yoksa/izin yoksa elle barkod girişine
/// düşen bir yedek sunuyor (fiziksel cihazda hiç görünmez).
struct BarcodeScannerSheet: View {
    @Environment(\.dismiss) private var dismiss
    let title: String
    /// Stok/Zimmet'te tek bir ürün bulup hemen kapanması yeterli; Hızlı
    /// Satış'ta tek seferde birden fazla ürün okutulabilmesi gerekiyor —
    /// true olduğunda tarayıcı her okumadan sonra kapanmaz, kullanıcı
    /// "Bitti"ye basana kadar art arda okutmaya devam edebilir.
    var continuous: Bool = false
    let onScan: (String) -> Void

    @State private var manualCode = ""

    private var cameraAvailable: Bool {
        DataScannerViewController.isSupported && DataScannerViewController.isAvailable
    }

    var body: some View {
        NavigationStack {
            Group {
                if cameraAvailable {
                    ScannerRepresentable(continuous: continuous) { code in
                        onScan(code)
                        if !continuous { dismiss() }
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
                if continuous {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Bitti") { dismiss() }.bold()
                    }
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
        if continuous {
            manualCode = ""
        } else {
            dismiss()
        }
    }
}

private struct ScannerRepresentable: UIViewControllerRepresentable {
    let continuous: Bool
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

    func makeCoordinator() -> Coordinator { Coordinator(continuous: continuous, onScan: onScan) }

    final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let continuous: Bool
        let onScan: (String) -> Void
        private var handled = false
        init(continuous: Bool, onScan: @escaping (String) -> Void) {
            self.continuous = continuous
            self.onScan = onScan
        }

        func dataScanner(_ dataScanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            if !continuous { guard !handled else { return } }
            for item in addedItems {
                if case .barcode(let barcode) = item, let payload = barcode.payloadStringValue {
                    handled = true
                    onScan(payload)
                    if !continuous { break }
                }
            }
        }
    }
}
