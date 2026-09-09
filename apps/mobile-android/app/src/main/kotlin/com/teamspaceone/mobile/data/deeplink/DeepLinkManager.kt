package com.teamspaceone.mobile.data.deeplink

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed class DeepLink {
    data class Channel(val id: String) : DeepLink()
    data class Meeting(val id: String) : DeepLink()
    data class File(val id: String) : DeepLink()
    data object Unknown : DeepLink()
}

object DeepLinkManager {
    private val _pendingDeepLink = MutableStateFlow<DeepLink?>(null)
    val pendingDeepLink: StateFlow<DeepLink?> = _pendingDeepLink.asStateFlow()

    fun setDeepLink(uri: Uri) {
        _pendingDeepLink.value = parse(uri)
    }

    fun consume() {
        _pendingDeepLink.value = null
    }

    fun parse(uri: Uri): DeepLink {
        val path = uri.path ?: return DeepLink.Unknown
        val segments = path.split("/").filter { it.isNotBlank() }
        val id = segments.getOrNull(1)
        return when (segments.firstOrNull()?.lowercase()) {
            "channel", "channels", "c" -> id?.let { DeepLink.Channel(it) } ?: DeepLink.Unknown
            "meeting", "meetings", "m" -> id?.let { DeepLink.Meeting(it) } ?: DeepLink.Unknown
            "file", "files", "f" -> id?.let { DeepLink.File(it) } ?: DeepLink.Unknown
            else -> DeepLink.Unknown
        }
    }
}
