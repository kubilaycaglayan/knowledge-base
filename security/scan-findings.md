# Security scan findings — 2026-10-19

Application source: `0d4c08c6aa6dc324a2ff927109705b32deddda47`.
Homework tooling: current branch worktree, with its committed npm lockfile.
Environment: Node.js `v24.19.0`, npm `11.17.0`.

## Actual results

| Command | Result | Scope |
| --- | --- | --- |
| `node scripts/check-security.mjs` | Passed: 49 checks | Deterministic source/configuration assertions |
| `node scripts/check-cloudflare-waf.mjs` | Passed: 174 checks | Deterministic WAF semantic contract checks; not a live WAF probe |
| `npm --prefix mcp-server audit --json` | Exit 0: zero reported vulnerabilities | Homework tooling lockfile |
| `npm --prefix frontend audit --json` | Exit 1: five high-severity package findings | Existing frontend lockfile, including development dependencies |
| `npm --prefix chrome-extension audit --json` | Exit 1: one high-severity package finding | Existing extension lockfile, including development dependencies |

Raw output: [MCP](scans/mcp-npm-audit.json), [frontend](scans/frontend-npm-audit.json),
[extension](scans/extension-npm-audit.json). Input hashes are in
[scan-inputs.sha256](scans/scan-inputs.sha256). An audit's nonzero exit is a reported
finding, not a failed attempt to execute it.

Frontend package entries: `vue`, `@vue/server-renderer`, `brace-expansion`,
`source-map-js`, and `undici`. Extension entry: `source-map-js`. These counts are
package-level audit findings, not six independently proven application exploits.
Review each advisory's affected range, dependency path, use in this application,
and proposed fix before patching. The raw reports contain advisory URLs and npm's
suggested fixes. No `npm audit fix` or application dependency update was performed.
These findings are retained as submission evidence; remediation is outside this homework task.

The two source checks are deterministic for the recorded files; npm audit uses a
changing registry advisory database and is a point-in-time result. The lockfile,
tool version, and raw JSON preserve what was checked. Zero findings for the MCP
package is not a claim that the whole application is vulnerability-free. Backend
Java dependencies, container images, runtime exploitation, and production systems
were not vulnerability-scanned in this session.
