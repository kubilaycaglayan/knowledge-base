# iOS Sessions parity

Reference: `frontend/src/views/SessionsView.vue`,
`frontend/src/components/FloatingTimeTracker.vue`, their tests, and the mobile
web rendering. The web theme and mobile layout are the visual specification.
Authentication and existing bundle/Keychain identifiers remain compatible.

## Acceptance checklist

- [x] Web-derived workspace header, flat surfaces, spacing, colors, light/dark/system appearance.
- [x] Inline timer: elapsed clock, start/stop, summary, selected path and labels.
- [x] Active path selection, five recent active paths, inline path creation.
- [x] Multiple TIME_ENTRY labels, toggling, inline creation and assignment.
- [x] Optional description and editable running start time, persisted to server.
- [x] Server-owned timer with WebSocket snapshots, REST fallback, foreground reconciliation,
  stale-response protection, and no duplicate mutation requests.
- [x] Paginated history (50), web date groups, server duration, colored path/label chips,
  description, localized timestamps, source, and removed-reference fallbacks.
- [x] Completed-session editing: path, multiple labels, description, source, start/end;
  validation, retained draft on error, unsaved-change confirmation.
- [x] Confirmed deletion and refreshed history, including deleting the last page's last row.
- [x] Loading, empty, offline, rejection/retry and expired-authentication states.
- [x] Automated API/model and UI tests; Chrome mobile reference and simulator screenshots
  in light/dark, small/large viewports and large text.
- [x] API/roadmap/smoke documentation and regular reviewed commits.

Other workspace features retain their current implementation; their complete ports
are subsequent milestones. iOS-created sessions use source `IOS`. Duration rules,
ownership and the one-running-timer invariant stay in the backend.
