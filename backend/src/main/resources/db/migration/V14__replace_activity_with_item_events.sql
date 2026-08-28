create table item_event (
    id uuid primary key,
    user_id uuid not null references app_user(id) on delete cascade,
    path_id uuid references path(id) on delete set null,
    item_id uuid references item(id) on delete set null,
    time_entry_id uuid references time_entry(id) on delete cascade,
    type varchar(40) not null,
    title varchar(240) not null,
    detail text,
    occurred_at timestamptz not null,
    import_batch_id uuid references import_batch(id) on delete set null
);

insert into item_event (id, user_id, path_id, item_id, time_entry_id, type, title, detail, occurred_at, import_batch_id)
select id, user_id, path_id, item_id, time_entry_id, type, title, detail, occurred_at, import_batch_id
from activity;

alter table note add column time_entry_id uuid references time_entry(id) on delete set null;

update note n
set time_entry_id = a.time_entry_id
from activity a
where n.activity_id = a.id
  and a.time_entry_id is not null;

-- Preserve notes attached to legacy activity rows as item context when no
-- dedicated replacement record exists.
update note n
set item_id = a.item_id,
    path_id = null
from activity a
where n.activity_id = a.id
  and n.time_entry_id is null
  and a.item_id is not null;

alter table note drop constraint if exists note_target;
alter table note drop constraint if exists note_activity_fk;
alter table note rename column activity_id to item_event_id;
alter table note add constraint note_target check (
    (path_id is not null)::integer
    + (item_id is not null)::integer
    + (time_entry_id is not null)::integer
    + (item_event_id is not null)::integer
    <= 1
);

create index item_event_user_occurred_idx on item_event(user_id, occurred_at desc);
create index item_event_item_occurred_idx on item_event(item_id, occurred_at desc);

alter table note add constraint note_item_event_fk foreign key (item_event_id) references item_event(id) on delete set null;

drop table activity;
