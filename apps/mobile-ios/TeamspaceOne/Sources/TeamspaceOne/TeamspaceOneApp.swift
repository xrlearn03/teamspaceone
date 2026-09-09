import SwiftUI

@main
struct TeamspaceOneApp: App {
    @UIApplicationDelegateAdaptor(PushNotificationManager.self) var pushManager

    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    DeepLinkManager.shared.handle(url)
                }
        }
    }
}
