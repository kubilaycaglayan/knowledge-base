alter table path add column pinned boolean not null default false;
alter table path add column sort_order bigint;

-- A null order preserves the existing recent-activity ordering until a user
-- explicitly reorders paths. Reordering assigns an order to the full list.
