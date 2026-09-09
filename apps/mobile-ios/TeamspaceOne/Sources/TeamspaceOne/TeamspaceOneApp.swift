import SwiftUI

@main
struct TeamspaceOneApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    DeepLinkManager.shared.handle(url)
                }
        }
    }
}
