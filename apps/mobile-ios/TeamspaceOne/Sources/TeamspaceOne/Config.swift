import Foundation
import WebRTC

enum Config {
    private static func string(for key: String, default defaultValue: String) -> String {
        Bundle.main.object(forInfoDictionaryKey: key) as? String ?? defaultValue
    }

    static let apiBaseURL = URL(string: string(for: "APIBaseURL", default: "http://localhost:3000"))!
    static let realtimeURL = URL(string: string(for: "RealtimeURL", default: "http://localhost:3005"))!
    static let sfuURL = URL(string: string(for: "SFUURL", default: "ws://127.0.0.1:8443"))!
    static let stunURL = string(for: "STUNURL", default: "stun:stun.l.google.com:19302")
    static let turnURL = Bundle.main.object(forInfoDictionaryKey: "TURNURL") as? String
    static let turnUsername = Bundle.main.object(forInfoDictionaryKey: "TURNUsername") as? String
    static let turnPassword = Bundle.main.object(forInfoDictionaryKey: "TURNPassword") as? String

    static var iceServers: [RTCIceServer] {
        var servers = [RTCIceServer(urlStrings: [stunURL], username: nil, credential: nil)]
        if let turnURL = turnURL, !turnURL.isEmpty {
            let server = RTCIceServer(
                urlStrings: [turnURL],
                username: turnUsername,
                credential: turnPassword
            )
            servers.append(server)
        }
        return servers
    }
}
