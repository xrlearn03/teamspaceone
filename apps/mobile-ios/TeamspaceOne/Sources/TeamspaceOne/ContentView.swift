import SwiftUI

struct ContentView: View {
    @State private var isAuthenticated: Bool?

    var body: some View {
        Group {
            if let isAuthenticated = isAuthenticated {
                if isAuthenticated {
                    MainTabView(onSignOut: { self.isAuthenticated = false })
                } else {
                    LoginView(onAuthenticated: { self.isAuthenticated = true })
                }
            } else {
                ProgressView("Starting...")
            }
        }
        .task {
            let token = await AuthManager.shared.accessToken()
            isAuthenticated = token != nil
        }
    }
}

struct LoginView: View {
    let onAuthenticated: () -> Void

    @State private var email = ""
    @State private var password = ""
    @State private var status = "Enter your credentials"
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Login") {
                    TextField("Email", text: $email)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                    SecureField("Password", text: $password)
                }

                Section {
                    Button("Sign In") {
                        signIn()
                    }
                    .disabled(email.isEmpty || password.isEmpty || isLoading)
                }

                if isLoading {
                    ProgressView()
                }

                Text(status)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .navigationTitle("Teamspace One")
        }
    }

    private func signIn() {
        isLoading = true
        status = "Signing in…"
        Task {
            do {
                _ = try await AuthManager.shared.login(email: email, password: password)
                onAuthenticated()
            } catch {
                status = "Error: \(error.localizedDescription)"
            }
            isLoading = false
        }
    }
}
