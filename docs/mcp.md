# Model Context Protocol access

Knowledge Base exposes a read-only, sessionless Streamable HTTP MCP endpoint at
`https://<your-host>/mcp`. Create and revoke credentials in **Settings → MCP**.
Each credential has a name, category grants, and an expiry of three hours, one
week, one month, four months, or one year. The secret is displayed only once.
Treat it like a password and revoke it if it is exposed.

The endpoint accepts MCP JSON-RPC `initialize`, `ping`, `tools/list`, and
`tools/call` requests over HTTP POST. Send the credential as
`Authorization: Bearer <token>`. MCP credentials are accepted only at `/mcp`;
the REST API and token management endpoints continue to require the user's
normal account JWT. The exposed tools are read-only and enforce category grants
and user ownership on every request. List tools are bounded; calendar and
report ranges have server-side limits. Archived notes, paths, boards and cards
include an archived marker where supported by their domain view.

Available tools: `notes_list`, `logs_list`, `calendar_days`, `sessions_list`,
`activity_list`, `report_read`, `paths_list`, `labels_list`, `boards_list`,
`board_cards`, and `search`.

## Codex

Add the server using `codex mcp add knowledge-base --url
https://<your-host>/mcp`, then configure its bearer token in the Codex MCP
server settings. A direct `~/.codex/config.toml` entry can use:

```toml
[mcp_servers.knowledge_base]
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
