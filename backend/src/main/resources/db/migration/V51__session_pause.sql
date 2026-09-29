-- A paused session keeps its total on the tracker draft; each resumed segment
-- carries the earlier segments' total so clients can show the session clock.
ALTER TABLE tracker_draft
  ADD COLUMN paused_seconds BIGINT CHECK (paused_seconds >= 0);

ALTER TABLE time_entry
  ADD COLUMN carried_seconds BIGINT NOT NULL DEFAULT 0 CHECK (carried_seconds >= 0);
