import Foundation
import SwiftUI
import GoogleSignIn
import GoogleSignInSwift

#if os(iOS)
struct NativeGoogleButton: UIViewRepresentable {
    let isEnabled: Bool
    let action: () -> Void
    func makeCoordinator() -> Coordinator { Coordinator(action: action) }
    func makeUIView(context: Context) -> GIDSignInButton {
        let button = GIDSignInButton()
        button.style = .wide
        button.colorScheme = .light
        button.accessibilityIdentifier = "auth.google"
        button.addTarget(context.coordinator, action: #selector(Coordinator.signIn), for: .touchUpInside)
        return button
    }
    func updateUIView(_ button: GIDSignInButton, context: Context) {
        button.isEnabled = isEnabled
        context.coordinator.action = action
    }
    final class Coordinator: NSObject {
        var action: () -> Void
        init(action: @escaping () -> Void) { self.action = action }
        @objc func signIn() { action() }
    }
}
#else
struct NativeGoogleButton: View {
    let isEnabled: Bool
    let action: () -> Void
    var body: some View {
        GoogleSignInButton(scheme: .light, style: .wide, state: isEnabled ? .normal : .disabled, action: action)
    }
}
#endif

enum SessionError: LocalizedError {
    case storage, google, configuration, presentation
    var errorDescription: String? {
        switch self {
        case .storage: return "Could not securely save your session. Please try again."
        case .google: return "Google sign-in could not be completed. Try again."
        case .configuration: return "Google sign-in is not available in this build. You can sign in with email and password."
        case .presentation: return "Could not open Google sign-in. Please try again."
        }
    }
}

@MainActor enum GoogleAuthentication {
    static func configurationIsValid(clientID: String?, serverID: String?, urlSchemes: [String]) -> Bool {
        guard let clientID, let serverID,
              clientID.hasSuffix(".apps.googleusercontent.com"),
              serverID.hasSuffix(".apps.googleusercontent.com") else { return false }
        let callback = clientID.split(separator: ".").reversed().joined(separator: ".")
        return urlSchemes.contains(callback)
    }

    static var isConfigured: Bool {
        guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
              let serverID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String,
              let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] else { return false }
        let schemes = urlTypes.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        return configurationIsValid(clientID: clientID, serverID: serverID, urlSchemes: schemes)
    }

    static func idToken() async throws -> String {
        guard let clientID = Bundle.main.object(forInfoDictionaryKey: "GIDClientID") as? String,
              let serverID = Bundle.main.object(forInfoDictionaryKey: "GIDServerClientID") as? String,
              isConfigured else { throw SessionError.configuration }
        let callback = clientID.split(separator: ".").reversed().joined(separator: ".")
        let urlTypes = Bundle.main.object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]] ?? []
        guard urlTypes.contains(where: { ($0["CFBundleURLSchemes"] as? [String] ?? []).contains(callback) }) else {
            throw SessionError.configuration
        }
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID, serverClientID: serverID)
        #if os(iOS)
        guard let scene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
              var presenter = scene.windows.first(where: \.isKeyWindow)?.rootViewController else {
            throw SessionError.presentation
        }
        while let presented = presenter.presentedViewController { presenter = presented }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        #else
        guard let window = NSApplication.shared.keyWindow else { throw SessionError.presentation }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: window)
        #endif
        guard let token = result.user.idToken?.tokenString else { throw SessionError.google }
        return token
    }
}
