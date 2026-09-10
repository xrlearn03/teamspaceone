import SwiftUI

struct ProjectsView: View {
    @State private var projects: [Project] = []
    @State private var isLoading = true
    @State private var errorMessage: String?

    var body: some View {
        List(projects) { project in
            NavigationLink(destination: ProjectDetailView(project: project)) {
                VStack(alignment: .leading) {
                    Text(project.name)
                        .font(.headline)
                    if let description = project.description, !description.isEmpty {
                        Text(description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(project.status)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .navigationTitle("Projects")
        .overlay {
            if isLoading {
                ProgressView()
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        do {
            projects = try await AuthManager.shared.projects()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}
