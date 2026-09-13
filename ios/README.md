# Knowledge Base for iOS

Native SwiftUI client, iOS 17+. Authentication follows the web's private-workspace copy, slate palette, and light/dark appearance. It supports email/password sign-in, account creation, and native Google sign-in. The backend owns account linking and sessions; the app saves its JWT in Keychain. Existing `Know` target paths and `com.know.ios` bundle/Keychain identifiers are retained for compatibility.

## Run locally

1. Install Xcode and XcodeGen (`brew install xcodegen`).
2. Create `ios/Local.xcconfig` with the settings below. It is gitignored. The default API is `http://localhost:8080/api/v1` for a simulator with the backend running on this Mac.
3. Run `cd ios && xcodegen generate --spec project.yml`, then open `Know.xcodeproj`. Select the **Know** scheme and an iPhone simulator; Run.
4. For a physical iPhone, choose your personal Apple team under Signing & Capabilities and use a reachable API address. `localhost` on the phone is the phone itself.

```xcconfig
// Empty substitution preserves the double slash in xcconfig.
KNOWLEDGE_BASE_API_URL = https:/$()/your-host.example/api/v1
GOOGLE_IOS_CLIENT_ID = YOUR_IOS_CLIENT_ID.apps.googleusercontent.com
GOOGLE_SERVER_CLIENT_ID = YOUR_EXISTING_WEB_CLIENT_ID.apps.googleusercontent.com
GOOGLE_REVERSED_CLIENT_ID = com.googleusercontent.apps.YOUR_IOS_CLIENT_ID
IOS_DEVELOPMENT_TEAM = YOUR_PERSONAL_TEAM_ID
```

OAuth identifiers and the Apple team ID are public identifiers, not secrets. Never put a Google client secret, JWT secret, or database password in the app. `KNOW_API_URL` remains supported as a scheme environment override; the build setting works in installed builds too.

## Test on your iPhone over local Wi-Fi

An iPhone cannot use `localhost` to reach your Mac. Use the Mac's Wi-Fi address instead. Run `ipconfig getifaddr en0` before each session because DHCP addresses can change.

Add the following to the ignored `.env.development`, then start the development stack normally. The `IOS_LAN_API=1` overlay publishes only the API on your LAN. PostgreSQL and the development web proxy stay bound to the Mac.

```dotenv
IOS_LAN_API=1
IOS_LAN_API_BIND_ADDRESS=0.0.0.0
IOS_LAN_API_URL=http://<mac-lan-ip>:<api-port>
```

```sh
./scripts/development-all-start.sh
curl http://<mac-lan-ip>:<api-port>/actuator/health
```

Then put this in `ios/Local.xcconfig` and regenerate the project:

```xcconfig
KNOWLEDGE_BASE_API_URL = http:/$()/<mac-lan-ip>:<api-port>/api/v1
```

`Debug` permits the plain-HTTP LAN API needed for this local workflow. `Release` retains App Transport Security and requires HTTPS. Keep `IOS_LAN_API=0` when you finish phone testing. Both devices must use the same private Wi-Fi; turn off VPNs that isolate local traffic and permit incoming connections to Docker when macOS asks.

## Google setup

In the same Google Cloud project used by the web app, create an OAuth client of type **iOS**, with bundle ID **com.know.ios**. Copy its client ID and displayed iOS URL scheme into the settings above. For `GOOGLE_SERVER_CLIENT_ID`, reuse the **Web application** client ID already used by backend `GOOGLE_CLIENT_ID` and frontend `VITE_GOOGLE_CLIENT_ID`. The SDK requests an ID token for this server audience; no backend audience expansion is needed.

Configure Google Auth Platform branding/audience and add your account as a test user if your project requires test users. Sign-in only requests identity/profile/email; no Drive or Calendar permission is needed. No Firebase project is required. Rebuild after changing settings.

The app handles Google's callback URL and sends `{ "idToken": "…" }` to `POST /api/v1/auth/google`. After a user has signed in once, later explicit Google sign-ins first restore Google's saved session silently and fall back to the interactive flow only when needed. App sign-out keeps that Google session so repeat sign-ins do not unnecessarily start a new OAuth authorization. Google may still send security alerts for new devices or suspicious activity; those notifications are controlled by Google. Cancellation returns to login. If OAuth settings are absent, the Google separator and button are omitted, matching the web; email/password remains available. Passwords are preserved exactly; email whitespace is trimmed.

The workspace includes native Logs parity with timestamped entries, inline
editing, conflict recovery, and reusable labels; native Notes parity with the
web list and editor; and native Paths parity with path management, colors,
history, merge, and removal recovery. Notes
use the shared `/api/v1/notes` contract, support active/archive pagination and
search, label suggestions, Tiptap-compatible paragraph JSON, debounced
autosave with version-conflict replay, and archive/restore. The server remains
the source of truth; the iOS fixture transport is enabled only by
`-ui-testing`.

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

Live Google consent requires your OAuth configuration and interactive account selection. Automated tests never use personal Google credentials. Sessions, Logs, Labels, Notes, Paths, Calendar, and Reports have native workspace implementations, with remaining web features tracked as later milestones.
