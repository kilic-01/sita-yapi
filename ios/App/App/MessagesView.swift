import SwiftUI

private struct Contact: Identifiable, Hashable {
    let id: String
    let name: String
    let photo: String?
    static func == (lhs: Contact, rhs: Contact) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

/// `data:image/...;base64,...` URL'lerini çözer — ProfileView'daki aynı
/// basit yaklaşım (AsyncImage bu şemayı desteklemiyor, Android'deki Coil
/// sorunuyla aynı sebepten burada da doğrudan Data/UIImage kullanıyoruz).
private func decodedAvatar(_ dataUrl: String?) -> UIImage? {
    guard let dataUrl, let range = dataUrl.range(of: "base64,") else { return nil }
    let base64 = String(dataUrl[range.upperBound...])
    guard let data = Data(base64Encoded: base64) else { return nil }
    return UIImage(data: data)
}

private struct ContactAvatar: View {
    let contact: Contact
    var body: some View {
        if let image = decodedAvatar(contact.photo) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 38, height: 38)
                .clipShape(Circle())
        } else {
            Text(String(contact.name.first ?? "?"))
                .font(.subheadline.bold())
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(.tint, in: Circle())
        }
    }
}

struct MessagesView: View {
    @Environment(AppState.self) private var appState
    @State private var contacts: [Contact] = []
    @State private var unreadByContact: [String: Int] = [:]
    // Kişi başına son mesaj — satırda önizleme ve saat (WhatsApp benzeri).
    @State private var lastMessageByContact: [String: ChatMessage] = [:]
    @State private var isLoading = false
    @State private var hasLoadedOnce = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            List {
                if isLoading {
                    ProgressView()
                } else if let errorMessage {
                    Text(errorMessage).foregroundStyle(.red)
                } else if contacts.isEmpty {
                    Text("Mesajlaşılacak kimse yok.").foregroundStyle(.secondary)
                } else {
                    ForEach(contacts) { contact in
                        NavigationLink(value: contact) {
                            HStack(spacing: 12) {
                                ContactAvatar(contact: contact)
                                let unread = (unreadByContact[contact.id] ?? 0) > 0
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack {
                                        Text(contact.name).fontWeight(unread ? .semibold : .regular)
                                        Spacer()
                                        if let last = lastMessageByContact[contact.id] {
                                            Text(messageTimeLabel(last.createdAt))
                                                .font(.caption)
                                                .foregroundStyle(unread ? Color.accentColor : .secondary)
                                        }
                                    }
                                    if let last = lastMessageByContact[contact.id] {
                                        Text((last.senderId == appState.currentUser?.id ? "Sen: " : "") + last.body)
                                            .font(.subheadline)
                                            .foregroundStyle(unread ? .primary : .secondary)
                                            .lineLimit(1)
                                    }
                                }
                                if let count = unreadByContact[contact.id], count > 0 {
                                    Text("\(count)")
                                        .font(.caption.bold())
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 2)
                                        .background(.red, in: Capsule())
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Mesajlar")
            .navigationDestination(for: Contact.self) { contact in
                ChatView(contactId: contact.id, contactName: contact.name)
            }
            // SwiftUI'nin TabView'i her sekmeyi canlı tuttuğu için, sadece
            // ilk açılışta çalışan bir .task hiç yenilenmiyordu — başka biri
            // mesaj gönderdiğinde uygulamayı kapatıp açmadan görülemiyordu.
            // Bu yüzden sekme açıkken periyodik olarak (ve aşağı çekilince)
            // sessizce yeniden çekiyoruz.
            .task {
                while !Task.isCancelled {
                    await load()
                    try? await Task.sleep(for: .seconds(8))
                }
            }
            .refreshable { await load() }
        }
    }

    private func load() async {
        if !hasLoadedOnce { isLoading = true }
        defer { isLoading = false; hasLoadedOnce = true }
        guard let myId = appState.currentUser?.id else { return }
        do {
            // Teknisyen/ofis çalışanı tablolarındaki herkesin giriş hesabı
            // olmayabilir — mesajlaşma sadece gerçekten giriş yapabilen,
            // /api/users'ta kayıtlı hesaplar arasında olmalı (aksi halde
            // mesaj, hiç kimsenin okuyamayacağı bir id'ye gönderilmiş olur).
            async let usersReq: [AppUser] = APIClient.shared.get("/users")
            async let msgs: [ChatMessage] = APIClient.shared.get("/messages/\(myId)")
            let (userList, messageList) = try await (usersReq, msgs)
            var counts: [String: Int] = [:]
            // En son mesajın zamanını, sohbetin iki tarafından da (gönderen/alan)
            // bakarak kişi id'sine göre topluyoruz — en yeni sohbet en üstte.
            var lastMessageAt: [String: String] = [:]
            var lastMessage: [String: ChatMessage] = [:]
            for m in messageList {
                let otherId = m.senderId == myId ? m.recipientId : (m.recipientId == myId ? m.senderId : nil)
                guard let otherId, let createdAt = m.createdAt else { continue }
                if createdAt > (lastMessageAt[otherId] ?? "") {
                    lastMessageAt[otherId] = createdAt
                    lastMessage[otherId] = m
                }
                if m.senderId != myId && m.recipientId == myId && m.readAt == nil {
                    counts[m.senderId, default: 0] += 1
                }
            }
            contacts = userList
                .filter { $0.id != myId }
                .map { Contact(id: $0.id, name: $0.name, photo: $0.photo) }
                .sorted { (lastMessageAt[$0.id] ?? "") > (lastMessageAt[$1.id] ?? "") }
            unreadByContact = counts
            lastMessageByContact = lastMessage
            errorMessage = nil
        } catch {
            // Periyodik yenilemede geçici bir ağ hatası, mevcut listeyi bir
            // hata ekranıyla değiştirmemeli — sadece ilk yüklemede göster.
            if !hasLoadedOnce {
                errorMessage = error.turkishMessage
            }
        }
    }
}

struct ChatView: View {
    @Environment(AppState.self) private var appState
    let contactId: String
    let contactName: String

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var isSending = false
    @State private var errorMessage: String?

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 8) {
                        ForEach(messages) { message in
                            bubble(for: message).id(message.id)
                        }
                    }
                    .padding(12)
                }
                .onChange(of: messages.count) { _, _ in
                    if let last = messages.last {
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }
            }
            if let errorMessage {
                Text(errorMessage).font(.caption).foregroundStyle(.red).padding(.horizontal)
            }
            HStack(spacing: 8) {
                TextField("Mesaj yazın…", text: $draft, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task { await send() }
                } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title)
                }
                .disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSending)
            }
            .padding(10)
            .background(.bar)
        }
        .navigationTitle(contactName)
        .navigationBarTitleDisplayMode(.inline)
        // Karşı taraf sohbet açıkken mesaj gönderirse, bir realtime bağlantı
        // olmadığı için (bkz. desktop'taki Supabase realtime) bunu görmenin
        // tek yolu periyodik olarak sessizce yeniden çekmek.
        .task {
            while !Task.isCancelled {
                await load()
                try? await Task.sleep(for: .seconds(4))
            }
        }
    }

    @ViewBuilder
    private func bubble(for message: ChatMessage) -> some View {
        let mine = message.senderId == appState.currentUser?.id
        HStack {
            if mine { Spacer(minLength: 40) }
            Text(message.body)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(mine ? AnyShapeStyle(.tint) : AnyShapeStyle(Color(.secondarySystemBackground)), in: RoundedRectangle(cornerRadius: 16))
                .foregroundStyle(mine ? .white : .primary)
            if !mine { Spacer(minLength: 40) }
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }

    private func load() async {
        guard let myId = appState.currentUser?.id else { return }
        do {
            struct ReadBody: Encodable { let currentUserId: String; let otherUserId: String }
            let _: EmptyResponse? = try? await APIClient.shared.put("/messages/read", body: ReadBody(currentUserId: myId, otherUserId: contactId))
            let all: [ChatMessage] = try await APIClient.shared.get("/messages/\(myId)")
            messages = all.filter {
                ($0.senderId == contactId && $0.recipientId == myId) || ($0.senderId == myId && $0.recipientId == contactId)
            }
            errorMessage = nil
        } catch {
            // Periyodik yenilemede geçici bir hata, zaten açık olan sohbeti
            // bir hata mesajıyla değiştirmemeli.
            if messages.isEmpty {
                errorMessage = error.turkishMessage
            }
        }
    }

    private func send() async {
        let body = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !body.isEmpty, let myId = appState.currentUser?.id else { return }
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            struct Body: Encodable { let senderId: String; let recipientId: String; let body: String }
            let _: ChatMessage = try await APIClient.shared.post("/messages", body: Body(senderId: myId, recipientId: contactId, body: body))
            draft = ""
            await load()
        } catch {
            errorMessage = error.turkishMessage
        }
    }
}

/// PUT /messages/read gövdesi anlamlı bir JSON döndürmeyebilir — kesin bir
/// şekil beklemeden "her neyse" decode edebilmek için boş bir yer tutucu.
struct EmptyResponse: Decodable {}

/// Mesaj listesindeki saat: bugün "14:05", dün "Dün", bu hafta gün adı, daha eski "3 Kas".
func messageTimeLabel(_ iso: String?) -> String {
    guard let iso else { return "" }
    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = parser.date(from: iso) ?? ISO8601DateFormatter().date(from: iso) else { return "" }
    let cal = Calendar.current
    let out = DateFormatter()
    out.locale = Locale(identifier: "tr_TR")
    if cal.isDateInToday(date) { out.dateFormat = "HH:mm" }
    else if cal.isDateInYesterday(date) { return "Dün" }
    else if let days = cal.dateComponents([.day], from: date, to: Date()).day, days < 7 { out.dateFormat = "EEEE" }
    else { out.dateFormat = "d MMM" }
    return out.string(from: date)
}
