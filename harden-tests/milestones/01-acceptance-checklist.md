# HARD-01 acceptance checklist: search and direct routes

Use this checklist with [HARD-01](01-browser-journeys.md). Check an item only
when its linked test or run report provides the named evidence.

## Coverage inventory

- [ ] Inventory every search result type against the current API response and
  UI result renderer: notes, logs, sessions, paths, labels, boards/cards, and
  calendar dates; identify any newly added type before declaring coverage.
- [ ] For each result type, assert the result's visible identity and the
  destination record or selected state after activation.
- [ ] Assert URL pathname and relevant query parameters after opening results;
  assert browser Back returns to the prior search and Forward restores the
  selected destination.
- [ ] Cover direct navigation for sessions, logs, paths, labels, calendar date,
  archived/search-filtered notes, selected board/card, and archived board.
- [ ] Derive route/query shapes from the current router and link that source in
  the test report; do not copy stale example URLs without checking the router.
- [ ] Cover a valid card deep link where the card is outside the initial loaded
  page and assert the correct board and card dialog are visible after loading.
- [ ] Cover missing and foreign-user IDs for each applicable entity family;
  assert no foreign title/body/metadata is rendered and recovery navigation is
  available.
- [ ] Cover empty search results, query trimming/encoding, and a search result
  with punctuation or non-ASCII text where supported by the API contract.
- [ ] Keep debounce and stale-response race assertions at the unit/store level;
  real-stack tests must assert the user-visible final result without relying on
  arbitrary sleeps.

## Machine and browser profiles

- [ ] Record the available machine's OS, CPU architecture, memory, Node,
  Playwright, and browser versions in the run report.
- [ ] Pass the full selected journey set in desktop Chromium at the documented
  desktop viewport and scale factor.
- [ ] Pass the full selected journey set with
  `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone` at 390×844, touch enabled,
  and device scale factor 3; report it as mobile-size Chromium emulation.
- [ ] Pass the supported emulated iPhone WebKit profile separately; label it
  WebKit and do not count it as Chrome evidence.
- [ ] Check mobile layout for horizontal overflow, clipped dialogs, reachable
  controls, and usable Back/Forward navigation at phone width.
- [ ] Check desktop layout for visible result identity, dialog placement, and
  keyboard-operable search/result navigation.
- [ ] State clearly that Chromium emulation does not prove physical Android
  Chrome behavior and WebKit emulation does not prove physical iPhone behavior;
  record physical-device evidence separately if run.

## Isolation and evidence

- [ ] Seed all entities through documented test APIs/fixtures using a unique
  disposable account; no personal or production data is used.
- [ ] Run against a clean disposable PostgreSQL/API/proxy/web stack and record
  its unique Compose project and image identifiers.
- [ ] Run each browser profile from the same commit and fixture definition, and
  retain separate reports with pass/fail/skip counts.
- [ ] Retain failure screenshot, trace, console/network evidence, and relevant
  server logs in ignored local storage or CI artifacts; link them in the run.
- [ ] Verify cleanup removes only the test project and its disposable volumes.
- [ ] Repeat the selected journeys from a clean stack on the same commit and
  confirm results do not depend on persistent development data.
- [ ] Link the real-stack tests, commands, reports, and any known unsupported
  route cases from the milestone status before marking it complete.
