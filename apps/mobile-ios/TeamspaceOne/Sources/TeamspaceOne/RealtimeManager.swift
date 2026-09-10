import Foundation
import Combine
import SocketIO

@MainActor
class RealtimeManager: ObservableObject {
    static let shared = RealtimeManager()

    private var manager: SocketManager?
    private var socket: SocketIOClient?

    @Published private(set) var isConnected = false
    @Published private(set) var events: [String] = []
    @Published private(set) var lastCreatedMessage: Message?

    func connect(token: String, organisationId: String?) {
        disconnect()

        let config: SocketIOClientConfiguration = [
            .log(true),
            .compress,
            .reconnects(true)
        ]

        manager = SocketManager(socketURL: Config.realtimeURL, config: config)
        socket = manager?.socket(forNamespace: "/realtime")

        socket?.on(clientEvent: .connect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = true
                self?.append(event: "connect")
                if let organisationId = organisationId {
                    self?.socket?.emit("join-organisation", with: [organisationId], completion: nil)
                }
                self?.socket?.emit("join-user", with: [], completion: nil)
            }
        }

        socket?.on(clientEvent: .disconnect) { [weak self] _, _ in
            DispatchQueue.main.async {
                self?.isConnected = false
                self?.append(event: "disconnect")
            }
        }

        socket?.on(clientEvent: .error) { [weak self] data, _ in
            DispatchQueue.main.async {
                self?.append(event: "error: \(data)")
            }
        }

        let eventNames = [
            "message.created",
            "message.updated",
            "message.deleted",
            "channel.created",
            "channel.updated",
            "channel.deleted",
            "project.created",
            "project.updated",
            "project.deleted",
            "sync"
        ]

        for event in eventNames {
            socket?.on(event) { [weak self] data, _ in
                DispatchQueue.main.async {
                    self?.append(event: event)
                    if event == "message.created" {
                        self?.updateLastCreatedMessage(from: data)
                    }
                }
            }
        }

        socket?.connect(withPayload: ["token": token])
    }

    func disconnect() {
        socket?.disconnect()
        manager = nil
        socket = nil
        isConnected = false
    }

    func joinChannel(_ channelId: String) {
        socket?.emit("join", with: [channelId], completion: nil)
    }

    func leaveChannel(_ channelId: String) {
        socket?.emit("leave", with: [channelId], completion: nil)
    }

    private func updateLastCreatedMessage(from data: [Any]) {
        guard let first = data.first,
              let jsonData = try? JSONSerialization.data(withJSONObject: first, options: []),
              let message = try? JSONDecoder().decode(Message.self, from: jsonData) else {
            return
        }
        lastCreatedMessage = message
    }

    private func append(event: String) {
        events.insert(event, at: 0)
        if events.count > 10 {
            events.removeLast()
        }
    }
}
