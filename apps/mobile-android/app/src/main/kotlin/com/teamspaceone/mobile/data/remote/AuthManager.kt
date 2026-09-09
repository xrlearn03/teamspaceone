package com.teamspaceone.mobile.data.remote

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKeys
import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

object AuthManager {
    private const val PREFS_FILE = "teamspace_one_auth"
    private const val KEY_ACCESS = "accessToken"
    private const val KEY_REFRESH = "refreshToken"

    private lateinit var prefs: SharedPreferences
    private var activeOrganisationId: String? = null
    private val refreshMutex = Mutex()

    fun init(context: Context) {
        val master = MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC)
        prefs = EncryptedSharedPreferences.create(
            PREFS_FILE,
            master,
            context,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun accessToken(): String? = prefs.getString(KEY_ACCESS, null)
    fun refreshToken(): String? = prefs.getString(KEY_REFRESH, null)

    fun activeOrg(): String? = activeOrganisationId
    fun setActiveOrg(id: String?) {
        activeOrganisationId = id
    }

    suspend fun me(): UserDto = APIClient.request("/auth/me")

    suspend fun organisations(): List<Organisation> = APIClient.request("/organisations")

    suspend fun channels(): List<Channel> = APIClient.request("/channels")

    suspend fun projects(): List<Project> = APIClient.request("/projects")

    suspend fun messages(channelId: String): List<Message> {
        val page: MessagePage = APIClient.request("/channels/$channelId/messages")
        return page.items
    }

    suspend fun sendMessage(channelId: String, content: String): Message {
        return APIClient.http.post("${APIClient.baseUrl}/messages") {
            contentType(ContentType.Application.Json)
            setBody(SendMessageBody(channelId, content))
        }.body()
    }

    suspend fun tasks(projectId: String): List<Task> = APIClient.request("/projects/$projectId/tasks")

    suspend fun createTask(projectId: String, title: String, description: String?): Task {
        return APIClient.http.post("${APIClient.baseUrl}/tasks") {
            contentType(ContentType.Application.Json)
            setBody(NewTask(projectId, title, description))
        }.body()
    }

    suspend fun sfuToken(meetingId: String): SfuToken {
        return APIClient.http.post("${APIClient.baseUrl}/meetings/$meetingId/sfu-token").body()
    }

    suspend fun myContext(organisationId: String): UserContext {
        setActiveOrg(organisationId)
        return APIClient.request("/organisations/$organisationId/me/context")
    }

    suspend fun login(email: String, password: String): UserDto {
        val response: LoginResponse = APIClient.http.post("${APIClient.baseUrl}/auth/login") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("email" to email, "password" to password))
        }.body()
        storeTokens(response.tokens)
        return response.user
    }

    suspend fun refreshAccessToken(): String? = refreshMutex.withLock {
        val refresh = refreshToken() ?: return null
        val tokens: TokenPair = APIClient.http.post("${APIClient.baseUrl}/auth/refresh") {
            contentType(ContentType.Application.Json)
            setBody(mapOf("refreshToken" to refresh))
        }.body()
        storeTokens(tokens)
        tokens.accessToken
    }

    fun logout() {
        prefs.edit().remove(KEY_ACCESS).remove(KEY_REFRESH).apply()
        activeOrganisationId = null
    }

    private fun storeTokens(tokens: TokenPair) {
        prefs.edit()
            .putString(KEY_ACCESS, tokens.accessToken)
            .putString(KEY_REFRESH, tokens.refreshToken)
            .apply()
    }
}
