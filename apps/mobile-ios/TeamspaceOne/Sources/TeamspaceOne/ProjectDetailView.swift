import SwiftUI

struct ProjectDetailView: View {
    let project: Project
    @State private var tasks: [TaskDto] = []
    @State private var newTitle = ""
    @State private var newDescription = ""
    @State private var isLoading = false
    @State private var status = ""
    @State private var showAdd = false

    var body: some View {
        VStack(spacing: 0) {
            Form {
                Section("Project") {
                    if let description = project.description, !description.isEmpty {
                        Text(description)
                    }
                    Text(project.status)
                        .foregroundStyle(.secondary)
                }

                Section("Tasks") {
                    if isLoading && tasks.isEmpty {
                        ProgressView()
                    } else if tasks.isEmpty {
                        Text("No tasks yet")
                            .foregroundStyle(.secondary)
                    } else {
                        ForEach(tasks) { task in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(task.title)
                                    .font(.headline)
                                if let description = task.description, !description.isEmpty {
                                    Text(description)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Text("\(task.status) · \(task.priority)")
                                    .font(.caption2)
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                }
            }

            if showAdd {
                VStack(spacing: 8) {
                    TextField("Task title", text: $newTitle)
                        .textFieldStyle(.roundedBorder)
                    TextField("Description", text: $newDescription, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                    HStack {
                        Button("Cancel") {
                            showAdd = false
                            newTitle = ""
                            newDescription = ""
                        }
                        Spacer()
                        Button("Create") {
                            Task { await create() }
                        }
                        .disabled(newTitle.trimmingCharacters(in: .whitespaces).isEmpty)
                    }
                }
                .padding()
                .background(.ultraThinMaterial)
            }
        }
        .navigationTitle(project.name)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button("Add") {
                    showAdd = true
                }
            }
        }
        .task {
            await load()
        }
    }

    private func load() async {
        isLoading = true
        do {
            tasks = try await AuthManager.shared.tasks(projectId: project.id)
        } catch {
            status = "Error: \(error.localizedDescription)"
        }
        isLoading = false
    }

    private func create() async {
        let title = newTitle.trimmingCharacters(in: .whitespaces)
        guard !title.isEmpty else { return }
        do {
            _ = try await AuthManager.shared.createTask(
                projectId: project.id,
                title: title,
                description: newDescription.isEmpty ? nil : newDescription
            )
            newTitle = ""
            newDescription = ""
            showAdd = false
            await load()
        } catch {
            status = "Create failed: \(error.localizedDescription)"
        }
    }
}
