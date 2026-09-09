package com.teamspaceone.mobile.data.realtime

import android.util.Log
import com.teamspaceone.mobile.BuildConfig
import com.teamspaceone.mobile.data.remote.AuthManager
import io.socket.client.IO
import io.socket.client.Socket
import java.net.URI

object RealtimeManager {
    private const val TAG = "RealtimeManager"
    private const val NAMESPACE = "/realtime"
    private const val BASE_URL = BuildConfig.REALTIME_URL

    private var socket: Socket? = null
    private val listeners = mutableListOf<(String, Any?) -> Unit>()

    var isConnected: Boolean = false
        private set

    fun connect(token: String? = AuthManager.accessToken(), organisationId: String? = AuthManager.activeOrg()) {
        if (token.isNullOrBlank()) return
        disconnect()

        val options = IO.Options().apply {
            transports = arrayOf("websocket", "polling")
            auth = mapOf("token" to token)
        }

        socket = IO.socket(URI.create(BASE_URL + NAMESPACE), options).apply {
            on(Socket.EVENT_CONNECT) {
                isConnected = true
                Log.d(TAG, "connected")
                organisationId?.let { emit("join-organisation", it) }
                emit("join-user")
            }

            on(Socket.EVENT_DISCONNECT) {
                isConnected = false
                Log.d(TAG, "disconnected")
            }

            on(Socket.EVENT_CONNECT_ERROR) { args ->
                isConnected = false
                Log.e(TAG, "connect error: ${args?.firstOrNull()}")
            }

            on("message.created") { args ->
                dispatch("message.created", args?.firstOrNull())
            }

            on("message.updated") { args ->
                dispatch("message.updated", args?.firstOrNull())
            }

            on("message.deleted") { args ->
                dispatch("message.deleted", args?.firstOrNull())
            }

            on("channel.created") { args ->
                dispatch("channel.created", args?.firstOrNull())
            }

            on("channel.updated") { args ->
                dispatch("channel.updated", args?.firstOrNull())
            }

            on("channel.deleted") { args ->
                dispatch("channel.deleted", args?.firstOrNull())
            }

            on("project.created") { args ->
                dispatch("project.created", args?.firstOrNull())
            }

            on("project.updated") { args ->
                dispatch("project.updated", args?.firstOrNull())
            }

            on("project.deleted") { args ->
                dispatch("project.deleted", args?.firstOrNull())
            }

            on("sync") { args ->
                dispatch("sync", args?.firstOrNull())
            }

            connect()
        }
    }

    fun disconnect() {
        socket?.disconnect()
        socket = null
        isConnected = false
    }

    fun joinChannel(channelId: String) {
        socket?.emit("join", channelId)
    }

    fun leaveChannel(channelId: String) {
        socket?.emit("leave", channelId)
    }

    fun joinProject(projectId: String) {
        socket?.emit("join", projectId)
    }

    fun leaveProject(projectId: String) {
        socket?.emit("leave", projectId)
    }

    fun addListener(listener: (String, Any?) -> Unit): () -> Unit {
        listeners.add(listener)
        return { listeners.remove(listener) }
    }

    private fun dispatch(event: String, payload: Any?) {
        listeners.forEach { it(event, payload) }
    }
}
