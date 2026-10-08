# HARD-02 product follow-up register

These findings require product or test-synchronization work outside the
test-only HARD-02 milestone. The references below are repository-local tracking
IDs; they are not claims that an external issue has been filed.

| Reference | Finding | Evidence | State |
| --- | --- | --- | --- |
| `KB-HARD02-01` | Fixed timer/dashboard shell overlaps archive navigation and footer targets at phone width; desktop footer hit testing also finds the dashboard shell over the target. | [Desktop Chromium capture](runs/2026-10-08-d2cda77-desktop-chromium-board-resilience.md), [mobile Chromium capture](runs/2026-10-08-d2cda77-mobile-chromium-board-resilience.md) | Reproduced; product root cause and fix not yet investigated. |
| `KB-HARD02-02` | More boards control is unavailable during the board/view-switch journey at phone width. | [Mobile Chromium capture](runs/2026-10-08-d2cda77-mobile-chromium-board-resilience.md) | Reproduced; responsive state root cause and fix not yet investigated. |
| `KB-HARD02-03` | Gantt card locator detached while scrolling in one phone-size run; the next capture-enabled run did not reproduce it. | [Initial mobile Chromium report](runs/2026-10-08-63cf4f3-mobile-chromium-board-resilience.md) and [follow-up](runs/2026-10-08-d2cda77-mobile-chromium-board-resilience.md) | Intermittent; determine whether this is test synchronization or application rerender behavior before changing the assertion. |

The historical WebKit caret and timer-request findings, session-tracker
fixture timeouts, and two incomplete-transcript board failures remain in the
HARD-02 investigation table as insufficient evidence. Their old raw artifacts
were not retained. Do not infer causes from the new Chromium runs.
