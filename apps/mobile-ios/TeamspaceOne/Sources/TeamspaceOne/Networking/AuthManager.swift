import Foundation
import Security

actor AuthManager {
    static let shared = AuthManager()

    private let service = "com.edutapxr.teamspaceone"
    private let accessTokenAccount = "accessToken"
    private let refreshTokenAccount = "refreshToken"

    var activeOrganisationId: String?

    private init() {}

    func login(email: String, password: String) async throws -> UserDto {
        let body = ["email": email, "password": password]
        let response: LoginResponse = try await APIClient.request(
            "/auth/login",
            method: "POST",
            body: body,
            requiresAuth: false
        )
        try await store(tokens: response.tokens)
        return response.user
    }

    func logout() async {
        if let refresh = try? await readToken(account: refreshTokenAccount) {
            let _: EmptyResponse? = try? await APIClient.request(
                "/auth/logout",
                method: "POST",
                body: ["refreshToken": refresh],
                requiresAuth: false,
                retry: false
            )
        }
        try? await deleteToken(account: accessTokenAccount)
        try? await deleteToken(account: refreshTokenAccount)
        activeOrganisationId = nil
    }

    func accessToken() async -> String? {
        return try? await readToken(account: accessTokenAccount)
    }

    func setActiveOrganisation(_ id: String?) {
        activeOrganisationId = id
    }

    func me() async throws -> UserDto {
        try await APIClient.request("/auth/me")
    }

    func organisations() async throws -> [Organisation] {
        try await APIClient.request("/organisations")
    }

    func myContext(organisationId: String) async throws -> UserContext {
        activeOrganisationId = organisationId
        return try await APIClient.request("/organisations/\(organisationId)/me/context")
    }

    func channels() async throws -> [Channel] {
        try await APIClient.request("/channels")
    }

    func projects() async throws -> [Project] {
        try await APIClient.request("/projects")
    }

    func messages(channelId: String) async throws -> [Message] {
        let page: MessagePage = try await APIClient.request("/channels/\(channelId)/messages")
        return page.items
    }

    func sendMessage(channelId: String, content: String) async throws -> Message {
        let body: [String: String] = [
            "channelId": channelId,
            "content": content
        ]
        return try await APIClient.request("/messages", method: "POST", body: body)
    }

    func tasks(projectId: String) async throws -> [TaskDto] {
        try await APIClient.request("/projects/\(projectId)/tasks")
    }

    func createTask(projectId: String, title: String, description: String?) async throws -> TaskDto {
        let body = NewTask(
            projectId: projectId,
            title: title,
            description: description,
            status: nil,
            priority: nil,
            position: nil
        )
        return try await APIClient.request("/tasks", method: "POST", body: body)
    }

    func sfuToken(meetingId: String) async throws -> SfuToken {
        try await APIClient.request("/meetings/\(meetingId)/sfu-token", method: "POST")
    }

    func refreshAccessToken() async throws -> String? {
        guard let refresh = try await readToken(account: refreshTokenAccount) else {
            return nil
        }
        let tokens: TokenPair = try await APIClient.request(
            "/auth/refresh",
            method: "POST",
            body: ["refreshToken": refresh],
            requiresAuth: false,
            retry: false
        )
        try await store(tokens: tokens)
        return tokens.accessToken
    }

    private func store(tokens: TokenPair) async throws {
        try await setToken(tokens.accessToken, account: accessTokenAccount)
        try await setToken(tokens.refreshToken, account: refreshTokenAccount)
    }

    private func setToken(_ token: String, account: String) async throws {
        try await deleteToken(account: account)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: token.data(using: .utf8)!
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw APIError.http(0, "Keychain write failed")
        }
    }

    private func readToken(account: String) async throws -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess else {
            if status == errSecItemNotFound { return nil }
            throw APIError.http(0, "Keychain read failed")
        }
        guard let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
            return nil
        }
        return token
    }

    private func deleteToken(account: String) async throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
