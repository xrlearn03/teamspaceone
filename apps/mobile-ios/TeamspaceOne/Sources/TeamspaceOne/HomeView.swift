import SwiftUI

struct HomeView: View {
    @State private var user: UserDto?
    @State private var organisations: [Organisation] = []
    @State private var context: UserContext?
    @State private var status = "Loading..."
    @State private var isLoading = true
    @StateObject private var realtime = RealtimeManager.shared

    var body: some View {
        NavigationStack {
            List {
                if let user = user {
                    Section("User") {
                        Text(user.email)
                        let name = [user.firstName, user.lastName].compactMap({ $0 }).joined(separator: " ").trimmingCharacters(in: .whitespaces)
                        if !name.isEmpty {
                            Text(name)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section("Organisations") {
                    if organisations.isEmpty {
                        Text("No organisations")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(organisations) { org in
                            Button(org.name) {
                                Task { await selectOrganisation(org.id) }
                            }
                        }
                    }
                }

                if let context = context {
                    Section("Context") {
                        Text("Organisation: \(context.organisationId)")
                        Text("Permissions: \(context.permissions.count)")
                        if context.isSuperAdmin == true {
                            Text("Super admin")
                        }
                    }
                }

                Section("Collaboration") {
                    NavigationLink("Channels", destination: ChannelsView())
                    NavigationLink("Projects", destination: ProjectsView())
                    NavigationLink("Meeting", destination: MeetingView())
                }

                Section("Realtime") {
                    Text(realtime.isConnected ? "Connected" : "Disconnected")
                        .foregroundStyle(realtime.isConnected ? .green : .secondary)
                    ForEach(Array(realtime.events.enumerated()), id: \.offset) { _, event in
                        Text(event)
                            .font(.caption)
                    }
                }

                Section {
                    Button("Sign Out") {
                        Task { await signOut() }
                    }
                    .foregroundStyle(.red)
                }
            }
            .navigationTitle("Home")
            .overlay {
                if isLoading {
                    ProgressView()
                }
            }
            .task {
                await load()
            }
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

    private func signOut() async {
        realtime.disconnect()
        await AuthManager.shared.logout()
        user = nil
        organisations = []
        context = nil
    }
}
