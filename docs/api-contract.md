# Homework API contract

The root [openapi.yaml](../openapi.yaml) is a retrospective export of the existing
Spring API, reconciled with the [107-operation matrix](ototest/01-api-matrix.md).
It contains generated request/response schemas, parameters, and validation metadata.
It was not the original design input for this already-built application.

The exporter builds the checked-out backend and starts a disposable PostgreSQL/API
pair with random temporary credentials, no published ports, and no application
volumes. It retrieves `/v3/api-docs`, then removes host-specific server metadata,
uses the current product name, and explicitly marks the four public authentication
operations and the remaining bearer-protected operations from `SecurityConfig`.
The source revision is recorded in `x-homework-source-revision`.

```bash
npm --prefix mcp-server ci --ignore-scripts
bash mcp-server/export-openapi.sh > /tmp/knowledge-base-openapi.yaml
# Review the generated file, then replace openapi.yaml on the homework branch.
npm --prefix mcp-server run check:contract
```

Docker, Node.js 22+, and OpenSSL are required for regeneration. The exporter removes
only its own named containers and network on exit. Its homework image tag is kept
as a build cache; it never moves production or shared test image tags.

The matrix and controller declarations are cross-checks, not substitutes for
schemas. The check validates OpenAPI structure, local references, operation-set
equality, and explicit authentication. Springdoc's generated success media types
and error descriptions can be less precise than the implementation. Service-only
constraints and ownership guarantees require the named backend tests; this export
does not invent undocumented error schemas or claim complete response-field tests.
The native timer WebSocket is described in [architecture](architecture.md) and is
outside this HTTP OpenAPI document.

For future homework API changes, review this snapshot with the relevant matrix row
and frontend caller before changing the backend, regenerate afterward, and run the
relevant behavior tests. This is the submission contract workflow, not a retroactive
claim about how the original application was developed.
