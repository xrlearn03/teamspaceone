package com.teamspaceone.mobile.data.webrtc

import android.content.Context
import android.util.Log
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.SfuSignal
import com.teamspaceone.mobile.data.sfu.SfuManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.webrtc.AudioSource
import org.webrtc.AudioTrack
import org.webrtc.IceCandidate
import org.webrtc.MediaConstraints
import org.webrtc.PeerConnection
import org.webrtc.PeerConnectionFactory
import org.webrtc.SdpObserver
import org.webrtc.SessionDescription

object WebRTCManager {
    private const val TAG = "WebRTCManager"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var factory: PeerConnectionFactory? = null
    private var peerConnection: PeerConnection? = null
    private var audioSource: AudioSource? = null
    private var audioTrack: AudioTrack? = null

    private val stunServer = listOf(
        PeerConnection.IceServer.builder("stun:stun.l.google.com:19302").createIceServer()
    )

    fun init(context: Context) {
        val options = PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)
    }

    fun connect(roomId: String, displayName: String, userId: String?) {
        stop()
        startPeerConnection()
        SfuManager.onSignal = { handleSignal(it) }

        scope.launch {
            try {
                val token = AuthManager.sfuToken(roomId).token
                SfuManager.connect(roomId, displayName, token, userId)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to start call", e)
            }
        }
    }

    fun stop() {
        SfuManager.onSignal = null
        audioTrack = null
        audioSource?.dispose()
        audioSource = null
        peerConnection?.close()
        peerConnection = null
        factory?.dispose()
        factory = null
        SfuManager.disconnect()
    }

    private fun startPeerConnection() {
        factory = PeerConnectionFactory.builder().createPeerConnectionFactory()

        val config = PeerConnection.RTCConfiguration(stunServer).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        val constraints = MediaConstraints()

        peerConnection = factory?.createPeerConnection(config, constraints, peerConnectionObserver)

        val audioConstraints = MediaConstraints()
        audioSource = factory?.createAudioSource(audioConstraints)
        audioTrack = factory?.createAudioTrack("audio0", audioSource)
        peerConnection?.addTrack(audioTrack, listOf("stream0"))
    }

    private fun offer() {
        val constraints = MediaConstraints()
        peerConnection?.createOffer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                val description = sdp ?: return
                peerConnection?.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        SfuManager.sendOffer("sfu", description.description)
                    }

                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                }, description)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    private fun answer() {
        val constraints = MediaConstraints()
        peerConnection?.createAnswer(object : SdpObserver {
            override fun onCreateSuccess(sdp: SessionDescription?) {
                val description = sdp ?: return
                peerConnection?.setLocalDescription(object : SdpObserver {
                    override fun onSetSuccess() {
                        SfuManager.sendAnswer("sfu", description.description)
                    }

                    override fun onCreateSuccess(p0: SessionDescription?) {}
                    override fun onCreateFailure(p0: String?) {}
                    override fun onSetFailure(p0: String?) {}
                }, description)
            }

            override fun onSetSuccess() {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, constraints)
    }

    private fun setRemoteOffer(sdp: String) {
        val description = SessionDescription(SessionDescription.Type.OFFER, sdp)
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {
                answer()
            }

            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, description)
    }

    private fun setRemoteAnswer(sdp: String) {
        val description = SessionDescription(SessionDescription.Type.ANSWER, sdp)
        peerConnection?.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {}
            override fun onCreateSuccess(p0: SessionDescription?) {}
            override fun onCreateFailure(p0: String?) {}
            override fun onSetFailure(p0: String?) {}
        }, description)
    }

    private fun addIceCandidate(candidate: String, sdpMLineIndex: Int, sdpMid: String?) {
        peerConnection?.addIceCandidate(IceCandidate(sdpMid, sdpMLineIndex, candidate))
    }

    private fun handleSignal(signal: SfuSignal) {
        when (signal.type) {
            "offer" -> signal.sdp?.let { setRemoteOffer(it) }
            "answer" -> signal.sdp?.let { setRemoteAnswer(it) }
            "ice" -> {
                signal.candidate?.let {
                    val index = signal.sdpMLineIndex ?: 0
                    addIceCandidate(it, index, signal.sdpMid)
                }
            }
        }
    }

    private val peerConnectionObserver = object : PeerConnection.Observer {
        override fun onSignalingChange(newState: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(newState: PeerConnection.IceGatheringState) {}
        override fun onIceCandidate(candidate: IceCandidate?) {
            candidate?.let {
                SfuManager.sendIce("sfu", it.sdp, it.sdpMLineIndex, it.sdpMid)
            }
        }

        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onAddStream(stream: org.webrtc.MediaStream) {}
        override fun onRemoveStream(stream: org.webrtc.MediaStream) {}
        override fun onDataChannel(channel: org.webrtc.DataChannel) {}
        override fun onRenegotiationNeeded() {
            offer()
        }

        override fun onAddTrack(receiver: org.webrtc.RtpReceiver, streams: Array<out org.webrtc.MediaStream>) {}
        override fun onRemoveTrack(receiver: org.webrtc.RtpReceiver) {}
        override fun onTrack(transceiver: org.webrtc.RtpTransceiver) {}
    }
}
