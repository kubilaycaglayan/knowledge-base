# Model Context Protocol access

Knowledge Base exposes a read-only, sessionless Streamable HTTP MCP endpoint at
`https://<your-host>/mcp`. Create and revoke credentials in **Settings → MCP**.
Each credential has a name, category grants, and an expiry of three hours, one
week, one month, four months, or one year. The secret is displayed only once.
Treat it like a password and revoke it if it is exposed.

## OpenAI plugin authorization

The backend honors forwarded headers from the trusted Caddy reverse proxy so
OAuth login redirects preserve the external HTTPS scheme. Keep the backend
port private; the edge proxy must overwrite client-supplied forwarded headers.
OAuth connection pages allow form redirects to `https://chatgpt.com` in their
Content Security Policy, so browsers can follow the authorization callback.
Other pages retain a same-origin form policy.

The Recall plugin uses OAuth rather than asking users to create a manual MCP
token. When enabled by deployment configuration, OpenAI discovers the server
through the OAuth and protected-resource metadata endpoints. Users sign in to
their existing Knowledge Base account with its password or, when Google sign-in
is configured, a Google account already linked to that Knowledge Base account.
They select read-only categories on the consent screen and can review and
disconnect grants in **Settings → MCP**.
OAuth access tokens last 15 minutes; rotating refresh tokens expire after 30
days without use. Reuse of a rotated refresh token revokes its grant. Manual
MCP tokens remain available for direct clients such as Codex CLI and Claude.
OAuth access tokens are RSA-signed, carry the exact MCP resource URI as their
audience, and are checked for signature, issuer, audience, expiry, user, and
granted categories on each MCP request. The signing key is persisted in the
existing PostgreSQL database so deployed restarts do not invalidate active
connections.

The endpoint accepts MCP JSON-RPC `initialize`, `ping`, `tools/list`, and
`tools/call` requests over HTTP POST. Send the credential as
`Authorization: Bearer <token>`. MCP credentials are accepted only at `/mcp`;
the REST API and token management endpoints continue to require the user's
normal account JWT. The exposed tools are read-only and enforce category grants
and user ownership on every request. List tools are bounded; calendar and
report ranges have server-side limits. Archived notes, paths, boards and cards
include an archived marker where supported by their domain view.

Available tools: `notes_list`, `note_get`, `logs_list`, `calendar_days`,
`sessions_list`, `activity_list`, `report_read`, `paths_list`, `labels_list`,
`boards_list`, `board_cards`, and `search`.
`report_read` returns totals and category breakdowns by default. Daily rows are
omitted unless `includeDays=true`; requested rows are paginated with a maximum
page size of 31. Sankey visualization data is not returned by MCP.
`notes_list` returns compact note metadata. Use `note_get` with a `noteId` to
retrieve one note's plain-text body; the rich-text JSON document is not exposed
through MCP.

## Codex

Add the server using `codex mcp add knowledge-base --url
https://<your-host>/mcp`, then configure its bearer token in the Codex MCP
server settings. A direct `~/.codex/config.toml` entry can use:

```toml
[mcp_servers."knowledge-base"]
url = "https://<your-host>/mcp"
bearer_token_env_var = "KNOWLEDGE_BASE_MCP_TOKEN"
```

Set `KNOWLEDGE_BASE_MCP_TOKEN` in the environment that launches Codex. Codex
supports `bearer_token_env_var` for HTTP MCP authentication.

## Claude

Run `claude mcp add --transport http knowledge-base
https://<your-host>/mcp --header "Authorization: Bearer <token>"`. Avoid
committing project configuration that contains the token.

See the official [Codex MCP setup](https://developers.openai.com/learn/docs-mcp)
and [Claude MCP guide](https://code.claude.com/docs/en/mcp) for client-specific
configuration details.
