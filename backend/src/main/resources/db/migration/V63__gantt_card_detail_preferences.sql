ALTER TABLE user_preferences
  ADD COLUMN board_gantt_show_priority BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN board_gantt_show_status BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN board_gantt_show_path BOOLEAN NOT NULL DEFAULT FALSE;
