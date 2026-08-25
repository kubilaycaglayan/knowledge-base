# Architecture

The backend is a modular monolith. PostgreSQL is the system of record; Vue, SwiftUI, and the Chrome extension are API clients and do not own domain state. UUID ownership columns and authenticated repository lookups prevent cross-user access. Flyway migrations are the schema contract.

The first vertical slice is authentication and paths. Items, notes, activities, progress history, timers, and statistics build on the same user boundary and versioned `/api/v1` API.
