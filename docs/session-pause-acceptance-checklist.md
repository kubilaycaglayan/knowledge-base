# Session pause acceptance checklist

A running session can be paused and then resumed. Pausing records the time
worked so far as a completed session, so history, reports, and the calendar show
the real working intervals and the break stays untracked. The paused state is
server-owned: it lives on the user's tracker draft, which keeps the session's
path, labels, and description. Resuming starts a new running segment with that
context, and the timer keeps counting from the paused total. Stopping a paused
session finishes it without recording more time. Each item names the tests that
cover it. Tick an item only once those tests pass.

## API

- [ ] **SP-01** `POST /api/v1/timers/pause` stops the owned running timer at the current time, records it like a stop (segments under 2 seconds are discarded), and returns the draft with `pausedSeconds` set to the session total so far. `GET /timers/current` is then `null`, and `GET /timers/draft` returns the session's path, labels, description, and `pausedSeconds`. Pausing without a running timer returns `409`.
  _Tests:_ `TimerPauseIntegrationTest.pauseRecordsTheSegmentAndKeepsTheSessionContext`, `TimerPauseIntegrationTest.pauseWithoutARunningTimerConflicts`
- [ ] **SP-02** `POST /api/v1/timers/resume` starts a new running timer with the paused context, returns it with `carriedSeconds` equal to the paused total, and clears the pause. Resuming when nothing is paused returns `409`; resuming onto a path deleted meanwhile returns `400` and keeps the pause.
  _Tests:_ `TimerPauseIntegrationTest.resumeContinuesThePausedSession`, `TimerPauseIntegrationTest.resumeRequiresAPausedSession`
- [ ] **SP-03** Pausing again after resuming adds the new segment to the total; stopping a resumed session clears the pause state.
  _Tests:_ `TimerPauseIntegrationTest.pausedTotalsAccumulateAcrossSegments`
- [ ] **SP-04** `POST /api/v1/timers/finish` ends a paused session (clears `pausedSeconds`, keeps the draft context like a stop) and returns the draft. Editing the draft while paused keeps the pause. Starting a new timer with `POST /timers` drops the pause. Finishing without a paused session returns `409`.
  _Tests:_ `TimerPauseIntegrationTest.finishEndsAPausedSession`, `TimerPauseIntegrationTest.draftEditsKeepThePauseAndANewStartDropsIt`
- [ ] **SP-05** Pause state is per user: another user cannot see, resume, or finish it. Pause, resume, and finish publish timer WebSocket events (`timer: null` on pause and finish).
  _Tests:_ `TimerPauseIntegrationTest.pauseIsScopedToItsOwner`, `TimerPauseIntegrationTest.pauseAndResumePublishTimerEvents`
- [ ] **SP-06** Migration `V51__session_pause.sql` adds `time_entry.carried_seconds` and `tracker_draft.paused_seconds` on PostgreSQL.
  _Tests:_ smoke `run-smoke-tests.sh` (Flyway on PostgreSQL plus a pause/resume/finish round trip)

## Web

- [ ] **SP-07** While a session runs, the tracker bar shows a Pause button beside Stop. Pausing freezes the clock at the session total and shows “Paused”, a Resume (play) button, and Stop.
  _Tests:_ `timer.test.ts` "pauses the running session and keeps its context", `FloatingTimeTracker.test.ts` "shows pause while running and resume while paused"
- [ ] **SP-08** Resume continues the clock from the paused total (`carriedSeconds` plus the new segment's elapsed time). Stop while paused finishes the session and clears the tracker form.
  _Tests:_ `timer.test.ts` "resumes a paused session and counts on from its total", `timer.test.ts` "finishes a paused session with stop"
- [ ] **SP-09** A pause, resume, or finish made in another tab or client shows up through the timer socket or REST reconciliation without clearing the paused context.
  _Tests:_ `timer.test.ts` "picks up a pause made elsewhere"
- [ ] **SP-10** Cmd/Ctrl+Enter in the description resumes a paused session.
  _Tests:_ `FloatingTimeTracker.test.ts` "resumes a paused session with Cmd+Enter"
- [ ] **SP-11** `docs/api.md` documents pause, resume, and finish; the roadmap notes that iOS and the Chrome extension do not show the pause yet.
