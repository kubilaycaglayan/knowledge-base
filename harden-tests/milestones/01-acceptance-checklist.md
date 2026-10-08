# HARD-01 acceptance checklist: search and direct routes

Use this checklist with [HARD-01](01-browser-journeys.md). Check an item only
when its linked test or run report provides the named evidence.

## Coverage inventory

- [x] Cross-check the current global search type union and router against
  `frontend/src/lib/search.ts` and `frontend/src/main.ts`. Update this table
  whenever either source changes.

| Search result | Current destination | Direct-load result to assert |
| --- | --- | --- |
| Session | `/sessions/:id` | Matching session dialog opens, including when it is outside the current list page; closing returns to `/`. |
| Log | `/logs/:id` | Matching log opens from its stable address; missing log explains recovery without stale list content. |
| Path | `/paths/:id` | Matching path history opens; closing returns to the path list. |
| Label | `/labels/:id` | Matching label history opens; existing label list filter is preserved when closing. |
| Calendar day | `/calendar?date=YYYY-MM-DD` | Correct month is shown and the requested valid day is selected; impossible dates do not select a different day silently. |
| Active note | `/notes/:id` | Matching note editor opens with the expected title/body and ownership. |
| Archived note | `/notes?archived=1&q=:noteTitle` | Archive is active and filtered to the result title; an untitled note uses an empty `q`. |
| Active board | `/board?board=:boardId` | Requested board is selected, including when it is not among initially visible tabs. |
| Active card | `/board?board=:boardId&card=:cardId&cardBoard=:boardId` | Owning board is selected and the matching card editor opens, including a card outside the initial loaded page. |
| Archived board | `/board/archive?archivedBoard=:boardId` | Matching archived board is highlighted/targeted in the archive view. |
| Archived card | `/board/archive?board=:boardId&card=:cardId` | Owning archive board and archived card are targeted without opening the active-card editor. |

Global search also offers page shortcuts from the `appPages` list in
`frontend/src/lib/search.ts`. Cover each current destination and its keyboard
and click activation:

| Page shortcut | Destination | Alias to cover |
| --- | --- | --- |
| Sessions | `/` | `home`, `timer` |
| Board | `/board` | `kanban` |
| Board archive | `/board/archive` | — |
| Logs | `/logs` | — |
| Notes | `/notes` | — |
| Calendar | `/calendar` | — |
| Reports | `/reports` | — |
| Timeline | `/timeline` | — |
| Paths | `/paths` | — |
| Labels | `/labels` | — |
| Imports | `/imports` | — |
| Development | `/development` | — |
| Settings | `/settings` | `preferences` |

- [ ] Verify each page shortcut's exact destination, displayed page name,
  keyboard selection/Enter behavior, click behavior, and browser-history result.
- [ ] Verify aliases resolve to the same destination and do not create a
  record-search request when the interaction is only a page jump.
- [ ] Ensure page shortcuts remain distinguishable from record results when
  the same query has both a page match and record matches.

The following URL-driven states are not all emitted by global search, but are
part of the shareable direct-navigation contract:

| Page | URL state | Expected restored state |
| --- | --- | --- |
| Notes | `/notes?q=:query` | Search field and filtered note results match the query after a direct load and reload. |
| Notes | `/notes?archived=1&q=:query` | Archive mode and query are restored together; clearing one does not silently discard the other. |
| Notes | `/notes?lines=1` (or combined with supported note-list query keys) | Line-history control is enabled after direct load. |
| Labels | `/labels?q=:query` | Filter is restored and retained when opening and closing a label history route. |
| Board | `/board?board=:boardId&view=gantt&from=YYYY-MM-DD&to=YYYY-MM-DD` | Owning board, Gantt view, and inclusive date range are restored. |
| Board | `/board?board=:boardId&q=:query` | Board search is restored without selecting a different board. |
| Board | `/board?board=:boardId&lines=1` | Line-history preference represented in the URL is restored. |
| Board archive | `/board/archive?board=:boardId` | An active board becomes the archive context; an archived board is highlighted; an unknown ID falls back to the selected board and updates the URL. |

- [ ] Direct-load each supported state above, reload it, and assert the
  controls, selected records, filtered results, and URL remain consistent.
- [ ] For date ranges, assert the URL values are the values used by the loaded
  Gantt request and that the end date is treated as inclusive per the board
  contract.
- [ ] For unknown or malformed query values, assert the documented fallback
  state and canonical URL; do not silently display a different state while
  leaving the requested URL unchanged.

- [ ] Assert every row's visible identity and destination state through the
  full authenticated real-stack browser journey; unit route mapping alone is
  not acceptance evidence.
- [ ] Assert URL pathname and relevant query parameters after opening results;
  assert browser Back returns to the prior search and Forward restores the
  selected destination.
- [ ] Direct-load every destination above in a fresh context and assert the
  path, query values, visible record identity, and absence of unrelated stale
  selection state.
- [ ] For board/card links, assert both `board` and `cardBoard` ownership
  parameters where generated; parse query parameters semantically instead of
  relying on query-string ordering.
- [ ] Cover a valid active card URL where the card is outside the initial
  loaded page; assert the owning board and card editor appear after the card
  fetch completes.
- [ ] Cover a valid archived-card URL separately and assert it targets the
  archive view instead of requesting the active-card dialog.
- [ ] Check browser Back/Forward across direct links and in-app result
  activation; verify route and visible selected state remain synchronized.
- [ ] Cover missing and foreign-user IDs for each applicable entity family;
  assert no foreign title/body/metadata is rendered and recovery navigation is
  available.
- [ ] Cover empty search results, query trimming/encoding, and a search result
  with punctuation or non-ASCII text where supported by the API contract.
- [ ] Keep debounce and stale-response race assertions at the unit/store level;
  real-stack tests must assert the user-visible final result without relying on
  arbitrary sleeps.

## Machine and browser profiles

- [x] Record the available machine's OS, CPU architecture, memory, Node,
  Playwright, and browser versions in the run report.
- [x] Pass the full selected journey set in desktop Chromium at the documented
  desktop viewport and scale factor.
- [x] Pass the full selected journey set with
  `BROWSER_ENGINE=chromium BROWSER_PROFILE=iphone` at 390×844, touch enabled,
  and device scale factor 3; report it as mobile-size Chromium emulation.
- [x] Pass the supported emulated iPhone WebKit profile separately; label it
  WebKit and do not count it as Chrome evidence.
- [ ] Check mobile layout for horizontal overflow, clipped dialogs, reachable
  controls, and usable Back/Forward navigation at phone width.
- [ ] Check desktop layout for visible result identity, dialog placement, and
  keyboard-operable search/result navigation.
- [x] State clearly that Chromium emulation does not prove physical Android
  Chrome behavior and WebKit emulation does not prove physical iPhone behavior;
  record physical-device evidence separately if run.

## Isolation and evidence

- [x] Seed the selected active-route entities through test APIs using a unique
  disposable account; no personal or production data is used.
- [x] Run against a clean disposable PostgreSQL/API/proxy/web stack and record
  its unique Compose project and image identifiers.
- [x] Run each browser profile from the same commit and fixture definition, and
  retain separate reports with pass/fail/skip counts.
- [ ] Retain failure screenshot, trace, console/network evidence, and relevant
  server logs in ignored local storage or CI artifacts; link them in the run.
- [x] Verify cleanup removes only the test project and its disposable volumes.
- [x] Repeat the selected journeys from clean stacks on the same commit and
  confirm results do not depend on persistent development data.
- [ ] Link the real-stack tests, commands, reports, and any known unsupported
  route cases from the milestone status before marking it complete.

## Source of route contract

The route matrix above was checked against `frontend/src/lib/search.ts`,
`frontend/src/lib/search.test.ts`, `frontend/src/main.ts`, and
`frontend/src/views/DeepLinks.test.ts`. The component tests use mocked APIs and
memory history; they do not replace the real-stack browser evidence required
for this milestone.
