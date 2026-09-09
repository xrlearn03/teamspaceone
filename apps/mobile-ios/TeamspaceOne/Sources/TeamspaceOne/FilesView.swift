import SwiftUI
import UniformTypeIdentifiers

struct FilesView: View {
    @State private var files: [FileRecord] = []
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showImporter = false

    var body: some View {
        List {
            if files.isEmpty && !isLoading {
                Section {
                    Text("No files yet")
                        .foregroundStyle(.secondary)
                }
            }

            ForEach(files) { file in
                if let urlString = file.downloadUrl ?? file.url, let url = URL(string: urlString) {
                    Link(destination: url) {
                        FileRow(file: file)
                    }
                } else {
                    FileRow(file: file)
                }
            }
        }
        .navigationTitle("Files")
        .toolbar {
            Button("Upload") { showImporter = true }
                .disabled(isLoading)
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
        .overlay {
            if isLoading { ProgressView() }
        }
        .alert(errorMessage ?? "", isPresented: .constant(errorMessage != nil)) {
            Button("OK") { errorMessage = nil }
        }
    }

    private func load() async {
        isLoading = true
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

    private func byteCount(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}

private struct FileRow: View {
    let file: FileRecord

    var body: some View {
        VStack(alignment: .leading) {
            Text(file.originalName)
                .lineLimit(1)
            Text("\(byteCount(file.size)) • \(file.status)")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func byteCount(_ bytes: Int) -> String {
        ByteCountFormatter.string(fromByteCount: Int64(bytes), countStyle: .file)
    }
}
