import SwiftUI
import GoogleSignInSwift

struct LoginView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.colorScheme) private var scheme
    @State private var email = ""
    @State private var password = ""
    @State private var passwordConfirmation = ""
    @State private var register = false
    @State private var passwordVisible = false
    @State private var passwordConfirmationVisible = false
    @State private var emailError: String?
    @State private var passwordError: String?
    @State private var passwordConfirmationError: String?
    @FocusState private var focus: Field?
    private enum Field { case email, password, passwordConfirmation }
    private var dark: Bool { scheme == .dark }
    private var accent: Color { dark ? Color(red: 0.77, green: 0.82, blue: 0.89) : Color(red: 0.20, green: 0.25, blue: 0.33) }
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Label("Knowledge Base", systemImage: "square.stack.3d.up")
                        .font(.headline).accessibilityAddTraits(.isHeader)
                    VStack(alignment: .leading, spacing: 24) {
                        Text(register ? "Create account" : "Sign in")
                            .font(.largeTitle.bold())
                            .accessibilityAddTraits(.isHeader)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Email").font(.subheadline.weight(.medium))
                            TextField("Email", text: $email, prompt: Text(verbatim: "you@example.com…"))
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
                            ZStack(alignment: .trailing) {
                                Group {
                                    if passwordVisible {
                                        TextField("At least 9 characters…", text: $password)
                                    } else {
                                        SecureField("At least 9 characters…", text: $password)
                                    }
                                }
                                .textContentType(register ? .newPassword : .password)
                                .focused($focus, equals: .password)
                                .submitLabel(register ? .next : .go)
                                .onSubmit { register ? (focus = .passwordConfirmation) : submit() }
                                .accessibilityLabel("Password").accessibilityIdentifier("auth.password")
                                .padding(.trailing, 44)
                                .modifier(AuthInput(focused: focus == .password))
                                Button {
                                    passwordVisible.toggle()
                                } label: {
                                    Image(systemName: passwordVisible ? "eye.slash" : "eye")
                                        .frame(width: 44, height: 44)
                                }
                                .buttonStyle(.plain)
                                .accessibilityLabel(passwordVisible ? "Hide password" : "Show password")
                                .accessibilityHint(passwordVisible ? "Password is visible." : "Password is hidden.")
                                .accessibilityIdentifier("auth.password.visibility")
                            }
                            if let passwordError { validation(passwordError) }
                        }
                        if register {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Confirm password").font(.subheadline.weight(.medium))
                                ZStack(alignment: .trailing) {
                                    Group {
                                        if passwordConfirmationVisible {
                                            TextField("Re-enter your password…", text: $passwordConfirmation)
                                        } else {
                                            SecureField("Re-enter your password…", text: $passwordConfirmation)
                                        }
                                    }
                                    .textContentType(.newPassword)
                                    .focused($focus, equals: .passwordConfirmation)
                                    .submitLabel(.go)
                                    .onSubmit(submit)
                                    .accessibilityLabel("Confirm password")
                                    .accessibilityIdentifier("auth.passwordConfirmation")
                                    .padding(.trailing, 44)
                                    .modifier(AuthInput(focused: focus == .passwordConfirmation))
                                    Button {
                                        passwordConfirmationVisible.toggle()
                                    } label: {
                                        Image(systemName: passwordConfirmationVisible ? "eye.slash" : "eye")
                                            .frame(width: 44, height: 44)
                                    }
                                    .buttonStyle(.plain)
                                    .accessibilityLabel(passwordConfirmationVisible ? "Hide password confirmation" : "Show password confirmation")
                                    .accessibilityHint(passwordConfirmationVisible ? "Password confirmation is visible." : "Password confirmation is hidden.")
                                    .accessibilityIdentifier("auth.passwordConfirmation.visibility")
                                }
                                if let passwordConfirmationError { validation(passwordConfirmationError) }
                            }
                        }
                        Button(action: submit) {
                            HStack {
                                if model.isAuthenticating { ProgressView().tint(dark ? .black : .white).accessibilityHidden(true) }
                                Text(register ? "Create account" : "Sign in").fontWeight(.semibold)
                            }.frame(maxWidth: .infinity).frame(minHeight: 48)
                        }
                        .buttonStyle(.plain).foregroundStyle(dark ? .black : .white)
                        .background(accent, in: RoundedRectangle(cornerRadius: 4))
                        .accessibilityIdentifier("auth.submit")
                        .accessibilityValue(model.isAuthenticating ? "Working…" : "")
                        if GoogleAuthentication.isConfigured {
                            HStack { Rectangle().frame(height: 1); Text("or continue with").font(.caption).fixedSize(); Rectangle().frame(height: 1) }.foregroundStyle(.secondary)
                            NativeGoogleButton(isEnabled: !model.isAuthenticating) {
                                focus = nil
                                Task { await model.authenticateWithGoogle(idToken: GoogleAuthentication.idToken) }
                            }.frame(height: 48).accessibilityIdentifier("auth.google")
                        }
                        if let error = model.authError {
                            VStack(alignment: .leading, spacing: 8) {
                                validation(error).accessibilityIdentifier("auth.error")
                                    .accessibilityAddTraits(.isStaticText)
                                    .accessibilityHint("Correct the form and try again.")
                                Button("Try again", action: submit)
                                    .buttonStyle(.plain)
                                    .foregroundStyle(accent)
                                    .frame(minHeight: 44)
                                    .accessibilityIdentifier("auth.retry")
                            }
                        }
                        Button(register ? "Already have an account? Sign in" : "New here? Create an account") {
                            register.toggle()
                            emailError = nil
                            passwordError = nil
                            passwordConfirmationError = nil
                            model.clearAuthError()
                        }.buttonStyle(.plain).foregroundStyle(accent).frame(minHeight: 44)
                            .accessibilityIdentifier("auth.mode")
                    }
                    .disabled(model.isAuthenticating)
                    .padding(geometry.size.width < 480 ? 16 : 24)
                    .background(dark ? Color(red: 0.11, green: 0.14, blue: 0.19) : .white, in: RoundedRectangle(cornerRadius: 4))
                    .overlay(RoundedRectangle(cornerRadius: 4).stroke(.secondary.opacity(0.25)))
                }
                .frame(maxWidth: 480)
                .padding(.horizontal, geometry.size.width < 480 ? 16 : 24)
                .frame(maxWidth: .infinity, minHeight: geometry.size.height)
            }.scrollDismissesKeyboard(.interactively)
        }
        .background {
            ZStack {
                dark ? Color(red: 0.08, green: 0.10, blue: 0.13) : Color(red: 0.97, green: 0.97, blue: 0.98)
                Image("LoginBackground")
                    .resizable()
                    .scaledToFill()
                    .saturation(0.65)
                    .opacity(dark ? 0.20 : 0.07)
                    .accessibilityHidden(true)
            }
            .ignoresSafeArea()
        }
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
        passwordConfirmationError = register && passwordConfirmation != password ? "Passwords do not match." : nil
        if emailError != nil { focus = .email; return }
        if passwordError != nil { focus = .password; return }
        if passwordConfirmationError != nil { focus = .passwordConfirmation; return }
        focus = nil
        Task { await model.authenticate(email: trimmed, password: password, register: register) }
    }
}

private struct AuthInput: ViewModifier {
    var focused: Bool
    func body(content: Content) -> some View {
        content.font(.body).textFieldStyle(.plain).padding(12).frame(minHeight: 48)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(focused ? Color.accentColor : .secondary, lineWidth: focused ? 2 : 1))
    }
}
