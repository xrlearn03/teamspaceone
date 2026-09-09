package com.teamspaceone.mobile.data.remote

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class TokenPair(
    @SerialName("accessToken") val accessToken: String,
    @SerialName("refreshToken") val refreshToken: String,
    @SerialName("expiresIn") val expiresIn: Int
)

@Serializable
data class UserDto(
    @SerialName("id") val id: String,
    @SerialName("email") val email: String,
    @SerialName("firstName") val firstName: String? = null,
    @SerialName("lastName") val lastName: String? = null,
    @SerialName("avatarFileId") val avatarFileId: String? = null,
    @SerialName("active") val active: Boolean,
    @SerialName("emailVerified") val emailVerified: Boolean,
    @SerialName("mustChangePassword") val mustChangePassword: Boolean? = null,
    @SerialName("createdAt") val createdAt: String
)

@Serializable
data class LoginResponse(
    @SerialName("user") val user: UserDto,
    @SerialName("tokens") val tokens: TokenPair
)

@Serializable
data class Organisation(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("slug") val slug: String,
    @SerialName("ownerId") val ownerId: String,
    @SerialName("createdAt") val createdAt: String
)

@Serializable
data class UserDataScope(
    @SerialName("module") val module: String,
    @SerialName("scope") val scope: String,
    @SerialName("scopeValue") val scopeValue: String? = null
)

@Serializable
data class UserContext(
    @SerialName("id") val id: String,
    @SerialName("organisationId") val organisationId: String,
    @SerialName("permissions") val permissions: List<String> = emptyList(),
    @SerialName("dataScopes") val dataScopes: List<UserDataScope> = emptyList(),
    @SerialName("isSuperAdmin") val isSuperAdmin: Boolean? = null
)

@Serializable
data class Channel(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("type") val type: String,
    @SerialName("organisationId") val organisationId: String,
    @SerialName("workspaceId") val workspaceId: String? = null,
    @SerialName("createdAt") val createdAt: String
)

@Serializable
data class Project(
    @SerialName("id") val id: String,
    @SerialName("name") val name: String,
    @SerialName("description") val description: String? = null,
    @SerialName("status") val status: String,
    @SerialName("organisationId") val organisationId: String,
    @SerialName("workspaceId") val workspaceId: String? = null,
    @SerialName("createdAt") val createdAt: String
)

@Serializable
data class Message(
    @SerialName("id") val id: String,
    @SerialName("channelId") val channelId: String,
    @SerialName("senderId") val senderId: String,
    @SerialName("parentMessageId") val parentMessageId: String? = null,
    @SerialName("content") val content: String,
    @SerialName("editedAt") val editedAt: String? = null,
    @SerialName("deletedAt") val deletedAt: String? = null,
    @SerialName("pinnedAt") val pinnedAt: String? = null,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("updatedAt") val updatedAt: String
)

@Serializable
data class MessagePage(
    @SerialName("items") val items: List<Message>,
    @SerialName("nextCursor") val nextCursor: String? = null
)

@Serializable
data class SendMessageBody(
    @SerialName("channelId") val channelId: String,
    @SerialName("content") val content: String
)

@Serializable
data class Task(
    @SerialName("id") val id: String,
    @SerialName("organisationId") val organisationId: String,
    @SerialName("projectId") val projectId: String,
    @SerialName("sourceMessageId") val sourceMessageId: String? = null,
    @SerialName("sourceChannelId") val sourceChannelId: String? = null,
    @SerialName("title") val title: String,
    @SerialName("description") val description: String? = null,
    @SerialName("assigneeId") val assigneeId: String? = null,
    @SerialName("status") val status: String,
    @SerialName("priority") val priority: String,
    @SerialName("position") val position: Int,
    @SerialName("startDate") val startDate: String? = null,
    @SerialName("dueDate") val dueDate: String? = null,
    @SerialName("completedAt") val completedAt: String? = null,
    @SerialName("createdAt") val createdAt: String,
    @SerialName("updatedAt") val updatedAt: String
)

@Serializable
data class NewTask(
    @SerialName("projectId") val projectId: String,
    @SerialName("title") val title: String,
    @SerialName("description") val description: String? = null,
    @SerialName("status") val status: String? = null,
    @SerialName("priority") val priority: String? = null,
    @SerialName("position") val position: Int? = null
)

@Serializable
data class SfuToken(
    @SerialName("token") val token: String
)

@Serializable
data class SfuParticipant(
    @SerialName("id") val id: String,
    @SerialName("display_name") val displayName: String,
    @SerialName("user_id") val userId: String? = null
)

@Serializable
data class SfuSignal(
    @SerialName("type") val type: String,
    @SerialName("participant_id") val participantId: String? = null,
    @SerialName("room_id") val roomId: String? = null,
    @SerialName("participants") val participants: List<SfuParticipant>? = null,
    @SerialName("display_name") val displayName: String? = null,
    @SerialName("user_id") val userId: String? = null,
    @SerialName("from") val from: String? = null,
    @SerialName("sdp") val sdp: String? = null,
    @SerialName("candidate") val candidate: String? = null,
    @SerialName("sdp_m_line_index") val sdpMLineIndex: Int? = null,
    @SerialName("sdp_mid") val sdpMid: String? = null,
    @SerialName("message") val message: String? = null
)

class APIError(message: String, val status: Int = 0) : Exception(message)
