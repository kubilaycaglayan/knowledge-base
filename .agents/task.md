# Knowledge Base roadmap

## Current product

- [x] Shared Spring Boot/PostgreSQL API with authenticated, user-owned paths,
  notes, labels, calendar records, sessions, timers, imports, reports, and
  activity history.
- [x] Vue web client, SwiftUI client, and Manifest V3 timer extension using
  the shared `/api/v1` boundary.
- [x] Production-shaped Compose deployment with a protected external
  PostgreSQL volume, Cloudflare Tunnel, and scheduled backups.
- [x] Backend, frontend, extension, smoke, accessibility, security, and
  macOS CI verification coverage.

## Remaining verification

- [ ] Run the generated Xcode scheme on macOS for native SwiftUI and UI-test
  validation; Linux can validate only the package sources.
- [ ] Continue periodic maintenance audits for unused code, dependencies,
  scripts, and configuration.
