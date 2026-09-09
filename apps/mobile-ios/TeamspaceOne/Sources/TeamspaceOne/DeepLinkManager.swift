import Foundation
import Combine

@MainActor
final class DeepLinkManager: ObservableObject {
    static let shared = DeepLinkManager()

    @Published private(set) var pendingURL: URL?

    func handle(_ url: URL) {
        pendingURL = url
    }

    func consume() -> URL? {
        let url = pendingURL
        pendingURL = nil
        return url
    }
}
