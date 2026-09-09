import Foundation
import Combine

protocol SfuManagerDelegate: AnyObject {
    func sfuManager(_ manager: SfuManager, didReceiveOffer sdp: String, from: String)
    func sfuManager(_ manager: SfuManager, didReceiveAnswer sdp: String, from: String)
    func sfuManager(_ manager: SfuManager, didReceiveIce candidate: String, sdpMLineIndex: Int, sdpMid: String?, from: String)
    func sfuManager(_ manager: SfuManager, didUpdateParticipants participants: [SfuParticipant])
}

final class SfuManager: ObservableObject, @unchecked Sendable {
    static let shared = SfuManager()

    private var webSocketTask: URLSessionWebSocketTask?

    @Published private(set) var isConnected = false
    @Published private(set) var myParticipantId: String?
    @Published private(set) var participants: [SfuParticipant] = []
    @Published private(set) var errorMessage: String?

    weak var delegate: SfuManagerDelegate?

    func connect(roomId: String, displayName: String, token: String, userId: String?) {
        disconnect()

        let url = Config.sfuURL

        webSocketTask = URLSession.shared.webSocketTask(with: url)
        webSocketTask?.resume()
        receive()
        sendJoin(roomId: roomId, displayName: displayName, token: token, userId: userId)
    }

    func disconnect() {
        webSocketTask?.cancel(with: .normalClosure, reason: nil)
        webSocketTask = nil
        isConnected = false
        myParticipantId = nil
        participants = []
        errorMessage = nil
    }

    func sendOffer(target: String, sdp: String) {
        send(signal: ["type": "offer", "target": target, "sdp": sdp])
    }

    func sendAnswer(target: String, sdp: String) {
        send(signal: ["type": "answer", "target": target, "sdp": sdp])
    }

    func sendIce(target: String, candidate: String, sdpMLineIndex: Int, sdpMid: String?) {
        var signal: [String: Any] = [
            "type": "ice",
            "target": target,
            "candidate": candidate,
            "sdp_m_line_index": sdpMLineIndex
        ]
        if let sdpMid = sdpMid {
            signal["sdp_mid"] = sdpMid
        }
        send(signal: signal)
    }

    private func sendJoin(roomId: String, displayName: String, token: String, userId: String?) {
        var join: [String: Any] = [
            "type": "join",
            "room_id": roomId,
            "display_name": displayName,
            "token": token
        ]
        join["user_id"] = userId
        send(signal: join)
    }

    private func send(signal: [String: Any]) {
        guard let data = try? JSONSerialization.data(withJSONObject: signal, options: []),
              let text = String(data: data, encoding: .utf8) else {
            return
        }
        webSocketTask?.send(.string(text)) { [weak self] error in
            if let error = error {
                DispatchQueue.main.async { self?.errorMessage = error.localizedDescription }
            }
        }
    }

    private func receive() {
        webSocketTask?.receive { [weak self] result in
            switch result {
            case .success(let message):
                if case .string(let text) = message {
                    self?.handle(text: text)
                }
                self?.receive()
            case .failure(let error):
                DispatchQueue.main.async {
                    self?.errorMessage = error.localizedDescription
                    self?.isConnected = false
                }
            }
        }
    }

    private func handle(text: String) {
        guard let data = text.data(using: .utf8),
              let signal = try? JSONDecoder().decode(SfuSignal.self, from: data) else {
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            switch signal.type {
            case "connected":
                self.myParticipantId = signal.participant_id
                self.isConnected = true
            case "room_state":
                self.participants = signal.participants ?? []
            case "participant_joined":
                if let id = signal.participant_id, let name = signal.display_name {
                    self.participants.append(
                        SfuParticipant(id: id, display_name: name, user_id: signal.user_id)
                    )
                }
            case "participant_left":
                if let id = signal.participant_id {
                    self.participants.removeAll { $0.id == id }
                }
            case "offer":
                if let sdp = signal.sdp, let from = signal.from {
                    self.delegate?.sfuManager(self, didReceiveOffer: sdp, from: from)
                }
            case "answer":
                if let sdp = signal.sdp, let from = signal.from {
                    self.delegate?.sfuManager(self, didReceiveAnswer: sdp, from: from)
                }
            case "ice":
                if let candidate = signal.candidate, let from = signal.from {
                    self.delegate?.sfuManager(
                        self,
                        didReceiveIce: candidate,
                        sdpMLineIndex: signal.sdp_m_line_index ?? 0,
                        sdpMid: signal.sdp_mid,
                        from: from
                    )
                }
            case "error":
                self.errorMessage = signal.message
            default:
                break
            }

            self.delegate?.sfuManager(self, didUpdateParticipants: self.participants)
        }
    }
}
