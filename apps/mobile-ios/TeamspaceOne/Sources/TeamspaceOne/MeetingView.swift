import SwiftUI

struct MeetingView: View {
    @State private var roomId = ""
    @State private var displayName = ""
    @StateObject private var manager = WebRTCManager.shared

    var body: some View {
        Form {
            Section("Room") {
                TextField("Room ID", text: $roomId)
                    .textFieldStyle(.roundedBorder)
                TextField("Display name", text: $displayName)
                    .textFieldStyle(.roundedBorder)

                if manager.isConnected {
                    Button(manager.isMicEnabled ? "Mute" : "Unmute") {
                        manager.setMicEnabled(!manager.isMicEnabled)
                    }
                }

                Button(manager.isConnected ? "Disconnect" : "Connect") {
                    if manager.isConnected {
                        manager.disconnect()
                    } else {
                        let room = roomId.trimmingCharacters(in: .whitespaces)
                        let name = displayName.trimmingCharacters(in: .whitespaces).isEmpty ? "iOS User" : displayName.trimmingCharacters(in: .whitespaces)
                        Task {
                            await manager.connect(roomId: room, displayName: name, userId: nil)
                        }
                    }
                }
                .disabled(roomId.trimmingCharacters(in: .whitespaces).isEmpty)
            }

            Section("Status") {
                Text(manager.isConnected ? "Connected" : "Disconnected")
                    .foregroundStyle(manager.isConnected ? .green : .secondary)
            }

            Section("Participants") {
                if manager.remoteParticipants.isEmpty {
                    Text("No remote participants")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(manager.remoteParticipants, id: \.self) { participant in
                        Text(participant)
                    }
                }
            }
        }
        .navigationTitle("Meeting")
    }
}
