alter table note add column pinned_at timestamptz;
alter table path add column pinned_at timestamptz;
alter table boards add column pinned_at timestamptz;

-- Pinning records pinned_at and drops the manual slot, so a newly pinned item
-- sorts after every pinned item already placed. Items pinned before this
-- migration keep a null pinned_at and their existing order.
