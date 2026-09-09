package com.teamspaceone.mobile.data.webrtc

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.util.Log
import com.teamspaceone.mobile.BuildConfig
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.remote.SfuParticipant
import com.teamspaceone.mobile.data.remote.SfuSignal
import com.teamspaceone.mobile.data.sfu.SfuManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

    private val _isConnected = MutableStateFlow(false)
    val isConnected: StateFlow<Boolean> = _isConnected.asStateFlow()

    private val _isMicEnabled = MutableStateFlow(true)
    val isMicEnabled: StateFlow<Boolean> = _isMicEnabled.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _participants = MutableStateFlow<List<SfuParticipant>>(emptyList())
    val participants: StateFlow<List<SfuParticipant>> = _participants.asStateFlow()

    private val _isSpeakerOn = MutableStateFlow(false)
    val isSpeakerOn: StateFlow<Boolean> = _isSpeakerOn.asStateFlow()

    private var audioManager: AudioManager? = null

    private val iceServers: List<PeerConnection.IceServer>
        get() = buildList {
            add(PeerConnection.IceServer.builder(BuildConfig.STUN_URL).createIceServer())
            if (BuildConfig.TURN_URL.isNotBlank()) {
                val builder = PeerConnection.IceServer.builder(BuildConfig.TURN_URL)
                if (BuildConfig.TURN_USERNAME.isNotBlank() && BuildConfig.TURN_PASSWORD.isNotBlank()) {
                    builder.setUsername(BuildConfig.TURN_USERNAME)
                    builder.setPassword(BuildConfig.TURN_PASSWORD)
                }
                add(builder.createIceServer())
            }
        }

    fun init(context: Context) {
        val options = PeerConnectionFactory.InitializationOptions.builder(context.applicationContext)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)
        audioManager = context.applicationContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    }

    fun setSpeakerOn(enabled: Boolean) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val targetType = if (enabled) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
            audioManager?.availableCommunicationDevices
                ?.find { it.type == targetType }
                ?.let { audioManager?.setCommunicationDevice(it) }
        } else {
            @Suppress("DEPRECATION")
            audioManager?.isSpeakerphoneOn = enabled
        }
        _isSpeakerOn.value = enabled
    }

    fun connect(roomId: String, displayName: String, userId: String?) {
        stop()
        startPeerConnection()
        setSpeakerOn(_isSpeakerOn.value)
        SfuManager.onSignal = { handleSignal(it) }

        scope.launch {
            try {
                val token = AuthManager.sfuToken(roomId).token
                SfuManager.connect(roomId, displayName, token, userId)
            } catch (e: Exception) {
                _errorMessage.value = e.message
                Log.e(TAG, "Failed to start call", e)
            }
        }
    }

    fun stop() {
        _isConnected.value = false
        _isMicEnabled.value = true
        _errorMessage.value = null
        _participants.value = emptyList()
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

        val config = PeerConnection.RTCConfiguration(iceServers).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }

        peerConnection = factory?.createPeerConnection(config, peerConnectionObserver)

        val audioConstraints = MediaConstraints()
        audioSource = factory?.createAudioSource(audioConstraints)
        audioTrack = factory?.createAudioTrack("audio0", audioSource)
        audioTrack?.setEnabled(_isMicEnabled.value)
        peerConnection?.addTrack(audioTrack, listOf("stream0"))
    }

    fun setMicEnabled(enabled: Boolean) {
        audioTrack?.setEnabled(enabled)
        _isMicEnabled.value = enabled
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
            "room_state" -> _participants.value = signal.participants ?: emptyList()
            "participant_joined" -> {
                val id = signal.participantId
                val name = signal.displayName
                if (id != null && name != null) {
                    _participants.value = _participants.value + SfuParticipant(id, name, signal.userId)
                }
            }
            "participant_left" -> {
                signal.participantId?.let { id ->
                    _participants.value = _participants.value.filter { it.id != id }
                }
            }
            "error" -> _errorMessage.value = signal.message
        }
    }

    private val peerConnectionObserver = object : PeerConnection.Observer {
        override fun onSignalingChange(newState: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(newState: PeerConnection.IceConnectionState) {
            _isConnected.value = when (newState) {
                PeerConnection.IceConnectionState.CONNECTED,
                PeerConnection.IceConnectionState.COMPLETED -> true
                PeerConnection.IceConnectionState.DISCONNECTED,
                PeerConnection.IceConnectionState.FAILED,
                PeerConnection.IceConnectionState.CLOSED -> false
                else -> _isConnected.value
            }
        }
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
