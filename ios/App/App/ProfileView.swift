import SwiftUI
import PhotosUI

/// Masaüstündeki MyProfileSection.jsx'in native karşılığı — kullanıcı kendi
/// adını, şifresini ve profil fotoğrafını değiştirebilir. Backend sözleşmesi
/// aynı: PUT /api/users/:id, body { patch: {name?, password?, photo?,
/// photoPosition?}, actingUserId }. actingUserId == id olduğu için (kendi
/// profilini güncelleme) backend role/hiddenTabs gibi alanları zaten kabul
/// etmiyor, bu yüzden onları hiç göndermiyoruz.
struct ProfileView: View {
    @Environment(AppState.self) private var appState
    @Environment(\.dismiss) private var dismiss

    @State private var name = ""
    @State private var photoDataURL: String?
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showLogoutConfirmation = false

    private var passwordsMismatch: Bool {
        !newPassword.isEmpty && newPassword != confirmPassword
    }

    var body: some View {
        Form {
            Section {
                HStack {
                    Spacer()
                    VStack(spacing: 10) {
                        avatar
                        PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                            Text("Fotoğrafı Değiştir")
                        }
                    }
                    Spacer()
                }
            }

            Section("Ad Soyad") {
                TextField("Ad Soyad", text: $name)
            }

            Section("Şifre Değiştir") {
                SecureField("Yeni Şifre", text: $newPassword)
                SecureField("Yeni Şifre (Tekrar)", text: $confirmPassword)
                if passwordsMismatch {
                    Text("Şifreler eşleşmiyor.").font(.caption).foregroundStyle(.red)
                }
                Text("Boş bırakılırsa şifreniz değişmez.").font(.caption).foregroundStyle(.secondary)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }

            Section {
                Button("Çıkış Yap", role: .destructive) {
                    showLogoutConfirmation = true
                }
            }
        }
        .navigationTitle("Profilim")
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
                .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || passwordsMismatch || isSaving)
            }
        }
        .confirmationDialog("Çıkış yapmak istiyor musunuz?", isPresented: $showLogoutConfirmation, titleVisibility: .visible) {
            Button("Çıkış Yap", role: .destructive) {
                appState.logout()
                dismiss()
            }
            Button("Vazgeç", role: .cancel) {}
        }
        .onAppear {
            name = appState.currentUser?.name ?? ""
            photoDataURL = appState.currentUser?.photo
        }
        .onChange(of: selectedPhotoItem) { _, newItem in
            Task { await loadPickedPhoto(newItem) }
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let photoDataURL, let data = Data(base64Encoded: base64Payload(photoDataURL)), let uiImage = UIImage(data: data) {
            Image(uiImage: uiImage)
                .resizable()
                .scaledToFill()
                .frame(width: 96, height: 96)
                .clipShape(Circle())
        } else {
            Text(String(appState.currentUser?.name.first ?? "?"))
                .font(.largeTitle.bold())
                .foregroundStyle(.white)
                .frame(width: 96, height: 96)
                .background(.tint, in: Circle())
        }
    }

    /// Seçilen fotoğrafı 512pt'e küçültüp JPEG'e sıkıştırıyoruz — masaüstündeki
    /// 2 MB client-side sınırına benzer bir önlem (backend'de boyut kontrolü
    /// yok), aksi halde kullanıcının telefon kamerasından gelen ~10 MB'lık bir
    /// fotoğraf doğrudan base64 olarak gönderilip isteği şişirebilirdi.
    private func loadPickedPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let original = UIImage(data: data) else { return }
        let resized = resize(original, maxDimension: 512)
        guard let jpeg = resized.jpegData(compressionQuality: 0.7) else { return }
        photoDataURL = "data:image/jpeg;base64,\(jpeg.base64EncodedString())"
    }

    private func resize(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
        let scale = min(maxDimension / image.size.width, maxDimension / image.size.height, 1)
        guard scale < 1 else { return image }
        let newSize = CGSize(width: image.size.width * scale, height: image.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in image.draw(in: CGRect(origin: .zero, size: newSize)) }
    }

    private struct UserPatch {
        var name: String?
        var password: String?
        var photo: String?
        var photoPosition: PhotoPosition?
    }

    /// `encodeIfPresent` ile nil alanlar JSON'a hiç yazılmıyor — backend bunu
    /// "bu alanı değiştirme" olarak yorumluyor (bkz. AppointmentEditView.EditBody
    /// içindeki aynı not).
    private struct UpdateUserBody: Encodable {
        let patch: UserPatch
        let actingUserId: String

        enum CodingKeys: String, CodingKey {
            case patch, actingUserId
        }

        enum PatchCodingKeys: String, CodingKey {
            case name, password, photo, photoPosition
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.container(keyedBy: CodingKeys.self)
            var patchContainer = c.nestedContainer(keyedBy: PatchCodingKeys.self, forKey: .patch)
            try patchContainer.encodeIfPresent(patch.name, forKey: .name)
            try patchContainer.encodeIfPresent(patch.password, forKey: .password)
            try patchContainer.encodeIfPresent(patch.photo, forKey: .photo)
            try patchContainer.encodeIfPresent(patch.photoPosition, forKey: .photoPosition)
            try c.encode(actingUserId, forKey: .actingUserId)
        }
    }

    private func save() async {
        guard let userId = appState.currentUser?.id else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let photoChanged = photoDataURL != appState.currentUser?.photo
        let patch = UserPatch(
            name: name.trimmingCharacters(in: .whitespaces),
            password: newPassword.isEmpty ? nil : newPassword,
            photo: photoChanged ? photoDataURL : nil,
            photoPosition: photoChanged ? PhotoPosition(x: 50, y: 50) : nil
        )
        let body = UpdateUserBody(patch: patch, actingUserId: userId)

        do {
            let updated: AppUser = try await APIClient.shared.put("/users/\(userId)", body: body)
            appState.login(updated)
            dismiss()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}
