import SwiftUI

struct ChannelsView: View {
    @State private var channels: [Channel] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List(channels) { channel in
            NavigationLink(destination: ChannelDetailView(channel: channel)) {
                VStack(alignment: .leading) {
                    Text(channel.name)
                        .font(.headline)
                    if let description = channel.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text("#\(channel.type)")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .navigationTitle("Channels")
        .overlay {
            if isLoading {
                ProgressView()
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        do {
            channels = try await AuthManager.shared.channels()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
