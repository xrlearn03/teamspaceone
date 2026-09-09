import SwiftUI

struct ChannelDetailLoader: View {
    let channelId: String
    @State private var channel: Channel?
    @State private var status = "Loading channel…"

    var body: some View {
        Group {
            if let channel {
                ChannelDetailView(channel: channel)
            } else {
                VStack {
                    ProgressView()
                    Text(status)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        do {
            let channels = try await AuthManager.shared.channels()
            if let match = channels.first(where: { $0.id == channelId }) {
                channel = match
            } else {
                status = "Channel not found"
            }
        } catch {
            status = "Error: \(error.localizedDescription)"
        }
    }
}
