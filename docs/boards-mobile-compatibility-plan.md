# Boards mobile compatibility plan

## Goal

Make the Boards page, Kanban view, and card editor usable at iOS Safari and
Chrome mobile viewport sizes, including touch interaction, the software
keyboard, safe areas, and narrow screens.

## Steps

1. **Audit current behavior** — [x] inspect the board layout, editing flows, and
   existing tests; record concrete layout and input constraints.
2. **Kanban on phones** — [x] make horizontal column navigation and vertical card
   scrolling work predictably with touch, keep controls reachable, and avoid
   viewport-height assumptions that break when browser chrome or the keyboard
   changes size.
3. **Card editor on phones** — [x] use the available visual viewport and safe areas,
   keep title/body/footer controls reachable while the keyboard is open, and
   ensure fields do not trigger iOS zoom or become clipped.
4. **Responsive controls and touch targets** — [x] check board tabs, column actions,
   metadata pickers, date picker, and card actions at narrow widths; retain
   keyboard access and visible focus.
5. **Verify and document** — [x] add/update focused responsive behavior tests, run
   the frontend tests and build, and exercise the relevant screens at iOS and
   Chrome mobile viewport sizes where the local browser environment permits.

## Progress

- Implemented and committed the viewport-aware Kanban sizing and full-height
  phone card editor.
- Kept pinch zoom available on the horizontally scrolling Kanban and its
  vertically scrolling columns by using `touch-action: manipulation`; a browser
  regression assertion confirms both surfaces retain pan and zoom gestures.
- Enlarged the mobile card date clear and selected-label remove controls to
  44px touch targets; the label-fit measurement accounts for the larger remove
  buttons so the compact picker still shows only labels that fit.
- Browser checks cover 320px and 390px Kanban layouts, editor controls and
  formatting, a shortened 520px viewport while editing, phone board menus,
  a vertically shifted visual viewport while editing, touch status changes,
  the phone date picker, and accessibility. Focused
  320px/390px checks pass in Chromium and WebKit; WebKit uses Playwright's
  iPhone 13 device profile (including mobile mode, touch, and device pixel
  ratio).
- The Kanban pinch-zoom regression check and axe scan pass in both Chromium and
  iPhone-profile WebKit at 320px and 390px. TypeScript, all 106 `BoardView`
  unit tests, and the production build pass after the CSS change.
- A card-editor target audit found date-clear and label-remove controls below
  44px. The new target regression and existing 320px/390px editor-layout checks
  now pass in Chromium and iPhone-profile WebKit; the 390px editor screenshot
  was visually inspected after the fix.
- The expanded card-editor audit measures every visible button, including date
  clear and selected-label removal, at 44px or larger on a phone. The production
  build, TypeScript check, and all 106 `BoardView` unit tests pass after this
  change.
- Production build passes to a temporary output directory because the existing
  `frontend/dist` output is not writable in this workspace.
- TypeScript and all 106 `BoardView` unit tests pass. The full board acceptance
  run reached 109/111; its two failures were fixture page-start timeouts in
  unrelated Gantt tests, and both passed when rerun alone.
- Generated 390px Kanban and card editor screenshots were visually inspected.
- Actual iOS Safari / Chrome on an iPhone has not been exercised from this Linux
  workspace. WebKit 26.6 was used with iPhone 13 emulation; native keyboard,
  safe-area insets, and browser chrome behavior still merit a device check.

## Working rules

- Implement each step in a reviewable change and commit it before moving on.
- Preserve existing board behavior and persisted data formats.
- Keep this plan current as findings change the implementation sequence.
