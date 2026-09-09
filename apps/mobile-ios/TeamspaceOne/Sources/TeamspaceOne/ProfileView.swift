import SwiftUI

struct ProfileView: View {
    let user: UserDto?
    let organisations: [Organisation]
    let context: UserContext?
    let onSelectOrganisation: (String) -> Void
    let onSignOut: () -> Void

    @StateObject private var realtime = RealtimeManager.shared

    var body: some View {
        NavigationStack {
            List {
                if let user = user {
                    Section("User") {
                        Text(user.email)
                        let name = [user.firstName, user.lastName]
                            .compactMap({ $0 })
                            .joined(separator: " ")
                            .trimmingCharacters(in: .whitespaces)
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
                                onSelectOrganisation(org.id)
                            }
                            .foregroundStyle(
                                context?.organisationId == org.id ? Color.accentColor : Color.primary
                            )
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
                        onSignOut()
                    }
                    .foregroundStyle(.red)
                }
            }
            .navigationTitle("Profile")
        }
    }
}
