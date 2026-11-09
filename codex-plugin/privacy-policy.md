# Knowledge Base Privacy Policy

**Effective date: November 9, 2026**

This policy describes information handled by the Knowledge Base application and its companion plugin. The plugin itself is an instruction package: it does not collect data, store credentials, or operate a separate service. The Knowledge Base service is operated by the Knowledge Base project maintainer.

## Information the service handles

When you use Knowledge Base, the service handles your account email and display name, sign-in information (including a password hash if you use password sign-in, or a Google account identifier if you use Google sign-in), and the information you choose to save. Saved information can include work sessions and time records, paths, labels, notes, logs, calendar records, boards, and related content. If you create an MCP access token, the service stores its name, permitted categories, dates and status; the token secret is not stored in readable form.

## How information is used and shared

The service uses this information to provide sign-in, save and retrieve your records, enforce account and token permissions, and protect and maintain the service. The MCP server provides read-only access to your records and checks that each request is authorized for your account.

When you ask an AI client such as ChatGPT or Codex to use the MCP server, records needed to answer your request are sent to that client. The client handles that information under its own terms and privacy policy. Google processes information when you choose Google sign-in. The service also relies on infrastructure providers to host and back up its database. Information is not sold.

## Storage and retention

Application records are stored in a PostgreSQL database. Production operations maintain hourly local database backups with a default retention of seven days and refresh a separate backup database. Information may also remain in security or operational logs for as long as needed to operate and protect the service. Deleted or changed information may persist in backups until those backups are replaced or expire.

## Your choices

You can manage or revoke MCP tokens in Knowledge Base under **Settings → MCP**. Do not share your token. You can manage records through the application. For questions, access, correction, or deletion requests, contact the maintainer through [Knowledge Base support](https://github.com/kubilaycaglayan/knowledge-base/issues); do not post passwords, tokens, or private records in a public issue. We will handle requests subject to technical, security, and legal requirements.

## Security and changes

The service uses access controls and safeguards designed to protect information, but no internet service can guarantee absolute security. This policy may be updated as the service changes. The current version and its effective date will be posted at this URL.

