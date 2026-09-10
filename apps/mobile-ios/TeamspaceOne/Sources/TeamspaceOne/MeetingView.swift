import SwiftUI

struct MeetingView: View {
    @State private var roomId: String
    @State private var displayName: String
    @StateObject private var manager = WebRTCManager.shared

    init(roomId: String = "", displayName: String = "") {
        _roomId = State(initialValue: roomId)
        _displayName = State(initialValue: displayName)
    }

    var body: some View {
        Form {
            Section("Room") {
                TextField("Room ID", text: $roomId)
                    .textFieldStyle(.roundedBorder)
                TextField("Display name", text: $displayName)
                    .textFieldStyle(.roundedBorder)

                if manager.isConnected {
                    HStack(spacing: 12) {
                        Button(manager.isMicEnabled ? "Mute" : "Unmute") {
                            manager.setMicEnabled(!manager.isMicEnabled)
                        }

                        Button(manager.isSpeakerOn ? "Earpiece" : "Speaker") {
                            manager.setSpeakerOn(!manager.isSpeakerOn)
                        }

                        Button(manager.isCameraOn ? "Cam Off" : "Cam On") {
                            manager.setCameraEnabled(!manager.isCameraOn)
                        }
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

            Section("Participants") {
                ZStack(alignment: .topTrailing) {
                    if manager.remoteParticipants.isEmpty {
                        Text("No participants")
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity, minHeight: 120, alignment: .center)
                    } else {
                        ParticipantGridView(participants: manager.remoteParticipants)
                    }

                    if manager.isCameraOn, let track = manager.localVideoTrack {
                        LocalVideoView(track: track)
                            .frame(width: 120, height: 90)
                            .cornerRadius(8)
                            .padding(8)
                    }
                }

                Text(manager.isConnected ? "Connected" : "Disconnected")
                    .foregroundStyle(manager.isConnected ? .green : .secondary)
            }
        }
        .navigationTitle("Meeting")
    }
}
