alter table path add column deleted_at timestamptz;

create index path_user_active_idx on path(user_id, updated_at desc) where deleted_at is null;
