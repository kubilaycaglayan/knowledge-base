alter table time_entry add column deleted_at timestamptz;

create index time_entry_user_active_started_idx
    on time_entry(user_id, started_at desc)
    where deleted_at is null;
