-- Reports select entries that started before the window and ended after it.
-- Keep a second access path for the ended_at side of that overlap predicate;
-- the existing started_at index serves the other side.
create index time_entry_user_ended_active_idx
    on time_entry(user_id, ended_at)
    where deleted_at is null;
