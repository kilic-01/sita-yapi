import SwiftUI

private struct Contact: Identifiable, Hashable {
    let id: String
    let name: String
    static func == (lhs: Contact, rhs: Contact) -> Bool { lhs.id == rhs.id }
    func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

struct MessagesView: View {
    @Environment(AppState.self) private var appState
    @State private var contacts: [Contact] = []
    @State private var unreadByContact: [String: Int] = [:]
    @State private var isLoading = false
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
                                Text(String(contact.name.first ?? "?"))
                                    .font(.subheadline.bold())
                                    .foregroundStyle(.white)
                                    .frame(width: 38, height: 38)
                                    .background(.tint, in: Circle())
                                Text(contact.name)
                                Spacer()
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
            .task { await load() }
        }
    }

    private func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        guard let myId = appState.currentUser?.id else { return }
        do {
            async let techs: [Technician] = APIClient.shared.get("/technicians")
            async let staff: [OfficeStaffMember] = APIClient.shared.get("/office-staff")
            async let msgs: [ChatMessage] = APIClient.shared.get("/messages/\(myId)")
            let (techList, staffList, messageList) = try await (techs, staff, msgs)
            contacts = (techList.map { Contact(id: $0.id, name: $0.name) } + staffList.map { Contact(id: $0.id, name: $0.name) })
                .filter { $0.id != myId }
            var counts: [String: Int] = [:]
            for m in messageList where m.senderId != myId && m.recipientId == myId && m.readAt == nil {
                counts[m.senderId, default: 0] += 1
            }
            unreadByContact = counts
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Kişiler yüklenemedi."
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
        .task { await load() }
    }

    @ViewBuilder
    private func bubble(for message: ChatMessage) -> some View {
        let mine = message.senderId == appState.currentUser?.id
        HStack {
            if mine { Spacer(minLength: 40) }
            Text(message.body)
                .padding(.horizontal, 14)
                .padding(.vertical, 9)
                .background(mine ? AnyShapeStyle(.tint) : AnyShapeStyle(.regularMaterial), in: RoundedRectangle(cornerRadius: 16))
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
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Sohbet yüklenemedi."
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
            errorMessage = (error as? LocalizedError)?.errorDescription ?? "Gönderilemedi."
        }
    }
}

/// PUT /messages/read gövdesi anlamlı bir JSON döndürmeyebilir — kesin bir
/// şekil beklemeden "her neyse" decode edebilmek için boş bir yer tutucu.
struct EmptyResponse: Decodable {}
