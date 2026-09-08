# Web workspace design

Knowledge Base uses the approved Overview as the visual reference for all web
pages, including authentication. Keep its 1200px content width, 26px page headings,
12–14px supporting text, compact 36–40px controls, 44px mobile targets, and 4px
control corners. Group related content with spacing and thin borders. Use filled
surfaces for controls, data grids, and dialogs; ordinary lists are flat rows.

`frontend/src/theme.css` owns semantic light/dark tokens. `style.css` owns shared
typography and controls, `dashboard-shell.css` owns navigation, and `extra.css`
contains page layouts. The overview's scoped stylesheet retains its approved
layout. Vuetify's theme definitions mirror the semantic palette for teleported
menus; the date picker and charts consume the shared theme. User-selected path
and calendar-label colors remain data and are preserved in both themes.

The header's Dark mode toggle is available before and after sign-in. Preference
is stored locally as `knowledge-base-theme`; absent a valid value, the first page
load follows `prefers-color-scheme`. The same-origin blocking `/theme.js` chooses
the theme before application rendering and is compatible with the existing CSP.
Storage failures leave the current session usable. No account preference API,
database migration, or server behavior changed.

Keyboard focus uses a 2px semantic focus color with a small offset. Ordinary mouse
focus does not show a ring. Shared dialogs contain Tab focus and restore focus to
the trigger on close. Avoid overriding focus with page-specific outline removal.

See [testing.md](testing.md) for the browser review command and evidence format.
