-- Per-line edit times for note and board card bodies: a JSON array of
-- {"h": line hash, "t": ISO instant}, one entry per body line. NULL means
-- every line dates from the row's updated_at.
ALTER TABLE note ADD COLUMN line_edits TEXT;
ALTER TABLE board_cards ADD COLUMN line_edits TEXT;
