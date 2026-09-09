import SwiftUI

struct MainTabView: View {
    let onSignOut: () -> Void

    @State private var selection = 0
    @State private var user: UserDto?
    @State private var organisations: [Organisation] = []
    @State private var context: UserContext?
    @State private var isLoading = true
    @State private var status = "Loading..."
    @StateObject private var realtime = RealtimeManager.shared

    var body: some View {
        Group {
            if isLoading {
                ProgressView("Loading...")
            } else if organisations.isEmpty {
                ContentUnavailableView {
                    Label("No Organisation", systemImage: "building.2")
                } description: {
                    Text("Create or join an organisation to continue.")
                } actions: {
                    Button("Sign Out", role: .destructive) {
                        signOut()
                    }
                }
            } else {
                TabView(selection: $selection) {
                    NavigationStack {
                        ChannelsView()
                    }
                    .tabItem {
                        Label("Channels", systemImage: "message.fill")
                    }
                    .tag(0)

                    NavigationStack {
                        ProjectsView()
                    }
                    .tabItem {
                        Label("Projects", systemImage: "folder.fill")
                    }
                    .tag(1)

                    NavigationStack {
                        FilesView()
                    }
                    .tabItem {
                        Label("Files", systemImage: "doc.fill")
                    }
                    .tag(2)

                    NavigationStack {
                        MeetingView()
                    }
                    .tabItem {
                        Label("Meeting", systemImage: "video.fill")
                    }
                    .tag(3)

                    ProfileView(
                        user: user,
                        organisations: organisations,
                        context: context,
                        onSelectOrganisation: { id in
                            Task { await selectOrganisation(id) }
                        },
                        onSignOut: signOut
                    )
                    .tabItem {
                        Label("Profile", systemImage: "person.fill")
                    }
                    .tag(4)
                }
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        do {
            user = try await AuthManager.shared.me()
            organisations = try await AuthManager.shared.organisations()
            if let first = organisations.first {
                context = try await AuthManager.shared.myContext(organisationId: first.id)
                if let token = await AuthManager.shared.accessToken() {
                    realtime.connect(token: token, organisationId: first.id)
                }
            } else {
                status = "Create or join an organisation to continue."
            }
        } catch {
            status = "Error: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func selectOrganisation(_ id: String) async {
        do {
            context = try await AuthManager.shared.myContext(organisationId: id)
        } catch {
            status = "Error: \(error.localizedDescription)"
        }
    }

    private func signOut() {
        realtime.disconnect()
        Task {
            await AuthManager.shared.logout()
            await MainActor.run {
                onSignOut()
            }
        }
    }
}
