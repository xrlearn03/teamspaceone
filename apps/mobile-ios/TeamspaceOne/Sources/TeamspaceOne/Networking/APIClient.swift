import Foundation

enum APIClient {
    static let baseURL = Config.apiBaseURL

    @discardableResult
    static func request<T: Decodable & Sendable>(
        _ path: String,
        method: String = "GET",
        body: Encodable? = nil,
        headers: [String: String] = [:],
        requiresAuth: Bool = true,
        retry: Bool = true
    ) async throws -> T {
        let request = try await makeRequest(
            path: path,
            method: method,
            body: body,
            headers: headers,
            requiresAuth: requiresAuth
        )
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.noData
        }

        if http.statusCode == 401, retry, requiresAuth {
            if let newToken = try await AuthManager.shared.refreshAccessToken() {
                var retried = request
                retried.setValue("Bearer \(newToken)", forHTTPHeaderField: "Authorization")
                let (data2, response2) = try await URLSession.shared.data(for: retried)
                guard let http2 = response2 as? HTTPURLResponse else { throw APIError.noData }
                return try await decodeOrThrow(data2, http2)
            } else {
                await AuthManager.shared.logout()
                throw APIError.unauthorized
            }
        }

        return try await decodeOrThrow(data, http)
    }

    private static func makeRequest(
        path: String,
        method: String,
        body: Encodable?,
        headers: [String: String],
        requiresAuth: Bool
    ) async throws -> URLRequest {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if let body = body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
        }

        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        if requiresAuth, let token = await AuthManager.shared.accessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let orgId = await AuthManager.shared.activeOrganisationId {
            request.setValue(orgId, forHTTPHeaderField: "x-organisation-id")
        }

        return request
    }

    private static func decodeOrThrow<T: Decodable & Sendable>(_ data: Data, _ http: HTTPURLResponse) async throws -> T {
        if http.statusCode == 204 {
            if let empty = EmptyResponse() as? T { return empty }
            throw APIError.noData
        }
        if (200..<300).contains(http.statusCode) {
            if T.self == EmptyResponse.self, let empty = EmptyResponse() as? T { return empty }
            do {
                return try JSONDecoder().decode(T.self, from: data)
            } catch {
                throw APIError.decoding
            }
        }
        let text = String(data: data, encoding: .utf8) ?? ""
        throw APIError.http(http.statusCode, text)
    }
}

struct EmptyResponse: Decodable, Sendable {}
