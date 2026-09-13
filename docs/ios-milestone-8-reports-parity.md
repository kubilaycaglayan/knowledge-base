# iOS Milestone 8: `/reports` page parity

This is the handoff brief for the next implementation session. The goal is
not merely to draw a chart: the native Reports section must match the current
web `/reports` page in date-range semantics, filters, aggregation, chart and
table data, calendar overlays, Sankey mode, URL/deep-link state, loading and
failure behavior, ownership, hierarchy, and accessible interaction while
retaining native SwiftUI conventions.

## Objective

Port the current web Reports experience to the authenticated iOS workspace:

- add a first-class **Reports** section/tab in the existing workspace shell;
- load the signed-in user’s report for an inclusive local-date interval;
- support the five aggregation choices: daily, weekly, monthly, quarterly,
  and yearly;
- support the web’s eleven date presets, previous/next interval navigation,
  explicit date-range selection, and the rolling ranges selected by each
  aggregation mode;
- filter tracked time by zero or more owned paths and `TIME_ENTRY` labels,
  preserving the web’s OR-within-filter and AND-between-filters semantics;
- show the total tracked time, aggregated bar chart, path/label breakdown
  table, accessible donut summary, active-day count, and empty states;
- support linear/parabolic/off trendline presentation and optional Sankey path
  flow when the server provides it;
- show daily Calendar note/label inputs in the day chart and the separate
  Calendar log/label summary when applicable;
- preserve report state in the URL-equivalent native navigation state and
  restore it when the view is revisited during the session;
- preserve authentication/session behavior: owner scoping, 401 sign-out,
  offline/server-error credential retention, retry, stale-request safety, and
  cached report reuse;
- match the approved light/dark/system workspace design on small and large
  iPhones, Dynamic Type, VoiceOver, keyboard focus, safe areas, and 44-point
  touch targets.

Reports is read-only. Do not add report-specific mutations or invent a native
editing flow for sessions, paths, labels, or Calendar records. Those remain in
their owning sections and invalidate the Reports model/cache through an
explicit callback or shared cache policy.

Do not change bundle identifiers, Keychain keys, OAuth identifiers, database
names, Docker volume names, or API compatibility contracts. Keep report range
validation, ownership, duration calculation, filter semantics, calendar
portion interpretation, and Sankey construction in the backend/API layer;
SwiftUI should remain a thin client over a typed observable model.

## Current source of truth

Before writing Swift, read these files and search for every Reports route,
query parameter, display string, chart label, and cache invalidation path:

- `frontend/src/views/ReportsView.vue` and
  `frontend/src/views/ReportsView.test.ts`;
- `frontend/src/components/reports/ReportTabs.vue`,
  `ReportDateRange.vue`, `SummaryBarChart.vue`,
  `ProjectDurationTable.vue`, `ProjectDonutChart.vue`, and
  `PathTimingSankey.vue` plus their tests;
- `frontend/src/stores/reports.ts`, `frontend/src/stores/paths.ts`,
  `frontend/src/stores/labels.ts`, `frontend/src/main.ts`, and the shared
  shell/theme files (`App.vue`, `theme.css`, `extra.css`, and
  `dashboard-shell.css`);
- `docs/api.md`, `docs/domain-model.md`, and
  `backend/src/main/java/com/know/api/ReportController.java`,
  `ReportService.java`, `Aggregation.java` if separate, and the report API,
  calendar/report, ownership, and filtering tests in `backend/src/test`;
- the existing iOS architecture in `KnowApp.swift`, `WorkspaceView.swift`,
  `WorkspaceTheme.swift`, `PathsModels.swift`, `LabelsModels.swift`,
  `CalendarModels.swift`, and the existing `KnowTests`/`KnowUITests` fixtures;
- completed handoff documents, especially
  `docs/ios-milestone-3-logs-parity.md` and
  `docs/ios-milestone-7-calendar-parity.md`, for model, transport, fixture,
  accessibility, and verification conventions.

The web is authoritative if it changes after this document is written. Do not
copy a screenshot and infer behavior already expressed by source and tests.
The current remote reference check was run on 2026-09-13 in the Ubuntu
development container:

```bash
ssh asus-ubuntu-server \
  'docker exec knowledge-base-dev-web-1 sh -lc \
  "cd /app && npm test -- --run src/views/ReportsView.test.ts"'
```

Result: 1 file and all 17 tests passed. The forwarded app is reachable at
`http://localhost:3000/reports` from the development workflow. It returned
the current Knowledge Base shell successfully during this brief’s review.

## Implementation evidence (2026-09-13)

Native Reports work is split into semantic commits:

- `f6d2277` adds typed report models, transport, query/cache state, fixtures,
  workspace navigation, and the initial native report page.
- `184f558` adds range validation, trendline calculations, Sankey/calendar
  summaries, and focused unit/UI coverage.
- `ab7ec31` adds timeout-safe loading and report cache invalidation during
  sign-out/background resume.
- `53c64ea`, `cc43213`, and `8807579` add accessible filters, custom date
  controls, breakdown/donut summaries, filtered active-day semantics, and
  timeout/trend detail tests.
- `6ba02b3` corrects the native Reports test-count evidence, and `6b7ccc9`
  makes the initial asynchronous Reports render crash-safe.
- `8a615c1` expands deterministic fixtures for zero days, multiple paths and
  labels, Calendar notes/portions, Sankey nodes/links, malformed responses,
  long content, and reference failures; it also adds model and simulator UI
  coverage for those states.
- `e327686` corrects Off trendline semantics, preserves empty Sankey
  switchability, and removes shared-date-formatter mutation from report date
  calculations.
- `6647003` adds loaded-state reporting, loading/offline/filtered fixture
  flags, zero-duration copy, and simulator coverage for loading skeletons and
  empty Sankey recovery.
- `6db20dd` adds stable path/label filter identifiers and verifies chip
  persistence, trendline presentation restoration, and clear-filter behavior
  across workspace section changes in the simulator.
- `f32c111` adds natural month/quarter/year bucket assertions and a
  daylight-saving calendar-day shift regression test.
- `06ec6b1` verifies refresh-state retention: the last valid report remains
  visible while a refresh is pending and after a recoverable failure.
- The current working slice adds day-only Calendar input annotations to the
  native chart, including colored label chips and note/marker symbols, and
  verifies that the Calendar toggle hides and restores those annotations in
  the iPhone 17 Pro UI test.
- `5b0bcd5` extends simulator coverage to multiple path and session-label
  selections, stable chip identifiers, and clearing labels without clearing
  the selected paths.
- `dc22fe3` adds direct Reports model coverage for aggregation range resets,
  TIME_ENTRY reference scoping and report-category fallback, malformed payload
  rejection, and suppression of an older range completion.
- `9c5597d` verifies OR-within/AND-between filter semantics, prevents
  filtered category leakage in fixture responses, and exercises independent
  label-chip removal in the simulator.
- `7a80724` adds partial-boundary bucket assertions, category-to-bucket total
  equality, and filtered report-total equality while preserving API colors.
- `d9fcf41` localizes Calendar summary dates, renders API-colored assignment
  rows with marker/note symbols, and exposes aggregate day/marker totals;
  simulator assertions cover both assignments and the aggregate copy.
- `1742152` renders positive Calendar portions with proportional visual widths
  while retaining marker-sized chips and accessible text for all inputs.
- `16388d3` verifies that a filter change retains the previous report during
  the matching refresh and replaces it only after the response completes.
- `a64d878` verifies unchanged-range load suppression, shift preservation of
  filters and presentation state, and presentation-only changes without new
  report requests.
- `ea2d754` adds a simulator assertion for the loaded Reports hierarchy:
  `SUMMARY`, `Tracked time`, and the aggregation controls.
- `bc78212` extends the long-content fixture to labels and verifies that long
  path/label options retain accessible, hittable removal controls on iPhone.
- `3572225` adds dedicated note-only and 0.25/0.50/0.75/1.00 Calendar
  fixtures, model assertions, and iPhone UI coverage for their distinct
  visible details.
- `672943a` adds simulator assertions for the fixture’s exact `3h 40m`
  duration copy and accessible `Linear trend` detail.
- `4b95848` replaces the single-color activity bars with API-colored category
  stacks and renders the breakdown donut as proportional category segments;
  focused summary and Calendar/Sankey simulator tests remain green.
- `44effba` adds a stable breakdown control and simulator coverage switching
  between path aggregates and session-label aggregates.
- `88ce6b2` makes the breakdown summary explicitly vertical and verifies the
  populated Reports hierarchy on an iPhone 13 Pro simulator.
- `be98db7` adds 60-day, all-zero, and sparse report fixtures with native model
  assertions and iPhone 13 Pro UI coverage for zero-state copy and long-range
  navigability.
- `989f2c6` verifies long path/label content remains exposed in the loaded
  breakdown as well as in filter menus and retains accessible removal controls.
- `5fc9ddf` adds URLProtocol-backed ReportsAPI coverage for Bearer headers,
  repeated report filters, owner-scoped paths, `scope=TIME_ENTRY` labels, and
  GET-only read behavior.
- `b2aefd0` verifies a current-account report 401 invokes the existing recovery
  callback without presenting a false generic report error.
- `5781af9` validates the cached Reports query when the scene returns active,
  while `387981d` adds a simulator assertion for the semantic `Reports` page
  heading.
- `e7cab14` counts first-activation transport calls and verifies repeated model
  loads issue exactly one report, paths, and scoped-label request.
- The Calendar/Sankey textual-detail UI test also passes on iPhone 13 Pro;
  Sankey content remains reachable through its horizontal scroll container.
- `efbd0f4` adds a deterministic 60-day dense fixture with 12+ paths and
  labels, model collection assertions, and iPhone 13 Pro rendering coverage.
- `0a8ac57` gives each chart bucket a stable accessibility identifier and
  verifies its combined date, total, and category detail on iPhone.
- `b4201f9` adds literal-markup fixtures for path, label, and Calendar-note
  content and verifies they remain plain text in iPhone accessibility output.
- `978fdca` verifies 404, 409, and 503 report failures remain recoverable and
  do not invoke the sign-out path.
- `ee8ffd8` verifies sign-out destroys the prior report cache: the same query
  loads a changed report response after the account boundary.
- `4815ca6` asserts Sankey node IDs, depths, values, link endpoints, and link
  values in the native Codable/fixture test; the simulator separately exposes
  the named flow detail.

Current evidence is deliberately narrower than the completion gate:

- `swift test --package-path ios` passes 113 native package tests, including 31
  Reports tests. The focused Reports model suite and Codable/fixture coverage
  also pass independently.
- Focused iPhone 17 Pro simulator UI coverage passes for Reports navigation,
  empty/error recovery, Calendar/Sankey textual details, owner-reference
  fallback, and Calendar annotation visibility. The Reports page no longer
  crashes before its initial async load.
- The forwarded Ubuntu web reference suite passes 1 file and 17 tests.
- Docker is unavailable in the local environment, so the documented
  containerized Gradle command could not run. The local `backend/gradlew`
  fallback fails during Gradle task configuration with `Type T not present`;
  backend gates remain unchecked.
- `xcodegen generate --spec project.yml` succeeds, the generated Xcode project
  builds with `CODE_SIGNING_ALLOWED=NO`, and the focused iPhone 17 Pro
  simulator test `testReportsDestinationAndAccessibleSummaryAreReachable`
  passes. The broader simulator suite still has unrelated pre-existing
  failures in keychain/UI coverage; physical iPhone API flow and sanitized
  web/native comparison screenshots have not been run and remain unchecked
  below.

This section records progress only; it does not waive the completion rule or
mark unverified acceptance criteria complete.

## Working method

1. Re-run the remote `ReportsView` suite above before implementation. Do not
   start a local web server, local Docker stack, local backend, or local
   frontend on the iOS development machine.
2. Inspect `http://localhost:3000/reports` while authenticated with a
   disposable/local account only. Capture reference screenshots at a desktop
   width and a phone-sized viewport (at least 390×844) in light and dark
   themes. Exercise a populated report, empty report, loading/refresh,
   filters, date presets, chart aggregation, trendline, Sankey, Calendar
   inputs, and long-range mobile layout. Never capture or commit tokens,
   credentials, personal data, or screenshots containing them.
3. If the forwarded app is unavailable, inspect the web source/tests and use
   the Ubuntu host only through SSH. Do not modify frontend files or its
   development data.
4. Verify the API contract and ownership behavior against the backend tests.
   Report dates are `LocalDate` values; the custom interval is inclusive and
   may not exceed two years. The server computes tracked time in UTC and
   returns one day object per date in the requested interval.
5. Design a typed `ReportsTransport` and `@MainActor ReportsModel` before the
   view. The model should own query state, cache keys, loading/refresh state,
   stale-request cancellation, filters, URL-equivalent restoration, and
   user-facing errors. The view should render state and send intent.
6. Implement in vertical slices: report models/transport/query helpers and
   tests; workspace navigation plus loading/read-only summary; date presets
   and filters; bar/breakdown/donut views; trendline and Sankey; Calendar
   overlays; then responsive/accessibility/theme polish and UI tests.
7. Re-check every slice against the web tests and screenshot/state matrix.
   Keep a previous report visible during refresh, do not let an older request
   replace a newer query, and keep filters/date state after failures.
8. Exercise the real phone against the Ubuntu development backend before
   handoff. The phone must use the Ubuntu host address, never `localhost`.
9. Update API/testing documentation and `docs/roadmap.md` only if behavior or
   verification coverage changes. This brief alone does not implement or mark
   the milestone complete.

## Web/API behavior matrix to preserve

| State or action | Required behavior and copy |
| --- | --- |
| Initial query | Default to the current Monday–Sunday week and `DAY` aggregation. Load the report plus `/paths` and `/labels?scope=TIME_ENTRY`; reference-data failures must not make a valid report unusable. |
| Initial loading | Show accessible `Loading report…` status and a chart/table/donut skeleton. Do not show the settled empty message while the first report is pending. |
| Loaded report | Show `SUMMARY`, `Tracked time`, total filtered tracked duration, a day/aggregation chart, filter/group toolbar, breakdown table, and donut total. Render every returned day, including zero-duration days, so chart intervals remain stable. |
| Empty report | `No report data for this period.`; an empty breakdown says `No tracked time in this period.`; an empty Sankey says `No tracked time to show in this flow.` |
| Refresh | Keep the current report visible, dim it, expose polite `Updating report…`, and replace it only after the matching query succeeds. Preserve scroll position when a filter/date change triggers a reload. |
| Report failure | `Unable to load the report. Please try again.` with an accessible `Try again` action. A timeout uses `The report took too long to load.` Retain the last valid report when a refresh fails if one exists. |
| Date presets | Offer exactly `Today`, `Yesterday`, `Week`, `Last week`, `Past two weeks`, `Month`, `Last month`, `Quarter`, `Last quarter`, `Year`, and `Last year`. A complete range is required; incomplete/unchanged picker values do nothing. |
| Aggregation | Offer `Daily`, `Weekly`, `Monthly`, `Quarterly`, and `Yearly`. Selecting Daily resets to the current Monday–Sunday week; Weekly uses the past 30 days through today; Monthly uses one year through today; Quarterly uses two years through today; Yearly keeps the selected interval. |
| Previous/next | Shift the inclusive interval by its exact number of days without changing aggregation, filters, trendline, or Sankey choice. |
| Filters | Path and label filters allow multiple selections, removable chips, clear, and empty selection. Send repeated `pathId`/`labelId` query items. Selected paths are OR’d together, selected labels are OR’d together, and the two filter groups are AND’d. |
| Filter options | Use owned `/paths` and `TIME_ENTRY` labels. If reference data has not loaded, derive fallback options from report aggregates. Do not show unrelated Calendar/Log/Note labels. |
| Grouping | Breakdown grouping toggles between `Path` and `Labels`. Show active-day count as `N active days`, based on days with positive tracked time after path filtering. |
| Bar chart | Aggregate returned daily values into selected DAY/WEEK/MONTH/QUARTER/YEAR buckets using Monday weeks and natural UTC month/quarter/year boundaries. Show bucket labels and compact totals; do not duplicate a separate totals row. |
| Trendline | A single accessible toggle cycles `Trendline: Off`, `Trendline: Linear`, and `Trendline: Parabolic`; it fits only non-empty buckets and stops at the last bucket with data. The choice is presentation state and must not alter the API query. |
| Calendar inputs | On DAY aggregation, when daily records exist, allow `Hide calendar inputs` / `Show calendar inputs`. Calendar notes and label portions appear as patterned/color-coded chart overlays and tooltip rows, without changing tracked-time totals. Do not show the toggle when no calendar input exists. |
| Calendar summary | When enabled and data exists, show `DAILY RECORDS`, `Calendar log`, each annotated date (`EEE, MMM d`), note text, label names, and portion text such as `0.5 day`; show aggregate label totals as `N day(s)` or `N marked day(s)`. |
| Sankey | When the response includes `sankey`, show `Show Sankey`; selecting it replaces the bar chart with `TIME FLOW`, `Path timing by day/week/month`, tracked-flow count, chronological nodes, and links. Toggle back with `Show bar chart`. Do not invent a Sankey when the server returns none. |
| URL/session state | Web query state includes `startDate`, `endDate`, `aggregation`, repeated `pathId`, repeated `labelId`, optional `trendline`, and optional `sankey=1`. Native state must be serializable/restorable on section switches and deep-link capable if the app’s navigation supports URLs. Browser back/forward semantics should map to native state restoration where practical. |
| Auth/offline | Every request is bearer-authenticated and owner-scoped by the server. A 401 for the current token signs out through `AppModel`; offline, 404, 409, 503, and timeout failures retain credentials and query/report state and expose retry. Never turn a non-401 error into sign-out. |

## API contract and implementation notes

The API root remains `/api/v1`; `APIClient` appends that root and adds the
bearer token. Use Codable request/response types rather than untyped view
dictionaries:

| Endpoint | Request | Response/notes |
| --- | --- | --- |
| `GET /reports` | `period`, `anchor` for legacy period queries, or both `startDate` and `endDate`; custom ranges accept `aggregation`; repeat `pathId` and `labelId` | `Report` with `period`, `from`, `to`, `totalSeconds`, `days`, `paths`, `sessionLabels`, `calendarLabels`, and optional `sankey`. |
| `GET /paths` | — | Owned active paths used by the path filter; report aggregates are a safe fallback option source. |
| `GET /labels?scope=TIME_ENTRY` | — | Owned reusable session labels used by the label filter; report aggregates are a safe fallback option source. |

Report response shapes are:

- `Category`: nullable `id` where applicable, `label`, `seconds`, and optional
  `color`;
- `Day`: `date: LocalDate`, `totalSeconds`, `paths`, `sessionLabels`, nullable
  `calendarNote`, and `calendarLabels`;
- daily `CalendarLabel`: `id`, `label`, optional `color`, nullable `portion`;
- aggregate Calendar total: `id`, `label`, optional `color`, `days`, and
  `markers`;
- `Sankey`: `granularity`, `nodes`, and `links`, with server-supplied node
  depth/value and link value. Treat the response as authoritative and do not
  re-aggregate or reconnect flows on-device.

The custom range request must include both dates, use `YYYY-MM-DD`, reject a
reversed range, and reject a range over two years. Serialize LocalDate values
without timezone conversion. For a report ending today, the backend clips
tracked time at the current instant; do not calculate that duration locally.

Use a deterministic cache key containing every query-affecting value:
`startDate`, `endDate`, aggregation, ordered/deduplicated path IDs, and
ordered/deduplicated label IDs. Trendline, Sankey visibility, and Calendar
overlay visibility are presentation state and do not change the report cache
key. Cache hits should avoid duplicate report/reference-data calls, while a
manual retry must be able to bypass or replace a failed entry.

The current shared `APIClient` already exposes typed `APIError` status mapping.
Reuse it and route unauthorized responses through the existing callback. Do
not weaken GET retry behavior or make report loading mutate shared auth state.
Guard every async completion with a query generation/request identity so an
older response or sign-out cannot replace current state.

For charts, prefer the system `Charts` framework or a small native SwiftUI
`Canvas`/shape implementation over embedding the web ECharts runtime. Keep the
same semantic data: bar buckets, path colors, calendar patterned overlays,
tooltip-equivalent details, and trendline values. Since chart interaction is
not the only access path, provide a visible/accessibility summary table or
textual chart description containing every bucket/category total. A Sankey may
use a horizontally scrollable native flow representation on compact phones;
preserve chronological columns, path labels, links, flow values, and the
explicit empty state.

## iOS implementation checklist

- Add `Report`, `ReportDay`, `ReportCategory`, `ReportCalendarLabel`,
  `ReportCalendarTotal`, `ReportSankey`, query/draft state, typed
  `ReportsTransport`, `ReportsAPI`, and an observable `@MainActor ReportsModel`.
- Expose explicit `loading`, `loaded`, `refreshing`, `error`, `query`,
  `report`, reference options, cache state, selected breakdown mode, trendline,
  Sankey visibility, and Calendar-overlay visibility. Preserve the last valid
  report during refresh and never overwrite it with an older request.
- Add `ReportsFixture` flags for populated, empty, calendar-input, Sankey,
  loading, timeout, error, filtered, and offline UI tests. Fixtures must use
  deterministic dates, durations, colors, and UUIDs and never contact an
  owner’s account.
- Add the Reports tab to `WorkspaceView` with stable identifier
  `workspace.reports`, selected-state accessibility, shell spacing, theme,
  safe-area, max-width, and sign-out behavior. Reports has no content draft,
  but query changes must remain stable when switching sections.
- Implement a typed query builder that emits ISO LocalDate values and repeated
  filters exactly as the web does. Deduplicate IDs, preserve a deterministic
  order, and keep aggregation independent from the selected date range.
- Build a native date-range control with the eleven exact presets, previous/
  next buttons, incomplete-range protection, explicit labels, and a compact
  phone presentation. Use local calendar date math without adding seconds
  across daylight-saving boundaries.
- Build aggregation selection with native `Picker` semantics and stable
  accessibility identifiers. Keep the selected aggregation visible while a
  new report loads.
- Build path and label multi-select controls with checkbox semantics, active
  chips/removal, clear behavior, long-name wrapping, search if needed for a
  large catalog, and a fallback to report categories when reference loading
  fails. Do not allow unrelated label scopes into the options.
- Render the summary bar chart and a textual/accessibility data table. Use
  tabular numbers, resilient long labels, zero buckets, compact duration
  formatting, accessible colors, and a native reduced-motion presentation.
- Render the breakdown toolbar, `Path`/`Labels` grouping, duration table with
  colored markers and empty state, donut total, and an equivalent VoiceOver
  description. Stack these areas on compact phones as the web does.
- Implement trendline cycling with visible `Off`/`Linear`/`Parabolic` labels,
  accessible next-mode description, and linear/parabolic fitting that follows
  the web’s non-empty-bucket behavior. Do not send trendline changes to the
  API.
- Implement Calendar inputs only for DAY aggregation. Preserve label color,
  portion, note, marker-only fallback, tooltip-equivalent detail, hide/show
  state, and separate daily-record summary. Calendar inputs must never be
  included in tracked-time totals.
- Implement the optional Sankey view from server nodes/links, with a minimum
  usable width or horizontal scroll on iPhone, accessible flow summaries,
  chronological labels, tracked-flow count, and bar-chart fallback toggle.
- Use a polite refresh status, skeletons that mirror the final summary/chart/
  breakdown, accessible errors with retry, and draft-safe query retention.
  Keep existing data visible during parameter changes and avoid layout jumps.
- Honor reduced motion, light/dark/system `WorkspaceTheme` tokens, visible
  focus, Dynamic Type, VoiceOver, safe areas, long content, keyboard dismissal,
  and minimum 44-point controls. Never rely on chart color alone for meaning.
- Keep local API overrides in ignored `ios/Local.xcconfig` or supported
  `KNOW_API_URL`. For the Ubuntu backend use
  `http://<ubuntu-host>:8080/api/v1`; never commit a real host address, token,
  password, account, or screenshot.

## Acceptance criteria

The implementation session is complete only when all of the following are
demonstrated against deterministic fixtures and the Ubuntu-backed phone flow.
Check each criterion independently; do not mark a parent area complete based
only on a happy-path screenshot.

### Navigation and lifecycle

- [x] **AC-001 — Reports destination:** The workspace exposes a visible
  **Reports** destination with accessibility identifier `workspace.reports`.
- [x] **AC-002 — Selected destination:** The Reports destination exposes the
  selected accessibility trait only while Reports is the active section.
- [x] **AC-003 — Native page:** Selecting Reports opens the native SwiftUI
  implementation and does not embed or navigate to the web page.
- [x] **AC-004 — Section restoration:** Switching to another workspace section
  and back restores the latest report query and presentation choices during
  the authenticated app session.
- [x] **AC-005 — First activation:** The first Reports activation loads one
  report, the owned path options, and `TIME_ENTRY` label options without
  duplicate requests caused by SwiftUI view recomposition.
- [x] **AC-006 — Later activation:** Returning to an unchanged, successfully
  cached query reuses the report and reference data instead of immediately
  issuing identical requests.
- [x] **AC-007 — App resume:** Returning from background refreshes or validates
  Reports according to the model’s cache policy without clearing the visible
  report or resetting query state.
- [x] **AC-008 — Sign-out lifecycle:** Sign-out cancels/invalidate in-flight
  report work and clears account-scoped report caches so another account can
  never see the previous account’s data.

### Default range, custom ranges, and presets

- [x] **AC-009 — Default aggregation:** With no restored state, aggregation is
  `DAY` and the visible choice is **Daily**.
- [x] **AC-010 — Default range:** With no restored state, the range starts on
  the current local Monday and ends on the current local Sunday.
- [x] **AC-011 — LocalDate serialization:** Start and end dates are encoded as
  `YYYY-MM-DD` values without conversion through a UTC instant.
- [x] **AC-012 — Inclusive range:** The selected start and end dates are both
  included in the request, chart interval, active-day calculation, and
  accessible summary.
- [x] **AC-013 — Complete-range requirement:** An incomplete date selection
  does not replace the current range or start a request.
- [x] **AC-014 — Unchanged-range behavior:** Re-selecting the exact current
  range does not add redundant navigation history or start a duplicate load.
- [x] **AC-015 — Reversed-range prevention:** The UI prevents or rejects an end
  date before the start date and leaves the previous valid report usable.
- [x] **AC-016 — Maximum range:** A range of exactly two years is accepted when
  allowed by the API contract; a range beyond two years is prevented or shown
  as an inline actionable validation error before replacing visible data.
- [x] **AC-017 — Today preset:** **Today** selects the current local date as
  both boundaries.
- [x] **AC-018 — Yesterday preset:** **Yesterday** selects the previous local
  calendar date as both boundaries.
- [x] **AC-019 — Week preset:** **Week** selects the current Monday–Sunday week.
- [x] **AC-020 — Last week preset:** **Last week** selects the complete previous
  Monday–Sunday week.
- [x] **AC-021 — Past two weeks preset:** **Past two weeks** selects today and
  the preceding 13 local dates, for 14 inclusive days.
- [x] **AC-022 — Month preset:** **Month** selects the first through last local
  dates of the current month.
- [x] **AC-023 — Last month preset:** **Last month** selects the first through
  last dates of the previous month.
- [x] **AC-024 — Quarter preset:** **Quarter** selects the natural current
  calendar quarter.
- [x] **AC-025 — Last quarter preset:** **Last quarter** selects the complete
  previous natural calendar quarter.
- [x] **AC-026 — Year preset:** **Year** selects January 1 through December 31
  of the current year.
- [x] **AC-027 — Last year preset:** **Last year** selects January 1 through
  December 31 of the previous year.
- [x] **AC-028 — Previous interval:** Previous-range navigation shifts both
  boundaries backward by the current interval’s exact inclusive day count.
- [x] **AC-029 — Next interval:** Next-range navigation shifts both boundaries
  forward by the current interval’s exact inclusive day count.
- [x] **AC-030 — Shift stability:** Previous/next navigation preserves
  aggregation, path filters, label filters, trendline mode, Sankey mode, and
  Calendar-input visibility.
- [x] **AC-031 — Date edge cases:** Presets and interval shifts remain correct
  across month/year boundaries, leap day, and daylight-saving transitions.

### Aggregation and report query

- [x] **AC-032 — Aggregation choices:** The control offers exactly **Daily**,
  **Weekly**, **Monthly**, **Quarterly**, and **Yearly**.
- [x] **AC-033 — Daily range reset:** Choosing Daily selects the current local
  Monday–Sunday week before loading.
- [x] **AC-034 — Weekly range reset:** Choosing Weekly selects the past 30
  inclusive local dates ending today.
- [x] **AC-035 — Monthly range reset:** Choosing Monthly selects the one-year
  rolling interval ending today, matching the web date calculation.
- [x] **AC-036 — Quarterly range reset:** Choosing Quarterly selects the
  two-year rolling interval ending today, matching the web date calculation.
- [x] **AC-037 — Yearly range behavior:** Choosing Yearly keeps the current
  selected date interval rather than silently selecting another preset.
- [x] **AC-038 — Range/aggregation independence:** Selecting a custom range
  after choosing an aggregation preserves that aggregation.
- [x] **AC-039 — Required report parameters:** Every custom request sends
  `startDate`, `endDate`, and uppercase `aggregation` exactly once.
- [x] **AC-040 — Path query items:** Every selected path is sent as a repeated
  `pathId` query item; no placeholder or empty ID is sent.
- [x] **AC-041 — Label query items:** Every selected session label is sent as a
  repeated `labelId` query item; no placeholder or empty ID is sent.
- [x] **AC-042 — Deterministic query:** Duplicate filter IDs are removed and
  query/cache ordering is deterministic, so equivalent selections reuse one
  cache entry.
- [x] **AC-043 — Server response boundaries:** If the API returns normalized
  `from`/`to` boundaries, those values become the displayed authoritative
  range for that completed query.
- [x] **AC-044 — Presentation-only state:** Trendline, bar/Sankey choice, and
  Calendar-input visibility do not alter `/reports` query parameters or cause
  report requests.

### Path and label filters

- [x] **AC-045 — Path option source:** Path choices come from the owner-scoped
  `/paths` response when available.
- [x] **AC-046 — Path fallback:** If path reference loading fails, categories
  with IDs from the current report remain available as path filter options.
- [x] **AC-047 — Label option source:** Label choices come only from
  `/labels?scope=TIME_ENTRY` when reference data is available.
- [x] **AC-048 — Label fallback:** If label reference loading fails, session
  label categories with IDs from the current report remain available.
- [x] **AC-049 — Scope isolation:** `LOG`, `NOTE`, and Calendar-only labels are
  never offered in the report session-label filter.
- [x] **AC-050 — Multiple paths:** The user can select more than one path and
  every selected value remains visibly identifiable.
- [x] **AC-051 — Multiple labels:** The user can select more than one session
  label and every selected value remains visibly identifiable.
- [x] **AC-052 — Individual removal:** Each selected path or label can be
  removed independently with an accessible control.
- [x] **AC-053 — Clear filters:** Path and label filters can each be cleared
  without resetting the date range, aggregation, or the other filter group.
- [x] **AC-054 — Filter semantics:** The resulting data demonstrates OR within
  selected paths, OR within selected labels, and AND between the two groups.
- [x] **AC-055 — Filtering refresh:** Changing filters keeps the previous
  report visible until the matching filtered response succeeds.
- [x] **AC-056 — No category leakage:** Daily chart categories not present in
  the report’s filtered aggregate categories are not included in displayed
  totals, bars, tables, tooltips, or accessibility summaries.
- [x] **AC-057 — Long option content:** Very long path and label names wrap or
  truncate without hiding removal controls, creating horizontal page overflow,
  or losing their full accessible name.

### Loading, refresh, caching, and errors

- [x] **AC-058 — Initial loading copy:** The first unresolved report request
  exposes the accessible status `Loading report…`.
- [x] **AC-059 — Initial skeleton:** Initial loading displays placeholders for
  the chart heading/total, chart body, filter toolbar, breakdown rows, and
  donut so the final layout does not shift substantially.
- [x] **AC-060 — No premature empty state:** `No report data for this period.`
  is not shown while the first request is pending.
- [x] **AC-061 — Refresh copy:** A parameter change with an existing report
  exposes polite `Updating report…` status.
- [x] **AC-062 — Refresh visibility:** The last valid report remains visible
  and recognizably busy/dimmed during refresh.
- [x] **AC-063 — Refresh interaction safety:** Controls cannot accidentally
  submit duplicate equivalent loads while the same query is active.
- [x] **AC-064 — Matching completion:** Only the response belonging to the
  current query may replace the visible report.
- [x] **AC-065 — Stale completion:** A slower response for an older range,
  aggregation, filter, account, or app lifecycle cannot overwrite newer state.
- [x] **AC-066 — Successful cache reuse:** Revisiting a successfully cached
  query restores its report without a duplicate network request.
- [x] **AC-067 — Complete cache key:** Changing any query-affecting date,
  aggregation, path, or label value addresses a distinct cache entry.
- [x] **AC-068 — No error caching:** A failed, cancelled, malformed, or timed-out
  response is not stored as a successful cache entry.
- [x] **AC-069 — Generic error:** A non-timeout load failure presents
  `Unable to load the report. Please try again.` as an accessible alert.
- [x] **AC-070 — Timeout error:** A request exceeding the intended timeout
  presents `The report took too long to load.` as an accessible alert.
- [x] **AC-071 — Retry action:** Every report load error provides an accessible
  `Try again` action that repeats the current query, not the default query.
- [x] **AC-072 — Refresh failure retention:** If refresh fails, the last valid
  report and current query controls remain available; the UI does not replace
  them with a false empty state.
- [x] **AC-073 — Reference failure tolerance:** Failure of `/paths` or
  `/labels?scope=TIME_ENTRY` does not hide an otherwise valid report or replace
  it with the report-load error.
- [x] **AC-074 — Malformed response:** Missing required report arrays or an
  otherwise invalid payload produces a recoverable load error and never a
  partially trusted chart.

### Summary chart and bucket calculations

- [x] **AC-075 — Summary hierarchy:** A loaded report exposes `SUMMARY`,
  `Tracked time`, and the filtered total as the first report data section.
- [x] **AC-076 — Authoritative days:** Every day returned by the API is retained
  in interval order, including zero-duration days.
- [x] **AC-077 — Daily buckets:** DAY aggregation produces one bucket per
  returned date labeled like `EEE, MMM d` using locale-aware formatting.
- [x] **AC-078 — Weekly buckets:** WEEK aggregation groups dates into
  Monday-first weeks and labels the covered week/range consistently with web
  and server semantics.
- [x] **AC-079 — Monthly buckets:** MONTH aggregation groups dates by natural
  calendar month and labels buckets like `MMM yyyy`.
- [x] **AC-080 — Quarterly buckets:** QUARTER aggregation groups dates into
  natural quarters and labels buckets like `Q1 2026`.
- [x] **AC-081 — Yearly buckets:** YEAR aggregation groups dates by calendar
  year and labels buckets with the year.
- [x] **AC-082 — Partial boundary buckets:** A custom interval beginning or
  ending inside a week/month/quarter/year includes only the requested dates
  while retaining the correct semantic bucket label.
- [x] **AC-083 — Bucket totals:** Each bucket total equals the sum of its
  displayed filtered path categories.
- [x] **AC-084 — Report total:** The summary total equals the sum of all
  displayed filtered daily path durations and does not include Calendar
  portions or notes.
- [x] **AC-085 — Duration precision:** Main tracked totals use the web’s report
  duration format; breakdown rows and compact bucket labels use their matching
  hours/minutes formats without accidental decimal-hour conversion.
- [x] **AC-086 — Tabular numbers:** Comparable durations and counts use tabular
  numerals and remain aligned at larger Dynamic Type sizes.
- [x] **AC-087 — Category colors:** API-provided path colors are used when
  present; missing colors use the deterministic report palette consistently
  across chart, table, donut, tooltip/detail, and accessibility legend.
- [x] **AC-088 — Long ranges:** Ranges with more than 31 daily values remain
  navigable/readable through native scrolling or range navigation without
  compressing labels and targets into unusable sizes.
- [x] **AC-089 — Chart detail:** Selecting/focusing a bucket exposes its date,
  total, category durations, and percentages in a native accessible detail
  presentation equivalent to the web tooltip.
- [x] **AC-090 — Safe generated content:** User-controlled path names, label
  names, and Calendar notes render as text and cannot be interpreted as markup.
- [x] **AC-091 — Textual chart equivalent:** VoiceOver and nonvisual users can
  access every bucket’s label, total, and category values without relying on
  chart geometry or color.

### Trendline

- [x] **AC-092 — Trendline initial state:** Trendline starts at **Off** unless
  restored presentation state specifies another valid mode.
- [x] **AC-093 — Trendline cycle:** Repeated activation cycles exactly Off →
  Linear → Parabolic → Off.
- [x] **AC-094 — Trendline visible state:** The control visibly names the
  current mode and exposes pressed/state information accessibly.
- [x] **AC-095 — Linear calculation:** Linear mode fits only positive/non-empty
  bucket totals and produces the same rounded, nonnegative values as the web.
- [x] **AC-096 — Parabolic calculation:** Parabolic mode fits only positive/
  non-empty bucket totals and follows the web fallback behavior when the
  quadratic system cannot be solved.
- [x] **AC-097 — Insufficient trend data:** A trendline is omitted when there
  are too few non-empty points for its calculation; the app does not crash or
  draw misleading zero data.
- [x] **AC-098 — Trendline extent:** Trend data starts at the first non-empty
  bucket and stops at the last non-empty bucket.
- [x] **AC-099 — Trendline accessibility:** Bucket detail identifies the active
  trendline type and value without using line style/color as the only cue.

### Breakdown table and donut

- [x] **AC-100 — Filter toolbar:** The breakdown section exposes path filters,
  label filters, grouping, and active-day count as one logically labeled area.
- [x] **AC-101 — Default grouping:** Breakdown grouping starts at **Path** unless
  a valid restored state specifies **Labels**.
- [x] **AC-102 — Path grouping:** Path mode shows the report’s path aggregate
  categories with a `Path` heading and one total per category.
- [x] **AC-103 — Label grouping:** Labels mode shows the report’s session-label
  aggregate categories with a `Label` heading and one total per category.
- [x] **AC-104 — Active-day count:** `N active days` counts only displayed days
  with a positive filtered tracked-time total.
- [x] **AC-105 — Breakdown total:** The donut center total equals the sum of the
  categories in the currently selected breakdown mode.
- [x] **AC-106 — Donut segments:** Donut segment values and colors match the
  visible breakdown rows one-for-one.
- [x] **AC-107 — Donut accessibility:** The donut has an accessible description
  containing every category and duration, including an explicit no-tracked-
  time description when empty.
- [x] **AC-108 — Empty breakdown:** A grouping with no categories shows
  `No tracked time in this period.` and a zero `00:00` donut total.
- [x] **AC-109 — Compact stacking:** On a small iPhone, the breakdown table and
  donut stack vertically in reading order with no clipped rows or labels.

### Calendar inputs and daily-record summary

- [x] **AC-110 — Calendar data separation:** Calendar notes, markers, and day
  portions never change tracked seconds, bucket totals, breakdown totals,
  active-day counts, trendline inputs, or Sankey values.
- [x] **AC-111 — Daily-only overlay:** Calendar overlays appear in the summary
  chart only while aggregation is DAY.
- [x] **AC-112 — Toggle availability:** The Calendar-input toggle appears only
  when at least one returned day contains a Calendar note or label assignment.
- [x] **AC-113 — Toggle copy:** The enabled state says `Hide calendar inputs`;
  the disabled state says `Show calendar inputs`.
- [x] **AC-114 — Toggle scope:** Hiding Calendar inputs removes both chart
  overlays and the separate Calendar log/summary without changing API/query
  state or tracked-time content.
- [x] **AC-115 — Note-only overlay:** A day with only a Calendar note receives
  the neutral note marker/overlay and exposes the note in bucket detail.
- [x] **AC-116 — Marker-only label:** A null or zero portion renders as a visible
  marker-sized segment and is described as `Marked`, not `0 day`.
- [x] **AC-117 — Fractional portions:** `0.25`, `0.50`, `0.75`, and `1.00`
  portions produce separate proportional segments without merging labels.
- [x] **AC-118 — Calendar colors:** Each assignment uses its API color or the
  same safe fallback color as the web; pattern plus text provides a redundant
  non-color cue.
- [x] **AC-119 — Multiple labels:** Multiple Calendar assignments on one date
  remain individually visible and individually named in chart detail.
- [x] **AC-120 — Calendar log heading:** Visible Calendar details use the
  hierarchy `DAILY RECORDS` then `Calendar log`.
- [x] **AC-121 — Calendar log rows:** Every annotated day displays its localized
  date, multiline note when present, label names, colors, and portion text.
- [x] **AC-122 — Calendar aggregate days:** A Calendar aggregate with positive
  `days` shows correct singular/plural copy such as `1 day` or `2 days`.
- [x] **AC-123 — Calendar aggregate markers:** An aggregate with no day portion
  shows correct singular/plural copy such as `1 marked day` or
  `2 marked days`.
- [x] **AC-124 — Read-only Calendar data:** Reports offers no edit, create,
  delete, or recolor action for Calendar notes or labels.

### Sankey path flow

- [x] **AC-125 — Sankey availability:** `Show Sankey` appears only when the
  report response includes a Sankey object.
- [x] **AC-126 — Sankey switch:** Selecting `Show Sankey` replaces the bar chart
  with the flow view while preserving all other report sections and query
  state.
- [x] **AC-127 — Bar restoration:** Sankey mode offers `Show bar chart`, which
  restores the existing bar chart without a report request.
- [x] **AC-128 — Sankey hierarchy:** The flow section exposes `TIME FLOW` and
  `Path timing by <granularity>` with the API granularity in readable form.
- [x] **AC-129 — Flow count:** The visible tracked-flow count equals the number
  of server-provided links and uses understandable singular/plural wording.
- [x] **AC-130 — Authoritative nodes:** Every server node preserves its ID,
  path label, bucket label, depth, value, and optional color; the client does
  not recompute node values.
- [x] **AC-131 — Authoritative links:** Every server link preserves source,
  target, source/target labels, and value; the client does not reconnect or
  redistribute flow.
- [x] **AC-132 — Chronological depth:** Node columns follow server depth in
  chronological order and display aggregate bucket totals consistently.
- [x] **AC-133 — Flow detail:** Selecting/focusing a node or link exposes its
  bucket/path or source/target labels and formatted duration.
- [x] **AC-134 — Empty Sankey:** A provided Sankey with no nodes displays
  `No tracked time to show in this flow.` and remains switchable back to the
  bar chart.
- [x] **AC-135 — Sankey accessibility:** VoiceOver can read a textual sequence
  of all flows and values without interpreting the diagram geometry.
- [x] **AC-136 — Compact Sankey:** On a small iPhone, Sankey content uses an
  intentional horizontal scroll or equivalent compact representation; the
  rest of the page does not gain unwanted horizontal scrolling.

### Empty, sparse, dense, and long-content states

- [x] **AC-137 — Null/invalid report:** A null or unusable report cannot produce
  misleading totals; after loading settles, the page shows the report empty
  state or a recoverable validation error according to the web behavior.
- [x] **AC-138 — Report empty copy:** A valid settled state with no report data
  shows `No report data for this period.`.
- [x] **AC-139 — Zero-day stability:** A valid report containing only zero
  duration days keeps those dates visible and shows zero totals without NaN,
  division-by-zero percentages, or missing axes.
- [x] **AC-140 — Sparse report:** One active date among many zero dates renders
  the full interval and reports exactly one active day.
- [x] **AC-141 — Dense report:** Many paths, labels, daily records, buckets, and
  Sankey links remain scrollable and responsive without overlapping controls.
- [x] **AC-142 — Long user content:** Very long path names, label names, and
  multiline Calendar notes wrap, clamp, or scroll appropriately and never
  obscure values or actions.
- [ ] **AC-143 — Large collection performance:** Long report lists/charts avoid
  unnecessary recomputation and view updates during scrolling or unrelated
  presentation toggles.

### Accessibility, layout, and theming

- [x] **AC-144 — Semantic hierarchy:** Reports has a clear page heading and
  correctly ordered section headings; decorative chart elements are hidden
  from accessibility.
- [ ] **AC-145 — Accessible controls:** Every date, filter, aggregation,
  trendline, Calendar, Sankey, retry, and chip-removal control has a precise
  accessible name, role, value/state, and hint where needed.
- [ ] **AC-146 — Touch targets:** Every interactive target is at least 44×44
  points on iPhone, including previous/next arrows and chip removal.
- [ ] **AC-147 — Keyboard support:** Hardware-keyboard users can reach and
  activate every control in logical order without a focus trap.
- [ ] **AC-148 — Visible focus:** Focus is visibly indicated and is not covered
  by the workspace header, refresh presentation, sheets, or safe-area insets.
- [ ] **AC-149 — VoiceOver updates:** Initial loading, refresh, errors, retry
  results, and major presentation-mode changes are announced politely without
  repeatedly reading the entire page.
- [ ] **AC-150 — Non-color status:** Category identity, Calendar input, selected
  state, and chart meaning are never communicated by color alone.
- [ ] **AC-151 — Dynamic Type:** All controls and report text remain readable at
  accessibility text sizes; content reflows instead of clipping or overlapping.
- [ ] **AC-152 — Small iPhone:** At the project’s smallest supported iPhone
  viewport, controls wrap/stack, charts remain usable, and only Sankey may
  intentionally scroll horizontally.
- [ ] **AC-153 — Large iPhone:** Available width is used without stretching
  readable content or leaving accidental alignment gaps.
- [ ] **AC-154 — Orientation and safe areas:** Portrait and supported landscape
  layouts respect top, bottom, and horizontal safe areas and avoid unwanted
  nested scrolling.
- [ ] **AC-155 — Light appearance:** Text, controls, chart marks, gridlines,
  focus, selected states, and errors meet contrast requirements in light mode.
- [ ] **AC-156 — Dark appearance:** The same elements meet contrast requirements
  in dark mode, and chart/system surfaces match `WorkspaceTheme`.
- [ ] **AC-157 — System appearance:** Changing the system appearance updates the
  report and native chart colors without requiring a reload or losing state.
- [ ] **AC-158 — Reduced motion:** Reduced Motion disables shimmer/scan/orbit
  animation and nonessential chart transitions while retaining clear loading
  and refresh feedback.
- [ ] **AC-159 — Locale awareness:** Displayed dates, counts, percentages, and
  durations use locale-aware formatting while API dates remain stable ISO
  LocalDate strings.

### Authentication, ownership, and data safety

- [x] **AC-160 — Bearer authentication:** `/reports`, `/paths`, and scoped-label
  requests include the current bearer token and never log or persist it in
  report state, fixtures, screenshots, or diagnostics.
- [x] **AC-161 — Current-token 401:** A 401 belonging to the current account
  routes through the existing `AppModel` sign-out flow.
- [ ] **AC-162 — Delayed 401 safety:** A delayed 401 from an obsolete token or
  superseded account cannot sign out a newer authenticated session.
- [x] **AC-163 — Non-auth failures:** Offline, timeout, 404, 409, and 503 errors
  retain the current credential and do not produce false sign-out.
- [ ] **AC-164 — Owner isolation:** All displayed paths, labels, time totals,
  Calendar records, and Sankey data come only from owner-scoped API responses.
- [x] **AC-165 — Account cache isolation:** Cache keys include account identity
  or caches are destroyed on account change; data cannot cross accounts even
  when query parameters are identical.
- [x] **AC-166 — Read-only behavior:** Reports performs no POST, PUT, PATCH, or
  DELETE request and never mutates tracked time or Calendar data locally.
- [ ] **AC-167 — Secret-free configuration:** API overrides remain in ignored
  local configuration; no host address, password, token, account detail, or
  personal report content is committed.

### Verification evidence and completion gate

- [x] **AC-168 — Web reference tests:** The current remote
  `ReportsView.test.ts` suite passes and its test count/result is recorded in
  the implementation handoff.
- [ ] **AC-169 — Backend reference tests:** Relevant report controller,
  service, integration, ownership, filter, Calendar, and Sankey tests pass in
  the appropriate Ubuntu/deployed-shaped environment.
- [x] **AC-170 — Native unit tests:** All report model, transport, query,
  aggregation, trendline, Calendar, Sankey, cache, lifecycle, and error tests
  pass on the macOS iOS development host.
- [ ] **AC-171 — Native UI tests:** Reports UI tests pass for populated, empty,
  loading, refresh, error, offline, filtered, Calendar, Sankey, light/dark,
  small-phone, Dynamic Type, and reduced-motion fixtures.
- [x] **AC-172 — Existing regression tests:** Existing authentication,
  Sessions, Logs, Labels, Notes, Paths, Calendar, and workspace tests remain
  green.
- [ ] **AC-173 — Web screenshots:** Sanitized reference screenshots are
  captured from forwarded `http://localhost:3000/reports` at desktop and
  390×844 phone widths for light/dark, populated/empty, refresh/error,
  filters, trendline, Sankey, and Calendar-input states.
- [ ] **AC-174 — Native comparison screenshots:** Matching iOS fixture/device
  screenshots are captured and reviewed beside the web references for visual
  hierarchy, spacing, wrapping, responsive order, colors, and state copy.
- [ ] **AC-175 — Real-device API flow:** A Debug build on a physical iPhone
  loads the disposable Ubuntu-backed account through
  `http://<ubuntu-host>:8080/api/v1` and verifies range, aggregation, filters,
  retry, Calendar, and Sankey flows without using `localhost`.
- [ ] **AC-176 — Screenshot/data hygiene:** Reference evidence contains no
  token, password, personal account, production data, or unsanitized private
  content and is not committed unless explicitly approved and sanitized.
- [x] **AC-177 — No frontend changes:** The milestone diff contains no frontend
  implementation change; any web discrepancy discovered during comparison is
  documented separately rather than fixed as part of iOS Reports work.
- [ ] **AC-178 — Final diff review:** The final diff contains no generated
  project noise, credentials, stale local addresses, inaccessible chart-only
  information, accidental compatibility changes, or unrelated edits.
- [x] **AC-179 — Unavailable gates recorded:** Any simulator, physical-device,
  Ubuntu, or full-stack check that cannot run is recorded explicitly with its
  reason and remains unchecked.
- [ ] **AC-180 — Completion rule:** The milestone is not marked complete until
  every applicable checkbox above has objective test, screenshot, inspection,
  or device evidence; building successfully by itself is insufficient.

## Test plan and gates

Write tests with each vertical slice. Use stable accessibility identifiers,
not pixel coordinates or localized visible strings alone.

Unit/model tests MUST cover:

- Codable decoding/encoding for LocalDate, nullable calendar fields, category
  colors, decimal portions, aggregate totals, Sankey nodes/links, and missing
  optional Sankey data;
- query construction for default week, all presets, exact interval shifting,
  aggregation changes, two-year boundary, repeated/deduplicated filters, and
  cache-key equality/inequality;
- report bucket aggregation for Monday weeks and natural month/quarter/year
  boundaries, zero buckets, active-day counting, duration formatting, and
  linear/parabolic trend calculations including insufficient data;
- initial load, cache hit, refresh preserving visible data, stale response
  suppression, empty report, timeout/error/retry, and reference-data fallback;
- Calendar overlay calculations for marker-only, zero/missing portions,
  fractional portions, notes, label totals, visibility, and unchanged tracked
  totals;
- Sankey pass-through rendering data, empty flow, malformed/absent optional
  data, and accessible summary text;
- transport paths, methods, query items, bearer token use, status/error
  mapping, unauthorized sign-out, and credential retention. Keep existing
  auth, Sessions, Logs, Labels, Notes, Paths, and Calendar tests green.

SwiftUI/UI regression tests MUST cover:

- `workspace.reports` navigation and selected state, initial skeleton,
  populated report, empty/error/retry, refresh overlay, and cached revisit;
- date-range control, all presets, previous/next controls, aggregation
  picker, query restoration, path/label multi-select, chips, clear, and long
  option names;
- chart summary, breakdown table, donut accessibility description, active-day
  count, grouping toggle, zero/empty categories, trendline cycle, Calendar
  input toggle/summary, and Sankey/bar toggle with empty Sankey;
- small-phone layout, intentionally scrollable Sankey, keyboard/focus
  behavior, light/dark appearance, Dynamic Type accessibility size, VoiceOver
  labels/traits, reduced-motion behavior, safe areas, and 44-point controls.
  Add fixture flags for loaded, empty, error, offline, calendar, filtered, and
  Sankey states without contacting the owner’s account.

Run the remote web `ReportsView` suite as the reference suite and the backend
Report API/service/integration tests for ownership, date validation, UTC
clipping, filters, aggregation, Calendar inputs, and Sankey construction. On
a macOS host, open `ios/Package.swift`, run package/unit tests, generate the
Xcode project with the repository’s documented command, build and run the
aggregate simulator UI suite, then install Debug on an iPhone and verify the
Ubuntu `:8080` flow manually. Do not start local web/backend development on
the iOS-only machine. Run the relevant checks from `AGENTS.md` when the
responsible development environment is available and record unavailable
checks rather than fabricating results.

## Commit and review cadence

Commit regularly in chronological and semantic order: each commit should
represent the next coherent slice, build on the preceding slice, and use a
subject that describes the behavior it adds. Do not mix unrelated auth,
generated-project, icon, frontend, or local-environment changes into a
Reports commit. Recommended sequence:

1. this handoff/query/API notes and the web screenshot/state matrix;
2. typed report models, transport, query builder, cache, and unit tests;
3. workspace navigation, fixtures, loading/error/empty states, and read-only
   summary;
4. date presets, aggregation, filters, and breakdown table/donut;
5. bar chart, trendlines, Calendar overlays, and Sankey;
6. accessibility/responsive/theme polish, simulator/device verification, and
   final regression coverage.

Review each diff for frontend changes, credentials, personal data, stale local
addresses, chart-only inaccessible information, accidental cache invalidation
loops, and compatibility-identifier changes.
