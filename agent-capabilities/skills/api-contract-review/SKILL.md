---
name: api-contract-review
description: Review Knowledge Base API contract changes against the OTOTEST matrix, Spring controllers, and frontend callers when preparing or validating an OpenAPI export.
---

# Review the Knowledge Base API contract

Read `docs/api-contract.md` and the relevant rows of
`docs/ototest/01-api-matrix.md`. Use `backend/src/main/java/com/know/api/` for
request/response declarations and `frontend/src/lib/api.ts` plus callers for
client needs. Ownership rules live in the service layer, not in OpenAPI schemas.

Run `npm --prefix mcp-server run check:contract` after dependencies are installed.
The check establishes operation coverage, references, and authentication metadata;
it does not prove runtime behavior. For a schema change, follow the controller's
DTO to its actual validation and serialization rules. Do not derive field shapes
from operation names or fill a missing response with an invented example.

Return discrepancies with method/path, source reference, affected client, and
suggested verification. Distinguish generated metadata limitations from actual
backend defects. Refresh only from a disposable local API built from this checkout;
never use production credentials or records to generate examples.
