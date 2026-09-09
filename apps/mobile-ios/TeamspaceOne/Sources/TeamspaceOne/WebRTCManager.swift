import Foundation
import AVFoundation
@preconcurrency import WebRTC

final class WebRTCManager: NSObject, ObservableObject, SfuManagerDelegate, RTCPeerConnectionDelegate, @unchecked Sendable {
    static let shared = WebRTCManager()

    private var factory: RTCPeerConnectionFactory?
    private var peerConnection: RTCPeerConnection?
    private var localAudioTrack: RTCAudioTrack?
    private(set) var localVideoTrack: RTCVideoTrack?
    private var videoCapturer: RTCCameraVideoCapturer?
    private let rtcAudioSession = RTCAudioSession.sharedInstance()
    private let sfu = SfuManager.shared

    @Published private(set) var isConnected = false
    @Published private(set) var isMicEnabled = true
    @Published private(set) var isSpeakerOn = false
    @Published private(set) var isCameraOn = false
    @Published private(set) var participants: [SfuParticipant] = []
    @Published private(set) var remoteVideoTracks: [RTCVideoTrack] = []
    @Published private(set) var remoteParticipants: [RemoteParticipant] = []
    @Published private(set) var errorMessage: String?

    struct RemoteParticipant: Identifiable {
        let id: String
        var displayName: String
        var videoTrack: RTCVideoTrack?
        var audioTrack: RTCAudioTrack?
        var isScreenShare: Bool

        var hasAudio: Bool { audioTrack?.isEnabled ?? false }
        var hasVideo: Bool { videoTrack?.isEnabled ?? false }
    }

    private var needsNegotiation = false

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

    func setSpeakerOn(_ enabled: Bool) {
        do {
            try AVAudioSession.sharedInstance().overrideOutputAudioPort(enabled ? .speaker : .none)
            DispatchQueue.main.async { [weak self] in
                self?.isSpeakerOn = enabled
            }
        } catch {
            debugPrint("Error setting speaker: \(error)")
        }
    }

    func setCameraEnabled(_ enabled: Bool) {
        guard let videoCapturer = videoCapturer, let localVideoTrack = localVideoTrack else { return }

        if enabled {
            let devices = RTCCameraVideoCapturer.captureDevices()
            guard let device = devices.first(where: { $0.position == .front }) ?? devices.first else {
                DispatchQueue.main.async { [weak self] in
                    self?.errorMessage = "No camera available"
                }
                return
            }
            let formats = RTCCameraVideoCapturer.supportedFormats(for: device)
            guard let format = formats.last else { return }
            videoCapturer.startCapture(with: device, format: format, fps: 30)
            localVideoTrack.isEnabled = true
            DispatchQueue.main.async { [weak self] in
                self?.isCameraOn = true
            }
        } else {
            videoCapturer.stopCapture()
            localVideoTrack.isEnabled = false
            DispatchQueue.main.async { [weak self] in
                self?.isCameraOn = false
            }
        }
    }

    func disconnect() {
        needsNegotiation = false
        videoCapturer?.stopCapture()
        localAudioTrack = nil
        localVideoTrack = nil
        videoCapturer = nil
        isMicEnabled = true
        isSpeakerOn = false
        isCameraOn = false
        errorMessage = nil
        participants = []
        remoteVideoTracks = []
        remoteParticipants = []
        peerConnection?.close()
        peerConnection = nil
        factory = nil
        sfu.disconnect()
    }

    private func maybeOffer() {
        guard needsNegotiation, peerConnection != nil, sfu.isConnected else { return }
        needsNegotiation = false
        offer()
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

        let videoSource = factory.videoSource()
        let videoTrack = factory.videoTrack(with: videoSource, trackId: "video0")
        videoTrack.isEnabled = false
        localVideoTrack = videoTrack
        peerConnection.add(videoTrack, streamIds: ["stream0"])
        videoCapturer = RTCCameraVideoCapturer(delegate: videoSource)
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

    func sfuManagerDidConnect(_ manager: SfuManager) {
        DispatchQueue.main.async { [weak self] in
            self?.maybeOffer()
        }
    }

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
            self?.updateRemoteParticipantNames()
        }
    }

    private func updateRemoteParticipantNames() {
        remoteParticipants = remoteParticipants.map { rp in
            let baseId = rp.id.hasPrefix("screen-") ? String(rp.id.dropFirst("screen-".count)) : rp.id
            let name = participants.first { $0.id == baseId }?.display_name ?? baseId
            var updated = rp
            updated.displayName = rp.isScreenShare ? "\(name) (screen)" : name
            return updated
        }
    }

    private func participantName(for id: String) -> String {
        let baseId = id.hasPrefix("screen-") ? String(id.dropFirst("screen-".count)) : id
        return participants.first { $0.id == baseId }?.display_name ?? baseId
    }

    private func upsertRemoteParticipant(streamId: String, stream: RTCMediaStream) {
        guard streamId != "stream0" else { return }

        let isScreenShare = streamId.hasPrefix("screen-")
        let baseId = isScreenShare ? String(streamId.dropFirst("screen-".count)) : streamId
        let participantId = isScreenShare ? streamId : baseId
        let displayName = isScreenShare ? "\(participantName(for: baseId)) (screen)" : participantName(for: baseId)

        var list = remoteParticipants
        let index = list.firstIndex { $0.id == participantId }
        var participant = index != nil ? list[index!] : RemoteParticipant(
            id: participantId,
            displayName: displayName,
            isScreenShare: isScreenShare
        )

        for track in stream.videoTracks {
            if remoteVideoTracks.contains(where: { $0.trackId == track.trackId }) { continue }
            remoteVideoTracks.append(track)
            participant.videoTrack = track
        }

        for track in stream.audioTracks {
            participant.audioTrack = track
        }

        participant.displayName = displayName

        if let index = index {
            list[index] = participant
        } else {
            list.append(participant)
        }

        remoteParticipants = list
    }

    private func removeRemoteParticipant(streamId: String, stream: RTCMediaStream) {
        guard streamId != "stream0" else { return }

        var list = remoteParticipants
        if let index = list.firstIndex(where: { $0.id == streamId }) {
            var participant = list[index]

            for track in stream.videoTracks {
                remoteVideoTracks.removeAll { $0.trackId == track.trackId }
                if participant.videoTrack?.trackId == track.trackId {
                    participant.videoTrack = nil
                }
            }

            for track in stream.audioTracks {
                if participant.audioTrack?.trackId == track.trackId {
                    participant.audioTrack = nil
                }
            }

            if participant.videoTrack == nil && participant.audioTrack == nil {
                list.remove(at: index)
            } else {
                list[index] = participant
            }
        }

        remoteParticipants = list
    }

    // MARK: - RTCPeerConnectionDelegate

    func peerConnection(_ peerConnection: RTCPeerConnection, didChange stateChanged: RTCSignalingState) {}

    func peerConnection(_ peerConnection: RTCPeerConnection, didAdd stream: RTCMediaStream) {
        DispatchQueue.main.async { [weak self] in
            self?.upsertRemoteParticipant(streamId: stream.streamId, stream: stream)
        }
    }

    func peerConnection(_ peerConnection: RTCPeerConnection, didRemove stream: RTCMediaStream) {
        DispatchQueue.main.async { [weak self] in
            self?.removeRemoteParticipant(streamId: stream.streamId, stream: stream)
        }
    }

    func peerConnectionShouldNegotiate(_ peerConnection: RTCPeerConnection) {
        DispatchQueue.main.async { [weak self] in
            self?.needsNegotiation = true
            self?.maybeOffer()
        }
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
