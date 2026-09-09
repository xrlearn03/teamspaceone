import SwiftUI
import UniformTypeIdentifiers

struct ChannelDetailView: View {
    let channel: Channel
    @State private var messages: [Message] = []
    @State private var input = ""
    @State private var isLoading = false
    @State private var status = ""
    @State private var showImporter = false
    @State private var pendingAttachmentIds: [String] = []
    @StateObject private var realtime = RealtimeManager.shared

    private var groupedMessages: [(String, [Message])] {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let dateFormatter = DateFormatter()
        dateFormatter.dateStyle = .medium
        dateFormatter.timeStyle = .none

        let groups = Dictionary(grouping: messages) { message in
            if let date = formatter.date(from: message.createdAt) {
                return dateFormatter.string(from: date)
            }
            return message.createdAt
        }

        return groups.sorted { a, b in
            guard let dateA = formatter.date(from: a.value.first?.createdAt ?? ""),
                  let dateB = formatter.date(from: b.value.first?.createdAt ?? "") else { return a.key < b.key }
            return dateA < dateB
        }
        .map { ($0.key, $0.value.sorted { a, b in
            guard let dateA = formatter.date(from: a.createdAt),
                  let dateB = formatter.date(from: b.createdAt) else { return a.createdAt < b.createdAt }
            return dateA < dateB
        }) }
    }

    var body: some View {
        VStack(spacing: 0) {
            if isLoading && messages.isEmpty {
                Spacer()
                ProgressView()
                Spacer()
            } else if !status.isEmpty && messages.isEmpty {
                Spacer()
                ContentUnavailableView {
                    Label("Couldn't load messages", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(status)
                } actions: {
                    Button("Try Again") {
                        Task { await load() }
                    }
                }
                Spacer()
            } else if messages.isEmpty {
                Spacer()
                ContentUnavailableView {
                    Label("No messages yet", systemImage: "bubble.left")
                } description: {
                    Text("Be the first to send a message.")
                }
                Spacer()
            } else {
                List {
                    ForEach(groupedMessages, id: \.0) { date, dayMessages in
                        Section(header: Text(date).font(.caption).foregroundStyle(.secondary)) {
                            ForEach(dayMessages) { message in
                                MessageRow(message: message)
                            }
                        }
                    }
                }
                .listStyle(.plain)
                .refreshable {
                    await load()
                }
            }

            if !status.isEmpty && messages.isEmpty == false {
                Text(status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }

            HStack {
                Button {
                    showImporter = true
                } label: {
                    Image(systemName: "paperclip")
                }

                TextField("Message", text: $input, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button("Send") {
                    Task { await send() }
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty && pendingAttachmentIds.isEmpty)
            }
            .padding()
        }
        .navigationTitle(channel.name)
        .task {
            await load()
        }
        .fileImporter(
            isPresented: $showImporter,
            allowedContentTypes: [UTType.data],
            allowsMultipleSelection: false
        ) { result in
            handleImport(result)
        }
        .onAppear {
            realtime.joinChannel(channel.id)
        }
        .onDisappear {
            realtime.leaveChannel(channel.id)
        }
        .onChange(of: realtime.lastCreatedMessage?.id) { _, new in
            if let new,
               let message = realtime.lastCreatedMessage,
               message.channelId == channel.id,
               !messages.contains(where: { $0.id == new }) {
                withAnimation {
                    messages.insert(message, at: 0)
                }
            }
        }
    }

    private func load() async {
        isLoading = messages.isEmpty
        status = ""
        do {
            messages = try await AuthManager.shared.messages(channelId: channel.id)
        } catch {
            status = "Error: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func send() async {
        let content = input.trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty || !pendingAttachmentIds.isEmpty else { return }
        status = "Sending…"
        do {
            _ = try await AuthManager.shared.sendMessage(
                channelId: channel.id,
                content: content,
                attachmentIds: pendingAttachmentIds
            )
            input = ""
            pendingAttachmentIds = []
            await load()
        } catch {
            status = "Send failed: \(error.localizedDescription)"
        }
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard let url = urls.first else { return }
            Task {
                await uploadAttachment(url)
            }
        } catch {
            status = "Import failed: \(error.localizedDescription)"
        }
    }

    private func uploadAttachment(_ url: URL) async {
        guard let orgId = await AuthManager.shared.activeOrganisationId else {
            status = "No organisation selected"
            return
        }
        status = "Uploading attachment…"
        do {
            let file = try await FileService.uploadFile(url: url, organisationId: orgId)
            pendingAttachmentIds.append(file.id)
            status = ""
        } catch {
            status = "Attachment upload failed: \(error.localizedDescription)"
        }
    }
}

private struct MessageRow: View {
    let message: Message

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(message.content)
                .strikethrough(message.deletedAt != nil, color: .secondary)

            if !message.attachments.isEmpty {
                Text("\(message.attachments.count) attachment(s)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text(message.senderId)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}
