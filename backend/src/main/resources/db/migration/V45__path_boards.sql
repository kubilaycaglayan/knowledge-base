-- Every path owns one board from birth. Custom boards keep path_id null and
-- gain pinning plus a manual tab order; hidden only applies to path boards.
alter table boards add column path_id uuid references path(id) on delete cascade;
alter table boards add column hidden boolean not null default false;
alter table boards add column pinned boolean not null default false;
alter table boards add column sort_order bigint;

create unique index boards_path_unique on boards(path_id) where path_id is not null;

create temporary table path_board_backfill on commit drop as
select gen_random_uuid() as board_id, p.id as path_id, p.user_id, left(p.name, 120) as name
from path p
where p.deleted_at is null
  and not exists (select 1 from boards b where b.path_id = p.id);

insert into boards (id, user_id, name, path_id, created_at, updated_at)
select board_id, user_id, name, path_id, now(), now() from path_board_backfill;

insert into board_statuses (id, board_id, name, position)
select gen_random_uuid(), b.board_id, s.name, s.position
from path_board_backfill b
cross join (values ('Backlog', 0), ('Pending', 1), ('In Progress', 2), ('Done', 3)) as s(name, position);
