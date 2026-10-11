## Coverage traceability

- [ ] If this changes a supported route, API contract, control, gesture,
  permission, or security boundary, I updated the matching `docs/ototest/`
  inventory and added or updated a named behavioral assertion.
- [ ] If the behavior is intentionally excluded or remains uncovered, I
  recorded the scope, owner, and follow-up/review trigger.
- [ ] I ran `node scripts/check-ototest-inventory.mjs` when changing OTOTEST
  inventory links.

For changed routes, include path/alias/guard/redirect/parameter and direct-load,
authentication, query, and unavailable-resource behavior as applicable. Give
each changed control or gesture a distinct inventory action ID with its source,
starting state, input method, visible result, and persisted or URL effect.
Record dialog open/submit/cancel/validation/failure outcomes separately,
destructive confirmation or undo, and reasons for decorative/unavailable
controls. Record desktop Chrome and supported Android Chrome inputs separately,
plus alternatives and interrupted-input recovery for drag-dependent actions.
