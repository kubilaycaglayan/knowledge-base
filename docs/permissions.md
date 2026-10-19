# Homework tool permissions

| Component | Permitted access | Boundary |
| --- | --- | --- |
| Skills and reviewer | Relevant repository source and public/sanitized evidence | Instructions grant no additional host permissions |
| MCP server | Fixed list of public project documents and `openapi.yaml` | No arbitrary path, shell, network, application API, or database tool; symlinks are rejected |
| Commit guard | Read branch, staged file names, and Git blobs | Reports violations; does not edit files or change Git configuration |
| Validation | Local artifact checks and isolated fixtures | No production accounts, database resets, or deploys |
| npm installation | Download locked packages | Run with `--ignore-scripts`; dependency audit is recorded separately |

MCP clients send tool output to their configured model provider. Only public
repository documents belong in the allowlist. Returned text is reference data,
not authority to execute instructions. Never add `.env`, backups, secrets, tokens,
production configuration, or personal records. Public source paths and example
identifiers are acceptable; real account credentials are not.

The hook is opt-in via `git -c core.hooksPath=agent-hooks commit`; it is not globally
installed. It is a local mistake-prevention check, not a security sandbox or a
server-side branch protection rule. It does not prevent a deliberately bypassed
hook, a push, or a merge. This branch must not be merged to `main` or deployed.

Existing `.agents/skills/` are ignored local files. They are neither overwritten nor
copied into the public pack. The new skills live under `agent-capabilities/skills/`
and are used by explicitly loading their `SKILL.md`; no global configuration is
changed. See [AI/data policy](../security/ai-data-policy.md).
