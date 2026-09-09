import SwiftUI

struct ChannelDetailView: View {
    let channel: Channel
    @State private var messages: [Message] = []
    @State private var input = ""
    @State private var isLoading = false
    @State private var status = ""
    @StateObject private var realtime = RealtimeManager.shared

    var body: some View {
        VStack(spacing: 0) {
            if isLoading && messages.isEmpty {
                Spacer()
                ProgressView()
                Spacer()
            } else if messages.isEmpty {
                Spacer()
                Text("No messages yet")
                    .foregroundStyle(.secondary)
                Spacer()
            } else {
                List(messages) { message in
                    VStack(alignment: .leading, spacing: 4) {
                        Text(message.content)
                            .strikethrough(message.deletedAt != nil, color: .secondary)
                        Text(message.senderId)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .listStyle(.plain)
            }

            if !status.isEmpty {
                Text(status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }

            HStack {
                TextField("Message", text: $input, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                Button("Send") {
                    Task { await send() }
                }
                .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty)
            }
            .padding()
        }
        .navigationTitle(channel.name)
        .task {
            await load()
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
        isLoading = true
        do {
            messages = try await AuthManager.shared.messages(channelId: channel.id)
        } catch {
            status = "Error: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func send() async {
        let content = input.trimmingCharacters(in: .whitespaces)
        guard !content.isEmpty else { return }
        status = "Sending…"
        do {
            _ = try await AuthManager.shared.sendMessage(channelId: channel.id, content: content)
            input = ""
            await load()
        } catch {
            status = "Send failed: \(error.localizedDescription)"
        }
    }
}
