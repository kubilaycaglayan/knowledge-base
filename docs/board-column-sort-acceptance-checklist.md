# Board column sort acceptance checklist

Each Kanban status column has a card sort. It is `MANUAL` (drag order, the
default) or `PRIORITY` (Urgent, High, Medium, Low, with manual order breaking
ties). The sort is stored on the status, so it follows the user across devices,
and the server applies it to card pages so dense, lazily loaded columns stay
correct. Each item names the tests that cover it. Tick an item only once those
tests pass.

## API

- [x] **CS-01** Status views include `cardSort`. Migration `V46__board_status_card_sort.sql` adds it as `MANUAL` for existing and new statuses.
  _Tests:_ `BoardColumnSortIntegrationTest.statusesDefaultToManualSort`, smoke `run-smoke-tests.sh` (Flyway on PostgreSQL)
- [x] **CS-02** `PUT /boards/{id}/statuses/{statusId}/sort {"cardSort":"PRIORITY"|"MANUAL"}` stores the column's sort and returns the status. An unknown value returns `400`. Another user's board returns `404`, and an archived board is rejected like other status mutations.
  _Tests:_ `BoardColumnSortIntegrationTest.statusSortCanBeSetAndCleared`, `BoardColumnSortIntegrationTest.statusSortRejectsUnknownValuesAndForeignBoards`
- [x] **CS-03** In a `PRIORITY` column, `GET /boards/{id}/cards/page` returns cards Urgent, High, Medium, Low, with position breaking ties. Following `nextCursor` across pages returns every card once, in that order. `MANUAL` columns keep position order.
  _Tests:_ `BoardColumnSortIntegrationTest.priorityPagesOrderByPriorityThenPosition`, `BoardColumnSortIntegrationTest.priorityPagesWalkEveryCardOnce`

## Web

- [x] **CS-04** Each column header has a "Sort by priority" toggle button (`aria-pressed`, with a different icon when on). Toggling it saves the sort and reloads that column from the first page.
  _Tests:_ `BoardView.test.ts` "toggles a column's priority sort and reloads the column", `board.acceptance.test.mjs` "sorts a column by priority from its header"
- [x] **CS-05** A priority-sorted column shows its loaded cards by priority and re-sorts when a card's priority changes in the editor.
  _Tests:_ `BoardView.test.ts` "shows a priority-sorted column in priority order"
- [x] **CS-06** In a priority-sorted column, dragging a card onto another card in the same column and Alt+Arrow keyboard reordering leave its position alone. Moving cards into or out of the column still works.
  _Tests:_ `BoardView.test.ts` "does not reorder within a priority-sorted column"
- [x] **CS-07** `docs/api.md` documents `cardSort` and the sort endpoint.
