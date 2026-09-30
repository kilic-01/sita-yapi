import SwiftUI

struct LoginView: View {
    @Environment(AppState.self) private var appState

    @State private var name: String = ""
    @State private var password: String = ""
    @State private var showPassword: Bool = false
    @State private var errorMessage: String?
    @State private var isLoading: Bool = false
    @FocusState private var focusedField: Field?

    private enum Field { case name, password }

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image("BrandLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 220)

            VStack(spacing: 0) {
                HStack(spacing: 10) {
                    Image(systemName: "person.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 18)
                    TextField("Ad", text: $name)
                        .textInputAutocapitalization(.words)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .name)
                        .submitLabel(.next)
                        .onSubmit { focusedField = .password }
                }
                .padding(14)

                Divider().padding(.leading, 42)

                HStack(spacing: 10) {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(.secondary)
                        .frame(width: 18)
                    Group {
                        if showPassword {
                            TextField("Şifre", text: $password)
                        } else {
                            SecureField("Şifre", text: $password)
                        }
                    }
                    .focused($focusedField, equals: .password)
                    .submitLabel(.go)
                    .onSubmit { Task { await login() } }
                    Button {
                        showPassword.toggle()
                    } label: {
                        Image(systemName: showPassword ? "eye.slash.fill" : "eye.fill")
                            .foregroundStyle(.secondary)
                    }
                }
                .padding(14)
            }
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
            .padding(.horizontal, 32)

            Button {
                Task { await login() }
            } label: {
                if isLoading {
                    ProgressView().tint(.white)
                } else {
                    Text("Giriş Yap").fontWeight(.semibold)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(.tint, in: Capsule())
            .foregroundStyle(.white)
            .padding(.horizontal, 32)
            .disabled(isLoading || name.isEmpty || password.isEmpty)

            if let errorMessage {
                Text(errorMessage)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }

            Spacer()
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground))
    }

    private func login() async {
        guard !name.isEmpty, !password.isEmpty else { return }
        errorMessage = nil
        isLoading = true
        defer { isLoading = false }
        do {
            struct LoginBody: Encodable { let name: String; let password: String }
            let user: AppUser? = try await APIClient.shared.post("/login", body: LoginBody(name: name, password: password))
            guard let user else {
                errorMessage = "Ad veya şifre hatalı."
                return
            }
            appState.login(user)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Giriş yapılamadı."
        }
    }
}
