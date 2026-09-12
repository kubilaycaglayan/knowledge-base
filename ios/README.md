# Knowledge Base for iOS

Native SwiftUI client, iOS 17+. Authentication follows the web's private-workspace copy, slate palette, and light/dark appearance. It supports email/password sign-in, account creation, and native Google sign-in. The backend owns account linking and sessions; the app saves its JWT in Keychain. Existing `Know` target paths and `com.know.ios` bundle/Keychain identifiers are retained for compatibility.

## Run locally

1. Install Xcode and XcodeGen (`brew install xcodegen`).
2. Create `ios/Local.xcconfig` with the settings below. It is gitignored. The default API is `http://localhost:8080/api/v1` for a simulator with the backend running on this Mac.
3. Run `cd ios && xcodegen generate --spec project.yml`, then open `Know.xcodeproj`. Select the **Know** scheme and an iPhone simulator; Run.
4. For a physical iPhone, choose your Apple development team under Signing & Capabilities and use a reachable HTTPS API address. `localhost` on the phone is the phone itself.

```xcconfig
// Empty substitution preserves the double slash in xcconfig.
KNOWLEDGE_BASE_API_URL = https:/$()/your-host.example/api/v1
GOOGLE_IOS_CLIENT_ID = YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
GOOGLE_SERVER_CLIENT_ID = YOUR_EXISTING_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.YOUR_IOS_CLIENT_ID
```

These are public OAuth identifiers, not secrets. Never put a Google client secret, JWT secret, or database password in the app. `KNOW_API_URL` remains supported as a scheme environment override; the build setting works in installed builds too.

## Google setup

In the same Google Cloud project used by the web app, create an OAuth client of type **iOS**, with bundle ID **com.know.ios**. Copy its client ID and displayed iOS URL scheme into the settings above. For `GOOGLE_SERVER_CLIENT_ID`, reuse the **Web application** client ID already used by backend `GOOGLE_CLIENT_ID` and frontend `VITE_GOOGLE_CLIENT_ID`. The SDK requests an ID token for this server audience; no backend audience expansion is needed.

Configure Google Auth Platform branding/audience and add your account as a test user if your project requires test users. Sign-in only requests identity/profile/email; no Drive or Calendar permission is needed. No Firebase project is required. Rebuild after changing settings.

The app handles Google's callback URL and sends `{ "idToken": "…" }` to `POST /api/v1/auth/google`. Cancellation returns to login. If OAuth settings are absent, the Google button explains that email/password is available. Passwords are preserved exactly; email whitespace is trimmed.

References: [Google configuration](https://developers.google.com/identity/sign-in/ios/start-integrating), [native integration](https://developers.google.com/identity/sign-in/ios/sign-in), [backend verification](https://developers.google.com/identity/sign-in/ios/backend-auth).

## Verification and smoke checklist

```sh
cd ios
xcodegen generate --spec project.yml
xcodebuild -project Know.xcodeproj -scheme Know -destination 'platform=iOS Simulator,name=iPhone 17' test
```

Unit tests check password, registration, Google request contracts, rejection/retry, and missing Google configuration using an isolated transport. UI tests cover login controls, registration switching, and empty submission, plus existing workspace controls. `-ui-testing` isolates session storage; `-ui-testing-authenticated` seeds in-memory workspace fixtures.

With your backend and Google configuration, run this manual smoke check:

- Submit an empty form: inline errors appear and email receives focus. Wrong credentials show a recoverable error.
- Create a disposable account; sign out and sign in with its password. Relaunch normally and confirm session persistence.
- Continue with Google, cancel, retry and complete consent. Verify the workspace opens, relaunch persists the session, and sign-out returns to login.
- Use the same Google account as the web and confirm the same account data appears.
- Check light/dark appearance, large text, VoiceOver, keyboard focus, and the visible keyboard on a smaller iPhone.

Live Google consent requires your OAuth configuration and interactive account selection. Automated tests never use personal Google credentials. The remaining workspace screens are legacy scaffolding; this milestone implements authentication, not every web feature.
