# Calendar label picker acceptance checklist

The Calendar page's “New label” input becomes an “Add or create label” picker.
It searches every label the user owns, not only the ones shown in Calendar,
so any label can be put on a day. The Labels list under the note still shows
only labels with the `CALENDAR` scope. Picking an existing label never changes
its visibility; creating a new label from the picker makes it visible
everywhere, Calendar included. Each item names the tests that cover it. Tick
an item only once those tests pass.

## API

- [x] **CP-01** `PUT /calendar/days/{date}` and `PUT /calendar/days/range` accept any label the user owns, whether or not it has the `CALENDAR` scope, and do not change that label's scopes. `GET /calendar/days` returns those assignments.
  _Tests:_ `CalendarLabelPickerIntegrationTest.dayAcceptsAnOwnedLabelHiddenFromCalendarWithoutChangingItsScopes`, `CalendarLabelPickerIntegrationTest.rangeAcceptsAnOwnedLabelHiddenFromCalendar`, `CalendarServiceTest.replaceDayAcceptsAnOwnedLabelWithoutTheCalendarScope`
- [x] **CP-02** Another user's label is still rejected with `404` on single-day and range saves.
  _Tests:_ `CalendarLabelPickerIntegrationTest.anotherUsersLabelIsStillRejected`, `CrossUserIsolationIntegrationTest`
- [x] **CP-13** A label's `CALENDAR` scope can be removed even while calendar days use it; the days keep the label, which then shows only as a chip in the picker. `NOTE`, `TIME_ENTRY`, and `LOG` stay guarded while in use.
  _Tests:_ `CalendarLabelPickerIntegrationTest.aCalendarLabelUsedOnDaysCanBeHiddenFromCalendar`, `LabelManagementServiceTest.removesTheCalendarScopeFromALabelUsedOnCalendarDays`, `LabelManagementServiceTest.refusesRemovingAUsedScope`, `scripts/run-smoke-tests.sh` (“Smoke hide”)

## Web

- [x] **CP-03** The Labels list under the note still lists only `CALENDAR`-scoped labels; a label hidden from Calendar is not listed there.
  _Tests:_ `CalendarView.test.ts` "CP-03: lists only Calendar labels under the note"
- [x] **CP-04** Below the list, an “Add or create label…” Vuetify autocomplete (multiple) searches every owned label (the full `/labels` catalog) by name, whatever its scopes. Its “Add or create label…” prompt stays visible while no chips show (for example when only listed labels are checked).
  _Tests:_ `CalendarView.test.ts` "CP-04: searches every label in the add-or-create picker", "CP-04: keeps the picker's prompt while no chips show"
- [x] **CP-05** Picking an existing label hidden from Calendar selects it for the day: it shows as a removable chip in the picker and as selected in the dropdown, it is not added to the Labels list, and no label update request is sent. Several labels can be picked. Saving sends them with the day.
  _Tests:_ `CalendarView.test.ts` "CP-05: picks labels hidden from Calendar as chips without changing them"
- [x] **CP-06** Picking a Calendar label from the dropdown checks it in the Labels list (no duplicate chip); the dropdown shows every label selected for the day, including Calendar labels checked in the list.
  _Tests:_ `CalendarView.test.ts` "CP-06: keeps Calendar labels in the list and the dropdown in sync"
- [x] **CP-07** Removing a chip (its close button or deselecting it in the dropdown) removes that label from the day.
  _Tests:_ `CalendarView.test.ts` "CP-07: removes a picked label from its chip"
- [x] **CP-08** When the search text matches no label name exactly (ignoring case), the dropdown offers “Create “<text>”” (Enter or click). Creating posts the trimmed name with the chosen new-label color and every scope (`NOTE`, `CALENDAR`, `TIME_ENTRY`, `LOG`, `BOARD`), selects the new label for the day, and lists it under Labels. Typing an existing name offers that label instead of a duplicate. A failed create shows an error.
  _Tests:_ `CalendarView.test.ts` "CP-08: creates a label visible everywhere from the picker", "CP-08: creates a label from the keyboard Enter key", "CP-08: offers the existing label instead of creating a duplicate", "CP-08: shows an error when creating a label fails"
- [x] **CP-09** A day's saved labels that are hidden from Calendar show as chips when the day is selected, and the calendar grid colors them from the catalog (falling back to the saved assignment color).
  _Tests:_ `CalendarView.test.ts` "CP-09: shows a saved day's hidden labels as chips"
- [x] **CP-10** The empty state reads “Add or create a label below to begin.” when no Calendar labels exist.
  _Tests:_ `CalendarView.test.ts` "shows the empty-label guidance when no labels exist"
- [x] **CP-12** Checking or unchecking a label in the Labels list never resizes its row: the day-portion select keeps its slot (hidden, disabled, and `aria-hidden` while unchecked) and stays on the same line on phones.
  _Tests:_ `CalendarView.test.ts` "keeps each label row's layout when a label is checked or unchecked"; Playwright row measurements at 1280×900 and 390×844 against the dev app

## Docs and smoke

- [x] **CP-11** `docs/api.md`, the roadmap, and the smoke test describe/cover assigning a label hidden from Calendar to a calendar day.
  _Tests:_ `scripts/run-smoke-tests.sh` (calendar day with a note-created label; passed in the full-stack smoke)
