package com.teamspaceone.mobile.data.sfu

import android.util.Log
import com.teamspaceone.mobile.data.remote.APIClient
import com.teamspaceone.mobile.data.remote.SfuSignal
import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.cancel
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object SfuManager {
    private const val TAG = "SfuManager"
    private const val SFU_URL = "ws://127.0.0.1:8443"

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var session: DefaultClientWebSocketSession? = null

    var onSignal: ((SfuSignal) -> Unit)? = null

    fun connect(roomId: String, displayName: String, token: String, userId: String?) {
        disconnect()
        scope.launch {
            try {
                APIClient.http.webSocket(SFU_URL) {
                    session = this
                    sendJoin(roomId, displayName, token, userId)
                    for (frame in incoming) {
                        if (frame is Frame.Text) {
                            handle(frame.readText())
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "WebSocket error", e)
            }
        }
    }

    fun disconnect() {
        scope.launch {
            session?.cancel()
            session = null
        }
    }

    fun sendOffer(target: String, sdp: String) {
        send(buildJsonObject {
            put("type", "offer")
            put("target", target)
            put("sdp", sdp)
        })
    }

    fun sendAnswer(target: String, sdp: String) {
        send(buildJsonObject {
            put("type", "answer")
            put("target", target)
            put("sdp", sdp)
        })
    }

    fun sendIce(target: String, candidate: String, sdpMLineIndex: Int, sdpMid: String?) {
        send(buildJsonObject {
            put("type", "ice")
            put("target", target)
            put("candidate", candidate)
            put("sdp_m_line_index", sdpMLineIndex)
            if (sdpMid != null) put("sdp_mid", sdpMid)
        })
    }

    private suspend fun DefaultClientWebSocketSession.sendJoin(
        roomId: String,
        displayName: String,
        token: String,
        userId: String?
    ) {
        val join = buildJsonObject {
            put("type", "join")
            put("room_id", roomId)
            put("display_name", displayName)
            put("token", token)
            put("user_id", userId)
        }
        send(Frame.Text(join.toString()))
    }

    private fun send(json: JsonObject) {
        scope.launch {
            session?.send(Frame.Text(json.toString()))
        }
    }

    private fun handle(text: String) {
        try {
            val signal: SfuSignal = Json { ignoreUnknownKeys = true }.decodeFromString(text)
            when (signal.type) {
                "connected" -> Log.d(TAG, "connected: ${signal.participantId}")
                "room_state" -> Log.d(TAG, "participants: ${signal.participants?.size}")
                "participant_joined" -> Log.d(TAG, "joined: ${signal.participantId}")
                "participant_left" -> Log.d(TAG, "left: ${signal.participantId}")
                "error" -> Log.e(TAG, "error: ${signal.message}")
                else -> Log.d(TAG, "signal: ${signal.type}")
            }
            onSignal?.invoke(signal)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse signal", e)
        }
    }
}
