alter table note add column pinned boolean not null default false;
alter table note add column sort_order bigint;

-- A null order preserves the existing recent-note ordering until a user reorders notes.
