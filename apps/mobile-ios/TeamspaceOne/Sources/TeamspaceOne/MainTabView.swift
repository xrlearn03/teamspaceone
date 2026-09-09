import SwiftUI

private enum MainSection: String, CaseIterable, Identifiable {
    case channels, projects, files, meeting, profile

    var id: String { rawValue }

    var title: String {
        switch self {
        case .channels: return "Channels"
        case .projects: return "Projects"
        case .files: return "Files"
        case .meeting: return "Meeting"
        case .profile: return "Profile"
        }
    }

    var icon: String {
        switch self {
        case .channels: return "message.fill"
        case .projects: return "folder.fill"
        case .files: return "doc.fill"
        case .meeting: return "video.fill"
        case .profile: return "person.fill"
        }
    }
}

struct MainTabView: View {
    let onSignOut: () -> Void

    @State private var user: UserDto?
    @State private var organisations: [Organisation] = []
    @State private var context: UserContext?
    @State private var isLoading = true
    @State private var status = "Loading..."
    @State private var selectedSection: MainSection? = .channels
    @StateObject private var realtime = RealtimeManager.shared
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

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
            } else if horizontalSizeClass == .regular {
                splitView
            } else {
                tabView
            }
        }
        .task {
            await load()
        }
    }

    @ViewBuilder
    private var splitView: some View {
        NavigationSplitView {
            List(selection: $selectedSection) {
                ForEach(MainSection.allCases) { section in
                    Label(section.title, systemImage: section.icon)
                        .tag(section)
                }
            }
            .navigationTitle("Teamspace")
        } detail: {
            NavigationStack {
                if let section = selectedSection {
                    detailContent(for: section)
                        .navigationTitle(section.title)
                } else {
                    Text("Select a section")
                        .navigationTitle("Teamspace")
                }
            }
        }
    }

    @ViewBuilder
    private var tabView: some View {
        TabView {
            NavigationStack {
                ChannelsView()
            }
            .tabItem {
                Label("Channels", systemImage: "message.fill")
            }

            NavigationStack {
                ProjectsView()
            }
            .tabItem {
                Label("Projects", systemImage: "folder.fill")
            }

            NavigationStack {
                FilesView()
            }
            .tabItem {
                Label("Files", systemImage: "doc.fill")
            }

            NavigationStack {
                MeetingView()
            }
            .tabItem {
                Label("Meeting", systemImage: "video.fill")
            }

            NavigationStack {
                ProfileView(
                    user: user,
                    organisations: organisations,
                    context: context,
                    onSelectOrganisation: { id in
                        Task { await selectOrganisation(id) }
                    },
                    onSignOut: signOut
                )
            }
            .tabItem {
                Label("Profile", systemImage: "person.fill")
            }
        }
    }

    @ViewBuilder
    private func detailContent(for section: MainSection) -> some View {
        switch section {
        case .channels:
            ChannelsView()
        case .projects:
            ProjectsView()
        case .files:
            FilesView()
        case .meeting:
            MeetingView()
        case .profile:
            ProfileView(
                user: user,
                organisations: organisations,
                context: context,
                onSelectOrganisation: { id in
                    Task { await selectOrganisation(id) }
                },
                onSignOut: signOut
            )
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
