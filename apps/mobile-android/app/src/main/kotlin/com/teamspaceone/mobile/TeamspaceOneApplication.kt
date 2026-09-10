package com.teamspaceone.mobile

import android.app.Application
import com.teamspaceone.mobile.data.remote.AuthManager
import com.teamspaceone.mobile.data.webrtc.WebRTCManager

class TeamspaceOneApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AuthManager.init(this)
        WebRTCManager.init(this)
    }
}
