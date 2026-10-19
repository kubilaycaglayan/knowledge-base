# Knowledge Base homework extension pack

This pack is tracked only on `homework/datatalksclub-submission`. It adds no
application route and changes no global agent configuration.

| Capability | Artifact | How to use it |
| --- | --- | --- |
| Project context | [AGENTS.md](../AGENTS.md), [team](agent-team.md), [workflow](ai-workflow.md) | Load context before a task |
| API review skill | [api-contract-review](../agent-capabilities/skills/api-contract-review/SKILL.md) | Explicitly ask an agent to read and apply the file |
| Evidence review skill | [submission-evidence-review](../agent-capabilities/skills/submission-evidence-review/SKILL.md) | Explicitly ask an agent to read and apply the file |
| Reusable workflow | [Submission review](../agent-capabilities/workflows/submission-review.md) | Supply a tracker task and branch diff |
| Specialist | [Evidence reviewer](../custom-agent/evidence-reviewer.md) | Role prompt for sequential or authorized independent review |
| MCP server | [server.mjs](../mcp-server/server.mjs) | Local stdio; two read-only tools |
| Guardrail | [pre-commit](../agent-hooks/pre-commit) | Opt-in commit command below |
| Permissions | [permissions](permissions.md) | Read before connecting a client |

## Demonstration

```bash
npm --prefix mcp-server ci --ignore-scripts
npm --prefix mcp-server run verify
```

Tests connect a real MCP client over stdio, discover tools, read the specification
and a timer operation, and reject invalid document IDs and symlinks. Guard tests
use temporary Git repositories, including a staged deletion of an existing skill.
The validation record reports the actual results.

To connect a compatible MCP client, configure the following example with the
absolute path to this checkout. This is a configuration example, not an installed
global setting:

```json
{
  "mcpServers": {
    "knowledge-base-homework": {
      "command": "node",
      "args": ["/absolute/path/to/knowledge-base/mcp-server/server.mjs"]
    }
  }
}
```

Use `read_project_document` with `document: "specification"`, or
`get_api_operation` with `method: "get"` and
`route: "/api/v1/timers/current"`. The server reads files; it does not send HTTP
requests to the app. Startup uses the SDK's stdio transport and keeps diagnostics
off protocol stdout, following the [official MCP guide](https://modelcontextprotocol.io/docs/develop/build-server).

Run the guard directly with `node agent-hooks/guard.mjs`. To use it for an intended
commit without persisting a hook configuration:

```bash
git -c core.hooksPath=agent-hooks commit
```

Do not replace existing `.agents/skills/` with this pack. Those local skills remain
untouched; the new tracked skills live in a separate directory. Read the
[security review](../security/agent-extension-review.md) for controls and limits.
