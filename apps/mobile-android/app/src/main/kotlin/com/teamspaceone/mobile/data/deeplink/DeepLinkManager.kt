package com.teamspaceone.mobile.data.deeplink

import android.net.Uri
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

object DeepLinkManager {
    private val _pendingDeepLink = MutableStateFlow<Uri?>(null)
    val pendingDeepLink = _pendingDeepLink.asStateFlow()

    fun setDeepLink(uri: Uri?) {
        _pendingDeepLink.value = uri
    }

    fun consume(): Uri? {
        val link = _pendingDeepLink.value
        _pendingDeepLink.value = null
        return link
    }
}
