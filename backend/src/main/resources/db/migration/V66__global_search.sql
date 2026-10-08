-- Global search (GET /search) matches substrings and near-miss spellings with
-- pg_trgm. Each searched column gets a trigram index on its lower-cased value,
-- which serves both LIKE '%term%' and the word-similarity operator (<%).

-- Board card bodies are Tiptap JSON; search reads a derived plain-text copy so
-- formatting keys never match. V67 fills it for existing cards.
alter table board_cards add column body_text text not null default '';

create index note_content_text_search_trgm_idx
    on note using gin (lower(coalesce(content_text, '')) gin_trgm_ops);
create index path_description_search_trgm_idx
    on path using gin (lower(coalesce(description, '')) gin_trgm_ops);
create index time_entry_description_search_trgm_idx
    on time_entry using gin (lower(coalesce(description, '')) gin_trgm_ops);
create index logs_body_search_trgm_idx on logs using gin (lower(body) gin_trgm_ops);
create index labels_name_search_trgm_idx on labels using gin (lower(name) gin_trgm_ops);
create index boards_name_search_trgm_idx on boards using gin (lower(name) gin_trgm_ops);
create index board_cards_title_search_trgm_idx
    on board_cards using gin (lower(title) gin_trgm_ops);
create index board_cards_body_text_search_trgm_idx
    on board_cards using gin (lower(body_text) gin_trgm_ops);
create index daily_record_note_search_trgm_idx
    on daily_record using gin (lower(coalesce(note, '')) gin_trgm_ops);
