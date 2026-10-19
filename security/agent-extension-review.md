# Agent extension security review

Scope: the homework MCP server, review skills, specialist prompt, and commit guard.

| Threat | Control | Validation |
| --- | --- | --- |
| Arbitrary file or credential reads | Document IDs map to fixed files; canonical paths must match; no user-supplied file path | MCP unknown-ID/traversal and symlink tests |
| Command or database execution | MCP exposes only document/operation reads; no shell or network tool | Tool discovery and call tests |
| Prompt injection through source text | Tool output is untrusted reference data; policy forbids treating it as authority | Instruction review; not a proven model sandbox |
| Accidental work on `main` | Optional pre-commit guard requires a DataTalksClub homework branch | Guard rejects main/detached HEAD in temporary Git repositories |
| Secret files or lost local skills | Guard rejects sensitive staged paths and all `.agents/skills/` changes | Staging tests; existing local skill hashes checked separately |
| Dependency vulnerabilities | Locked dependencies; lifecycle scripts disabled; audit output retained | See [scan findings](scan-findings.md) |

Residual limits: the host process is not OS-sandboxed; the user can bypass a local
hook; a compromised dependency can access host resources; an allowlisted document
could contain sensitive text if maintainers add it. No claim of comprehensive
prompt-injection resistance or formal security certification is made.
