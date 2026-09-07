alter table note add column deleted_at timestamptz;

create index note_user_active_updated_idx
    on note (user_id, updated_at desc, id desc)
    where deleted_at is null;

create index note_deleted_at_idx on note (deleted_at)
    where deleted_at is not null;
