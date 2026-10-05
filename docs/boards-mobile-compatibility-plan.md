# Boards mobile compatibility plan

## Goal

Make the Boards page, Kanban view, and card editor usable at iOS Safari and
Chrome mobile viewport sizes, including touch interaction, the software
keyboard, safe areas, and narrow screens.

## Steps

1. **Audit current behavior** — inspect the board layout, editing flows, and
   existing tests; record concrete layout and input constraints.
2. **Kanban on phones** — make horizontal column navigation and vertical card
   scrolling work predictably with touch, keep controls reachable, and avoid
   viewport-height assumptions that break when browser chrome or the keyboard
   changes size.
3. **Card editor on phones** — use the available visual viewport and safe areas,
   keep title/body/footer controls reachable while the keyboard is open, and
   ensure fields do not trigger iOS zoom or become clipped.
4. **Responsive controls and touch targets** — check board tabs, column actions,
   metadata pickers, date picker, and card actions at narrow widths; retain
   keyboard access and visible focus.
5. **Verify and document** — add/update focused responsive behavior tests, run
   the frontend tests and build, and exercise the relevant screens at iOS and
   Chrome mobile viewport sizes where the local browser environment permits.

## Working rules

- Implement each step in a reviewable change and commit it before moving on.
- Preserve existing board behavior and persisted data formats.
- Keep this plan current as findings change the implementation sequence.
