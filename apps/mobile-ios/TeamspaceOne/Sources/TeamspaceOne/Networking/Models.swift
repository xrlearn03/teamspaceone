import Foundation

struct TokenPair: Codable, Sendable {
    let accessToken: String
    let refreshToken: String
    let expiresIn: Int
}

struct UserDto: Codable, Sendable {
    let id: String
    let email: String
    let firstName: String?
    let lastName: String?
    let avatarFileId: String?
    let active: Bool
    let emailVerified: Bool
    let mustChangePassword: Bool?
    let createdAt: String
}

struct LoginResponse: Codable, Sendable {
    let user: UserDto
    let tokens: TokenPair
}

struct Organisation: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let slug: String
    let ownerId: String
    let createdAt: String
}

struct UserDataScope: Codable, Sendable {
    let module: String
    let scope: String
    let scopeValue: String?
}

struct UserContext: Codable, Sendable {
    let id: String
    let organisationId: String
    let permissions: [String]
    let dataScopes: [UserDataScope]
    let isSuperAdmin: Bool?
}

struct Channel: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let type: String
    let organisationId: String
    let workspaceId: String?
    let createdAt: String
}

struct Project: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let description: String?
    let status: String
    let organisationId: String
    let workspaceId: String?
    let createdAt: String
}

struct MessageAttachment: Codable, Sendable {
    let id: String
    let messageId: String
    let fileId: String
    let createdAt: String
}

struct MessageReaction: Codable, Sendable {
    let id: String
    let messageId: String
    let userId: String
    let emoji: String
    let createdAt: String
}

struct MessageMention: Codable, Sendable {
    let messageId: String
    let userId: String
    let createdAt: String
}

struct Message: Codable, Sendable, Identifiable {
    let id: String
    let channelId: String
    let senderId: String
    let parentMessageId: String?
    let content: String
    let editedAt: String?
    let deletedAt: String?
    let pinnedAt: String?
    let createdAt: String
    let updatedAt: String
    let attachments: [MessageAttachment]
    let reactions: [MessageReaction]?
    let mentions: [MessageMention]?
}

struct MessagePage: Codable, Sendable {
    let items: [Message]
    let nextCursor: String?
}

struct TaskDto: Codable, Sendable, Identifiable {
    let id: String
    let organisationId: String
    let projectId: String
    let sourceMessageId: String?
    let sourceChannelId: String?
    let title: String
    let description: String?
    let assigneeId: String?
    let status: String
    let priority: String
    let position: Int
    let startDate: String?
    let dueDate: String?
    let completedAt: String?
    let createdAt: String
    let updatedAt: String
}

struct NewTask: Codable, Sendable {
    let projectId: String
    let title: String
    let description: String?
    let status: String?
    let priority: String?
    let position: Int?
}

struct FileRecord: Codable, Sendable, Identifiable {
    let id: String
    let organisationId: String
    let workspaceId: String?
    let resourceType: String?
    let resourceId: String?
    let category: String
    let uploaderId: String
    let originalName: String
    let mimeType: String
    let size: Int
    let status: String
    let url: String?
    let downloadUrl: String?
    let previewUrl: String?
    let thumbnailUrl: String?
    let createdAt: String
    let updatedAt: String
}

struct PresignUploadResponse: Codable, Sendable {
    let id: String
    let uploadUrl: String
    let storageKey: String
    let uploadHeaders: [String: String]
}

struct SfuToken: Codable, Sendable {
    let token: String
}

struct SfuSignal: Codable, Sendable {
    let type: String
    let participant_id: String?
    let room_id: String?
    let participants: [SfuParticipant]?
    let display_name: String?
    let user_id: String?
    let from: String?
    let sdp: String?
    let candidate: String?
    let sdp_m_line_index: Int?
    let sdp_mid: String?
    let message: String?
}

struct SfuParticipant: Codable, Sendable, Identifiable {
    let id: String
    let display_name: String
    let user_id: String?
}

enum APIError: Error, Sendable {
    case unauthorized
    case http(Int, String)
    case decoding
    case noData
}
