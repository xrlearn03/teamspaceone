package com.teamspaceone.mobile.data.push

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import com.teamspaceone.mobile.data.remote.APIClient
import com.teamspaceone.mobile.data.remote.RegisterDeviceResponse
import kotlinx.coroutines.tasks.await
import kotlinx.serialization.Serializable

@Serializable
private data class RegisterDeviceRequest(
    val platform: String,
    val token: String
)

object PushTokenManager {
    suspend fun registerToken(token: String): Result<RegisterDeviceResponse> {
        return try {
            val response: RegisterDeviceResponse = APIClient.post(
                "/notifications/devices",
                RegisterDeviceRequest("android", token)
            )
            Result.success(response)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun fetchAndRegisterToken(context: Context): Result<RegisterDeviceResponse> {
        if (FirebaseApp.getApps(context).isEmpty()) {
            return Result.failure(IllegalStateException("Firebase is not initialized (missing google-services.json)"))
        }
        val token = FirebaseMessaging.getInstance().token.await()
        return registerToken(token)
    }
}
