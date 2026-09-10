import SwiftUI

struct ParticipantGridView: View {
    let participants: [WebRTCManager.RemoteParticipant]

    private let columns = [
        GridItem(.adaptive(minimum: 160, maximum: 260), spacing: 8)
    ]

    var body: some View {
        LazyVGrid(columns: columns, spacing: 8) {
            ForEach(participants) { participant in
                ParticipantTileView(participant: participant)
                    .aspectRatio(4 / 3, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(8)
    }
}

private func initials(for name: String) -> String {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    let parts = trimmed.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
    let firstLetters = parts.prefix(2).map { $0.prefix(1).uppercased() }
    return firstLetters.joined()
}

private func placeholderColor(for name: String) -> Color {
    let colors: [Color] = [
        .init(red: 0.37, green: 0.55, blue: 0.49),
        .init(red: 0.49, green: 0.35, blue: 0.36),
        .init(red: 0.35, green: 0.49, blue: 0.60),
        .init(red: 0.54, green: 0.49, blue: 0.35),
        .init(red: 0.49, green: 0.35, blue: 0.54)
    ]
    let hash = abs(name.hashValue)
    return colors[hash % colors.count]
}

private struct ParticipantTileView: View {
    let participant: WebRTCManager.RemoteParticipant

    var body: some View {
        ZStack {
            if participant.hasVideo, let track = participant.videoTrack {
                RemoteVideoView(track: track)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                PlaceholderAvatar(name: participant.displayName)
            }

            VStack {
                Spacer()
                HStack(spacing: 4) {
                    Text(participant.displayName)
                        .font(.caption)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                        .lineLimit(1)

                    Spacer()

                    if participant.isScreenShare {
                        Image(systemName: "rectangle.inset.filled")
                            .font(.caption)
                            .foregroundStyle(.white)
                    }

                    Image(systemName: participant.hasAudio ? "mic.fill" : "mic.slash.fill")
                        .font(.caption)
                        .foregroundStyle(participant.hasAudio ? .white : .red)
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(.black.opacity(0.6))
            }
        }
    }
}

private struct PlaceholderAvatar: View {
    let name: String

    var body: some View {
        placeholderColor(for: name)
            .overlay {
                ZStack {
                    Circle()
                        .fill(.black.opacity(0.3))
                        .frame(width: 64, height: 64)
                    Text(initials(for: name))
                        .font(.title)
                        .fontWeight(.bold)
                        .foregroundStyle(.white)
                }
            }
    }
}
