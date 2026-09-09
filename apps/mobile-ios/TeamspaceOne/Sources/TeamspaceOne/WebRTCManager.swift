import Foundation
import AVFoundation
import WebRTC

final class WebRTCManager: NSObject, ObservableObject, SfuManagerDelegate, RTCPeerConnectionDelegate, @unchecked Sendable {
    static let shared = WebRTCManager()

    private var factory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private let rtcAudioSession = RTCAudioSession.sharedInstance()
    private let sfu = SfuManager.shared

    @Published private(set) var isConnected = false
    @Published private(set) var isMicEnabled = true
    @Published private(set) var participants: [SfuParticipant] = []
    @Published private(set) var errorMessage: String?

    private override init() {
        super.init()
        RTCInitializeSSL()
    }

    func connect(roomId: String, displayName: String, userId: String?) async {
        startPeerConnection()

        do {
            let token = try await AuthManager.shared.sfuToken(meetingId: roomId)
            sfu.delegate = self
            sfu.connect(roomId: roomId, displayName: displayName, token: token.token, userId: userId)
        } catch {
            DispatchQueue.main.async { self.errorMessage = error.localizedDescription }
        }
    }

    func setMicEnabled(_ enabled: Bool) {
        localAudioTrack?.isEnabled = enabled
        DispatchQueue.main.async { [weak self] in
            self?.isMicEnabled = enabled
        }
    }

    func disconnect() {
        localAudioTrack = nil
        isMicEnabled = true
        errorMessage = nil
        participants = []
        peerConnection?.close()
        peerConnection = nil
        factory = nil
        sfu.disconnect()
    }

    private func startPeerConnection() {
        let encoder = RTCDefaultVideoEncoderFactory()
        let decoder = RTCDefaultVideoDecoderFactory()
        factory = RTCPeerConnectionFactory(encoderFactory: encoder, decoderFactory: decoder)

        let config = RTCConfiguration()
        config.iceServers = Config.iceServers
        config.sdpSemantics = .unifiedPlan
        config.continualGatheringPolicy = .gatherContinually

        let constraints = RTCMediaConstraints(mandatoryConstraints: nil,
                                              optionalConstraints: ["DtlsSrtpKeyAgreement": kRTCMediaConstraintsValueTrue])
        peerConnection = factory?.peerConnection(with: config, constraints: constraints, delegate: nil)

        createMediaSenders()
        configureAudioSession()
        peerConnection?.delegate = self
    }

    private func configureAudioSession() {
        rtcAudioSession.lockForConfiguration()
        do {
            try rtcAudioSession.setCategory(AVAudioSession.Category.playAndRecord)
            try rtcAudioSession.setMode(AVAudioSession.Mode.voiceChat)
        } catch {
            debugPrint("Error configuring audio session: \(error)")
        }
        rtcAudioSession.unlockForConfiguration()
    }

    private func createMediaSenders() {
        guard let factory = factory, let peerConnection = peerConnection else { return }
        let audioConstraints = RTCMediaConstraints(mandatoryConstraints: nil, optionalConstraints: nil)
        let audioSource = factory.audioSource(with: audioConstraints)
        let audioTrack = factory.audioTrack(with: audioSource, trackId: "audio0")
        audioTrack.isEnabled = isMicEnabled
        localAudioTrack = audioTrack
        peerConnection.add(audioTrack, streamIds: ["stream0"])
    }

    private func offer() {
        let constraints = RTCMediaConstraints(mandatoryConstraints: [kRTCMediaConstraintsOfferToReceiveAudio: kRTCMediaConstraintsValueTrue],
                                              optionalConstraints: nil)
        peerConnection?.offer(for: constraints) { [weak self] offer, error in
            guard let offer = offer, error == nil else { return }
            let offerSdp = offer.sdp
            self?.peerConnection?.setLocalDescription(offer, completionHandler: { [weak self] error in
                if error == nil {
                    DispatchQueue.main.async { self?.sfu.sendOffer(target: "sfu", sdp: offerSdp) }
                }
            })
        }
    }

    private func answer() {
        let constraints = RTCMediaConstraints(mandatoryConstraints: [kRTCMediaConstraintsOfferToReceiveAudio: kRTCMediaConstraintsValueTrue],
                                              optionalConstraints: nil)
        peerConnection?.answer(for: constraints) { [weak self] answer, error in
            guard let answer = answer, error == nil else { return }
            let answerSdp = answer.sdp
            self?.peerConnection?.setLocalDescription(answer, completionHandler: { [weak self] error in
                if error == nil {
                    DispatchQueue.main.async { self?.sfu.sendAnswer(target: "sfu", sdp: answerSdp) }
                }
            })
        }
    }

    private func setRemoteOffer(_ sdp: String) {
        let description = RTCSessionDescription(type: .offer, sdp: sdp)
        peerConnection?.setRemoteDescription(description, completionHandler: { [weak self] error in
            if error == nil {
                self?.answer()
            }
        })
    }

    private func setRemoteAnswer(_ sdp: String) {
        let description = RTCSessionDescription(type: .answer, sdp: sdp)
        peerConnection?.setRemoteDescription(description, completionHandler: { _ in })
    }

    private func addIceCandidate(_ candidate: String, sdpMLineIndex: Int, sdpMid: String?) {
        let ice = RTCIceCandidate(sdp: candidate, sdpMLineIndex: Int32(sdpMLineIndex), sdpMid: sdpMid)
        peerConnection?.add(ice, completionHandler: { _ in })
    }

    // MARK: - SfuManagerDelegate

    func sfuManager(_ manager: SfuManager, didReceiveOffer sdp: String, from: String) {
        setRemoteOffer(sdp)
    }

    func sfuManager(_ manager: SfuManager, didReceiveAnswer sdp: String, from: String) {
        setRemoteAnswer(sdp)
    }

    func sfuManager(_ manager: SfuManager, didReceiveIce candidate: String, sdpMLineIndex: Int, sdpMid: String?, from: String) {
        addIceCandidate(candidate, sdpMLineIndex: sdpMLineIndex, sdpMid: sdpMid)
    }

    func sfuManager(_ manager: SfuManager, didUpdateParticipants participants: [SfuParticipant]) {
        DispatchQueue.main.async { [weak self] in
            self?.participants = participants
        }
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {}

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        offer()
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCPeerConnectionState) {
        let connected = (newState == .connected)
        DispatchQueue.main.async { [weak self] in
            self?.isConnected = connected
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceConnectionState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange newState: RTCIceGatheringState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove candidates: [RTCIceCandidate]) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didGenerate candidate: RTCIceCandidate) {
        let candidateSdp = candidate.sdp
        let mLineIndex = candidate.sdpMLineIndex
        let mid = candidate.sdpMid
        DispatchQueue.main.async { [weak self] in
            self?.sfu.sendIce(
                target: "sfu",
                candidate: candidateSdp,
                sdpMLineIndex: Int(mLineIndex),
                sdpMid: mid
            )
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didOpen dataChannel: RTCDataChannel) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didStartReceivingOn transceiver: RTCRtpTransceiver) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd rtpReceiver: RTCRtpReceiver, streams mediaStreams: [RTCMediaStream]) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove rtpReceiver: RTCRtpReceiver) {}
}
