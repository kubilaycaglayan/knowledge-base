# Reusable submission review

Input: a tracker task ID and a homework branch diff.

1. Read the task's acceptance criteria and the linked modular documents.
2. Use the API contract skill for contract changes or the evidence skill for
   submission claims. Existing local skills remain available independently.
3. Query the optional MCP tools for public reference documents or an API operation.
4. Run `npm --prefix mcp-server run verify` and relevant existing repository checks.
5. Use `custom-agent/evidence-reviewer.md` for a review pass; explicitly identify
   whether it was self-review or an independent agent review.
6. Record findings and actual output in the tracker and validation record. Leave
   human acceptance and external publication pending until they happen.

Output: a bounded diff, reproducible verification results, and unresolved findings.
