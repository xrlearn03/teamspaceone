import SwiftUI
import UniformTypeIdentifiers

struct FilesView: View {
    @State private var files: [FileRecord] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showImporter = false

    var body: some View {
        NavigationStack {
            Group {
                if let errorMessage, files.isEmpty {
                    ContentUnavailableView {
                        Label("Couldn't load files", systemImage: "exclamationmark.triangle")
                    } description: {
                        Text(errorMessage)
                    } actions: {
                        Button("Try Again") {
                            Task { await load() }
                        }
                    }
                } else if files.isEmpty && !isLoading {
                    ContentUnavailableView {
                        Label("No files yet", systemImage: "doc")
                    } description: {
                        Text("Upload a file to see it here.")
                    }
                } else {
                    List(files) { file in
                        if let urlString = file.downloadUrl ?? file.url, let url = URL(string: urlString) {
                            Link(destination: url) {
                                FileRow(file: file)
                            }
                        } else {
                            FileRow(file: file)
                        }
                    }
                    .refreshable {
                        await load()
                    }
                }
            }
            .navigationTitle("Files")
            .toolbar {
                Button("Upload") { showImporter = true }
                    .disabled(isLoading)
            }
            .overlay {
                if isLoading { ProgressView() }
            }
            .fileImporter(
                isPresented: $showImporter,
                allowedContentTypes: [UTType.data],
                allowsMultipleSelection: false
            ) { result in
                handleImport(result)
            }
            .task {
                await load()
            }
            .alert(errorMessage ?? "", isPresented: .constant(errorMessage != nil)) {
                Button("OK") { errorMessage = nil }
            }
        }
    }

    private func load() async {
        isLoading = files.isEmpty
        errorMessage = nil
        do {
            files = try await FileService.listFiles()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }

    private func handleImport(_ result: Result<[URL], Error>) {
        do {
            let urls = try result.get()
            guard let url = urls.first else { return }
            Task {
                await upload(url)
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func upload(_ url: URL) async {
        guard let orgId = await AuthManager.shared.activeOrganisationId else {
            errorMessage = "No organisation selected"
            return
        }
        isLoading = true
        do {
            _ = try await FileService.uploadFile(url: url, organisationId: orgId)
            await load()
        } catch {
            errorMessage = error.localizedDescription
        }
        isLoading = false
    }
}

private struct FileRow: View {
    let file: FileRecord

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: fileTypeIcon(for: file.mimeType))
                .font(.title2)
                .foregroundStyle(Color.accentColor)
                .frame(width: 40, height: 40)

            VStack(alignment: .leading, spacing: 2) {
                Text(file.originalName)
                    .lineLimit(1)
                    .font(.body)

                Text("\(byteCount(file.size)) • \(formattedDate(file.createdAt))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
    }

    private func byteCount(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }

    private func formattedDate(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) else {
            return iso
        }
        let output = DateFormatter()
        output.dateStyle = .medium
        output.timeStyle = .short
        return output.string(from: date)
    }

    private func fileTypeIcon(for mimeType: String) -> String {
        let lower = mimeType.lowercased()
        if lower.hasPrefix("image/") { return "photo" }
        if lower.hasPrefix("video/") { return "film" }
        if lower.hasPrefix("audio/") { return "headphones" }
        if lower.contains("pdf") || lower.contains("document") || lower.hasPrefix("text/") {
            return "doc.text"
        }
        return "doc"
    }
}
