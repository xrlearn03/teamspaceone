import Foundation
import CryptoKit
import UniformTypeIdentifiers

enum FileService {
    static func listFiles() async throws -> [FileRecord] {
        try await APIClient.request("files")
    }

    static func uploadFile(url: URL, organisationId: String) async throws -> FileRecord {
        let data = try readFile(url)
        let size = data.count
        let sha256 = data.sha256Hex
        let fileName = url.lastPathComponent
        let mimeType = UTType(filenameExtension: url.pathExtension)?.preferredMIMEType ?? "application/octet-stream"
        let category = categoryForMime(mimeType)

        let presign: PresignUploadResponse = try await APIClient.request(
            "files/presign-upload",
            method: "POST",
            body: PresignUploadRequest(
                fileName: fileName,
                mimeType: mimeType,
                size: size,
                category: category,
                sha256: sha256,
                resourceType: "organisation",
                resourceId: organisationId
            )
        )

        var request = URLRequest(url: URL(string: presign.uploadUrl)!)
        request.httpMethod = "PUT"
        request.httpBody = data
        for (key, value) in presign.uploadHeaders {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (_, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw APIError.http(0, "Upload failed")
        }

        return try await APIClient.request(
            "files/\(presign.id)/complete",
            method: "POST",
            body: CompleteUploadRequest(sha256: sha256)
        )
    }

    private static func readFile(_ url: URL) throws -> Data {
        let shouldStop = url.startAccessingSecurityScopedResource()
        defer { if shouldStop { url.stopAccessingSecurityScopedResource() } }
        return try Data(contentsOf: url)
    }

    private static func categoryForMime(_ mime: String) -> String {
        let prefix = mime.split(separator: "/").first.map(String.init) ?? ""
        switch prefix {
        case "image": return "images"
        case "video": return "videos"
        case "audio": return "audio"
        default: break
        }
        switch mime {
        case "application/pdf",
             "text/plain",
             "application/msword",
             "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
            return "documents"
        case "application/vnd.ms-excel",
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
            return "spreadsheets"
        case "application/vnd.ms-powerpoint",
             "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            return "presentations"
        case "application/zip", "application/x-zip-compressed", "application/x-rar-compressed":
            return "archives"
        default:
            return "other"
        }
    }
}

private struct PresignUploadRequest: Codable, Sendable {
    let fileName: String
    let mimeType: String
    let size: Int
    let category: String
    let sha256: String
    let resourceType: String?
    let resourceId: String?
}

private struct CompleteUploadRequest: Codable, Sendable {
    let sha256: String
}

private extension Data {
    var sha256Hex: String {
        CryptoKit.SHA256.hash(data: self).compactMap { String(format: "%02x", $0) }.joined()
    }
}
