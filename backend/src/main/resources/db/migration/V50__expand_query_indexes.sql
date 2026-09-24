-- Support user-scoped cleanup of records imported in a single batch.
create index path_user_import_batch_idx on path(user_id, import_batch_id);
create index note_user_import_batch_idx on note(user_id, import_batch_id);
create index time_entry_user_import_batch_idx on time_entry(user_id, import_batch_id);
create index item_event_user_import_batch_idx on item_event(user_id, import_batch_id);
create index daily_record_user_import_batch_idx on daily_record(user_id, import_batch_id);
create index labels_user_import_batch_idx on labels(user_id, import_batch_id);
create index logs_user_import_batch_idx on logs(user_id, import_batch_id);

-- Support activity lookups by their associated timer entry and path.
create index item_event_time_entry_idx on item_event(time_entry_id);
create index item_event_user_path_occurred_idx
    on item_event(user_id, path_id, occurred_at desc);

-- The primary keys on these association tables are ordered by the owning
-- record, so add reverse lookup indexes for label, path, and card queries.
create index note_label_label_note_idx on note_label(label_id, note_id);
create index board_card_labels_label_card_idx on board_card_labels(label_id, card_id);
create index board_card_paths_path_card_idx on board_card_paths(path_id, card_id);
