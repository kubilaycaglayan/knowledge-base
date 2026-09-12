import SwiftUI
import GoogleSignInSwift

struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.colorScheme) private var scheme
    @State private var email = ""
    @State private var password = ""
    @State private var register = false
    @State private var emailError: String?
    @State private var passwordError: String?
    @FocusState private var focus: Field?
    private enum Field { case email, password }
    private var dark: Bool { scheme == .dark }
    private var accent: Color { dark ? Color(red: 0.77, green: 0.82, blue: 0.89) : Color(red: 0.20, green: 0.25, blue: 0.33) }

    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Label("Knowledge Base", systemImage: "square.stack.3d.up")
                        .font(.headline).accessibilityAddTraits(.isHeader)
                    VStack(alignment: .leading, spacing: 24) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("YOUR PRIVATE WORKSPACE").font(.caption.weight(.semibold)).tracking(1.5).foregroundStyle(.secondary)
                            Text(register ? "Create account" : "Welcome back").font(.largeTitle.bold()).accessibilityAddTraits(.isHeader)
                            Text("Keep the things you learn, do, and remember in one place.").foregroundStyle(.secondary).fixedSize(horizontal: false, vertical: true)
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email").font(.subheadline.weight(.medium))
                            TextField("you@example.com…", text: $email)
                                .textContentType(.username).autocorrectionDisabled()
                                #if os(iOS)
                                .textInputAutocapitalization(.never).keyboardType(.emailAddress)
                                #endif
                                .focused($focus, equals: .email).submitLabel(.next)
                                .onSubmit { focus = .password }
                                .accessibilityLabel("Email").accessibilityIdentifier("auth.email")
                                .modifier(AuthInput(focused: focus == .email))
                            if let emailError { validation(emailError) }
                        }
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Password").font(.subheadline.weight(.medium))
                            SecureField("At least 9 characters…", text: $password)
                                .textContentType(register ? .newPassword : .password)
                                .focused($focus, equals: .password).submitLabel(.go).onSubmit(submit)
                                .accessibilityLabel("Password").accessibilityIdentifier("auth.password")
                                .modifier(AuthInput(focused: focus == .password))
                            if let passwordError { validation(passwordError) }
                        }
                        Button(action: submit) {
                            HStack {
                                if model.isAuthenticating { ProgressView().tint(dark ? .black : .white) }
                                Text(register ? "Create account" : "Sign in").fontWeight(.semibold)
                            }.frame(maxWidth: .infinity).frame(minHeight: 48)
                        }
                        .buttonStyle(.plain).foregroundStyle(dark ? .black : .white)
                        .background(accent, in: RoundedRectangle(cornerRadius: 6))
                        .accessibilityIdentifier("auth.submit")
                        HStack { Rectangle().frame(height: 1); Text("or continue with").font(.caption).fixedSize(); Rectangle().frame(height: 1) }.foregroundStyle(.secondary)
                        GoogleSignInButton(scheme: dark ? .dark : .light, style: .wide, state: model.isAuthenticating ? .disabled : .normal) {
                            focus = nil
                            Task { await model.authenticateWithGoogle(idToken: GoogleAuthentication.idToken) }
                        }.frame(minHeight: 44).accessibilityIdentifier("auth.google")
                        if let error = model.authError {
                            validation(error).accessibilityIdentifier("auth.error")
                        }
                        Button(register ? "Already have an account? Sign in" : "New here? Create an account") {
                            register.toggle()
                            password = ""
                            emailError = nil
                            passwordError = nil
                            model.authError = nil
                        }.buttonStyle(.plain).foregroundStyle(accent).frame(minHeight: 44)
                            .accessibilityIdentifier("auth.mode")
                    }
                    .disabled(model.isAuthenticating)
                    .padding(24)
                    .background(dark ? Color(red: 0.11, green: 0.14, blue: 0.19) : .white, in: RoundedRectangle(cornerRadius: 8))
                    .overlay(RoundedRectangle(cornerRadius: 8).stroke(.secondary.opacity(0.25)))
                }
                .frame(maxWidth: 440)
                .padding(24)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height)
            }.scrollDismissesKeyboard(.interactively)
        }
        .background(dark ? Color(red: 0.08, green: 0.10, blue: 0.13) : Color(red: 0.97, green: 0.97, blue: 0.98))
    }

    private func validation(_ message: String) -> some View {
        Label(message, systemImage: "exclamationmark.circle").font(.footnote)
            .foregroundStyle(dark ? Color(red: 1, green: 0.67, blue: 0.67) : Color(red: 0.63, green: 0.15, blue: 0.15))
            .fixedSize(horizontal: false, vertical: true)
    }

    private func submit() {
        guard !model.isAuthenticating else { return }
        let trimmed = email.trimmingCharacters(in: .whitespacesAndNewlines)
        emailError = trimmed.contains("@") && !trimmed.hasSuffix("@") && !trimmed.hasPrefix("@") ? nil : "Enter a valid email address."
        passwordError = (9...200).contains(password.count) ? nil : "Use a password of 9 to 200 characters."
        if emailError != nil { focus = .email; return }
        if passwordError != nil { focus = .password; return }
        focus = nil
        Task { await model.authenticate(email: trimmed, password: password, register: register) }
    }
}

private struct AuthInput: ViewModifier {
    var focused: Bool
    func body(content: Content) -> some View {
        content.font(.body).textFieldStyle(.plain).padding(12).frame(minHeight: 48)
            .overlay(RoundedRectangle(cornerRadius: 6).stroke(focused ? Color.accentColor : .secondary, lineWidth: focused ? 2 : 1))
    }
}
