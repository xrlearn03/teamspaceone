package com.teamspaceone.mobile.data.remote

import io.ktor.client.HttpClient
import io.ktor.client.call.body
import io.ktor.client.engine.android.Android
import io.ktor.client.plugins.auth.Auth
import io.ktor.client.plugins.auth.providers.BearerTokens
import io.ktor.client.plugins.auth.providers.bearer
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.Logging
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.headers
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.ContentType
import io.ktor.http.contentType
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

import com.teamspaceone.mobile.BuildConfig

object APIClient {
    const val baseUrl = BuildConfig.API_BASE_URL

    val http = HttpClient(Android) {
        expectSuccess = true
        install(ContentNegotiation) {
            json(Json {
                ignoreUnknownKeys = true
                prettyPrint = true
            })
        }
        install(Logging)
        install(WebSockets)
        install(Auth) {
            bearer {
                loadTokens {
                    AuthManager.accessToken()?.let { BearerTokens(it, AuthManager.refreshToken() ?: "") }
                }
                refreshTokens {
                    val new = AuthManager.refreshAccessToken()
                    new?.let { BearerTokens(it, AuthManager.refreshToken() ?: "") }
                }
                sendWithoutRequest { request ->
                    request.url.pathSegments.lastOrNull() !in listOf("login", "register", "refresh", "forgot-password", "reset-password")
                }
            }
        }
        defaultRequest {
            header("Accept", "application/json")
            AuthManager.activeOrg()?.let { header("x-organisation-id", it) }
        }
    }

    suspend inline fun <reified T> request(path: String): T {
        return http.get(baseUrl + path).body()
    }

    suspend inline fun <reified T, reified B> post(path: String, body: B): T {
        return http.post(baseUrl + path) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()
    }

    suspend inline fun <reified T, reified B> put(path: String, body: B): T {
        return http.put(baseUrl + path) {
            contentType(ContentType.Application.Json)
            setBody(body)
        }.body()
    }

    suspend fun putBytes(url: String, bytes: ByteArray, headers: Map<String, String>): Boolean {
        val response = http.put(url) {
            headers {
                headers.forEach { (k, v) -> append(k, v) }
            }
            setBody(bytes)
        }
        return response.status.value in 200..299
    }
}
