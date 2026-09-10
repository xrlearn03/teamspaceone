import SwiftUI
import WebRTC

struct RemoteVideoView: UIViewRepresentable {
    var track: RTCVideoTrack

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> RTCMTLVideoView {
        let view = RTCMTLVideoView(frame: .zero)
        view.videoContentMode = .scaleAspectFit
        context.coordinator.track = track
        track.add(view)
        return view
    }

    func updateUIView(_ uiView: RTCMTLVideoView, context: Context) {
        if context.coordinator.track?.trackId != track.trackId {
            context.coordinator.track?.remove(uiView)
            context.coordinator.track = track
            track.add(uiView)
        }
    }

    static func dismantleUIView(_ uiView: RTCMTLVideoView, coordinator: Coordinator) {
        coordinator.track?.remove(uiView)
    }

    final class Coordinator {
        var track: RTCVideoTrack?
    }
}
